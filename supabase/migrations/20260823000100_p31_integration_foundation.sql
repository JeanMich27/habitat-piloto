-- P3.1: contratos versionados, outbox, idempotencia, credenciales M2M y webhooks.
-- Todo es aditivo y los secretos recuperables viven exclusivamente en Vault.
begin;

alter table public.integration_events
  add column if not exists event_version integer not null default 1,
  add column if not exists occurred_at timestamptz not null default now(),
  add column if not exists actor_id text,
  add column if not exists correlation_id uuid not null default gen_random_uuid(),
  add column if not exists causation_id uuid;

alter table public.integration_events
  add constraint integration_events_version_valida check (event_version > 0);

create index if not exists integration_events_correlacion_idx
  on public.integration_events (agencia_id, correlation_id, occurred_at desc);

comment on table public.integration_events is
  'Outbox transaccional append-only. Los triggers la escriben en la misma transacción que la entidad.';

create table public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z0-9_-]{1,40}$'),
  name text not null check (length(name) between 1 and 120),
  key_prefix text not null,
  secret_hash text not null,
  permissions text[] not null default '{}'::text[],
  enabled boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (provider, key_prefix),
  check (not enabled or revoked_at is null)
);

create table public.integration_idempotency (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id) on delete cascade,
  provider text not null,
  external_event_id text not null check (length(external_event_id) between 1 and 200),
  command_type text not null,
  correlation_id uuid not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  response jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (agencia_id, provider, external_event_id)
);

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  url text not null check (url ~ '^https://[^[:space:]]+$'),
  signing_secret_id uuid not null,
  enabled boolean not null default true,
  event_types text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.webhook_endpoints.signing_secret_id is
  'Referencia a vault.secrets; el secreto nunca es seleccionable desde el cliente.';

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id) on delete cascade,
  event_id uuid not null references public.integration_events(id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  response_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  unique (event_id, endpoint_id)
);

create index webhook_deliveries_pending_idx
  on public.webhook_deliveries (next_attempt_at, created_at)
  where status = 'pending';

create table public.integration_logs (
  id bigint generated always as identity primary key,
  agencia_id text not null references public.agencias(id) on delete cascade,
  provider text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  event_type text,
  entity_id text,
  result text not null check (result in ('accepted', 'succeeded', 'rejected', 'retrying', 'failed')),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  correlation_id uuid not null,
  error_summary text,
  created_at timestamptz not null default now()
);

create index integration_logs_trace_idx
  on public.integration_logs (agencia_id, correlation_id, created_at);

alter table public.integration_credentials enable row level security;
alter table public.integration_idempotency enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.integration_logs enable row level security;

revoke all on public.integration_credentials, public.integration_idempotency,
  public.webhook_endpoints, public.webhook_deliveries, public.integration_logs
  from public, anon, authenticated;
grant all on public.integration_credentials, public.integration_idempotency,
  public.webhook_endpoints, public.webhook_deliveries, public.integration_logs
  to service_role;

-- El broker puede auditar metadatos de su tenant, nunca hashes ni secretos.
create policy webhook_deliveries_broker_select on public.webhook_deliveries
  for select to authenticated using (
    agencia_id = (select public.mi_agencia_id()) and (select public.es_broker())
  );
create policy integration_logs_broker_select on public.integration_logs
  for select to authenticated using (
    agencia_id = (select public.mi_agencia_id()) and (select public.es_broker())
  );
grant select on public.webhook_deliveries, public.integration_logs to authenticated;

create or replace function public.integration_correlation_id()
returns uuid language plpgsql stable set search_path = public as $$
declare v_value text;
begin
  v_value := nullif(current_setting('app.correlation_id', true), '');
  if v_value is not null then return v_value::uuid; end if;
  return gen_random_uuid();
exception when invalid_text_representation then
  return gen_random_uuid();
end;
$$;

create or replace function public.integration_actor_id()
returns text language sql stable security definer set search_path = public as $$
  select case when coalesce(auth.role(), '') = 'authenticated' then public.mi_usuario_id() else null end;
$$;

revoke execute on function public.integration_correlation_id() from public, anon, authenticated;
revoke execute on function public.integration_actor_id() from public, anon, authenticated;

-- Genera una API key una sola vez. En reposo solo conserva SHA-256 y prefijo.
create or replace function public.provision_integration_credential(
  p_agencia_id text, p_provider text, p_name text, p_permissions text[]
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text := encode(gen_random_bytes(32), 'hex');
  v_prefix text := encode(gen_random_bytes(6), 'hex');
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode = '42501'; end if;
  if not exists (select 1 from public.agencias where id = p_agencia_id) then
    raise exception 'Agencia inexistente' using errcode = '23503';
  end if;
  insert into public.integration_credentials
    (agencia_id, provider, name, key_prefix, secret_hash, permissions)
  values
    (p_agencia_id, p_provider, p_name, v_prefix, encode(digest(v_secret, 'sha256'), 'hex'), p_permissions)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'api_key', v_prefix || '.' || v_secret);
end;
$$;

create or replace function public.revoke_integration_credential(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode = '42501'; end if;
  update public.integration_credentials set enabled = false, revoked_at = now() where id = p_id and enabled;
  return found;
end;
$$;

-- Crea el endpoint y devuelve el secreto una sola vez; Vault conserva el valor recuperable.
create or replace function public.provision_webhook_endpoint(
  p_agencia_id text, p_name text, p_url text, p_event_types text[] default '{}'::text[]
) returns jsonb language plpgsql security definer set search_path = public, vault, extensions as $$
declare
  v_secret text := encode(gen_random_bytes(32), 'hex');
  v_secret_id uuid;
  v_endpoint_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode = '42501'; end if;
  v_secret_id := vault.create_secret(v_secret, null, 'Firma de webhook saliente de HABITAT');
  insert into public.webhook_endpoints (agencia_id, name, url, signing_secret_id, event_types)
  values (p_agencia_id, p_name, p_url, v_secret_id, p_event_types)
  returning id into v_endpoint_id;
  return jsonb_build_object('id', v_endpoint_id, 'signing_secret', v_secret);
end;
$$;

revoke execute on function public.provision_integration_credential(text,text,text,text[]) from public, anon, authenticated;
revoke execute on function public.revoke_integration_credential(uuid) from public, anon, authenticated;
revoke execute on function public.provision_webhook_endpoint(text,text,text,text[]) from public, anon, authenticated;
grant execute on function public.provision_integration_credential(text,text,text,text[]) to service_role;
grant execute on function public.revoke_integration_credential(uuid) to service_role;
grant execute on function public.provision_webhook_endpoint(text,text,text,text[]) to service_role;

-- Encola una entrega por endpoint suscrito dentro de la misma transacción del evento.
create or replace function public.route_integration_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.event_type <> 'webhook.delivery.failed' then
    insert into public.webhook_deliveries (agencia_id, event_id, endpoint_id)
    select new.agencia_id, new.id, endpoint.id
      from public.webhook_endpoints endpoint
     where endpoint.agencia_id = new.agencia_id
       and endpoint.enabled
       and (cardinality(endpoint.event_types) = 0 or new.event_type = any(endpoint.event_types));
  end if;
  if not found then
    update public.integration_events
       set status = 'processed', processed_at = now()
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists integration_events_route on public.integration_events;
create trigger integration_events_route after insert on public.integration_events
for each row execute function public.route_integration_event();
revoke execute on function public.route_integration_event() from public, anon, authenticated;

-- Catálogo P3.1 emitido transaccionalmente. Los payloads excluyen PII, BANT y notas.
create or replace function public.registrar_eventos_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_event_id uuid; v_task_id uuid; v_correlation uuid := public.integration_correlation_id();
begin
  if tg_op = 'INSERT' then
    if coalesce(new.es_directorio, false) then return new; end if;
    insert into public.integration_events
      (agencia_id,event_type,event_version,entity_type,entity_id,payload,actor_id,correlation_id)
    values (new.agencia_id,'lead.created',1,'lead',new.id,
      jsonb_strip_nulls(jsonb_build_object('lead_id',new.id,'property_id',new.interes_propiedad_id,
        'assigned_agent_id',new.asesor_id,'source',new.canal_entrada,'created_at',new.creado)),
      public.integration_actor_id(),v_correlation) returning id into v_event_id;
    if new.asesor_id is not null then
      insert into public.tareas (agencia_id,lead_id,asesor_id,titulo,vence_en,metadata)
      values (new.agencia_id,new.id,new.asesor_id,'Contactar lead',now()+interval '1 day',
        jsonb_build_object('source_event_id',v_event_id)) returning id into v_task_id;
      insert into public.integration_events
        (agencia_id,event_type,event_version,entity_type,entity_id,payload,correlation_id,causation_id)
      values (new.agencia_id,'task.created',1,'task',v_task_id::text,
        jsonb_build_object('task_id',v_task_id,'lead_id',new.id,'assigned_agent_id',new.asesor_id),
        v_correlation,v_event_id);
    end if;
    return new;
  end if;

  insert into public.integration_events
    (agencia_id,event_type,event_version,entity_type,entity_id,payload,actor_id,correlation_id)
  values (new.agencia_id,'lead.updated',1,'lead',new.id,
    jsonb_build_object('lead_id',new.id,'updated_at',now()),public.integration_actor_id(),v_correlation);

  if new.asesor_id is distinct from old.asesor_id then
    insert into public.integration_events
      (agencia_id,event_type,event_version,entity_type,entity_id,payload,actor_id,correlation_id)
    values (new.agencia_id,'lead.assigned',1,'lead',new.id,
      jsonb_strip_nulls(jsonb_build_object('lead_id',new.id,'previous_agent_id',old.asesor_id,
        'assigned_agent_id',new.asesor_id)),public.integration_actor_id(),v_correlation);
    if new.asesor_id is not null and not exists (
      select 1 from public.tareas where lead_id = new.id and estado = 'pendiente'
    ) then
      insert into public.tareas (agencia_id,lead_id,asesor_id,titulo,vence_en)
      values (new.agencia_id,new.id,new.asesor_id,'Contactar lead',now()+interval '1 day');
    end if;
  end if;
  if new.etapa is distinct from old.etapa then
    insert into public.integration_events
      (agencia_id,event_type,event_version,entity_type,entity_id,payload,actor_id,correlation_id)
    values (new.agencia_id,'lead.stage_changed',1,'lead',new.id,
      jsonb_build_object('lead_id',new.id,'previous_stage',old.etapa,'stage',new.etapa),
      public.integration_actor_id(),v_correlation);
  end if;
  return new;
end;
$$;

drop trigger if exists leads_registrar_eventos on public.leads;
create trigger leads_registrar_eventos after insert or update on public.leads
for each row execute function public.registrar_eventos_lead();

create or replace function public.registrar_eventos_propiedad()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_correlation uuid := public.integration_correlation_id();
begin
  insert into public.integration_events
    (agencia_id,event_type,event_version,entity_type,entity_id,payload,actor_id,correlation_id)
  values (new.agencia_id,case when tg_op='INSERT' then 'property.created' else 'property.updated' end,
    1,'property',new.id,jsonb_build_object('property_id',new.id,'status',new.estatus),
    public.integration_actor_id(),v_correlation);
  if tg_op='UPDATE' and new.estatus is distinct from old.estatus then
    insert into public.integration_events
      (agencia_id,event_type,event_version,entity_type,entity_id,payload,actor_id,correlation_id)
    values (new.agencia_id,'property.status_changed',1,'property',new.id,
      jsonb_build_object('property_id',new.id,'previous_status',old.estatus,'status',new.estatus),
      public.integration_actor_id(),v_correlation);
  end if;
  return new;
end;
$$;
create trigger propiedades_registrar_eventos after insert or update on public.propiedades
for each row execute function public.registrar_eventos_propiedad();

create or replace function public.registrar_eventos_cita()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_row public.citas%rowtype; v_type text; v_correlation uuid := public.integration_correlation_id();
begin
  v_row := case when tg_op='DELETE' then old else new end;
  v_type := case
    when tg_op='INSERT' then 'appointment.created'
    when tg_op='DELETE' or (new.estado='Cancelada' and old.estado is distinct from new.estado) then 'appointment.cancelled'
    else 'appointment.updated' end;
  insert into public.integration_events
    (agencia_id,event_type,event_version,entity_type,entity_id,payload,actor_id,correlation_id)
  values (v_row.agencia_id,v_type,1,'appointment',v_row.id,
    jsonb_strip_nulls(jsonb_build_object('appointment_id',v_row.id,'lead_id',v_row.lead_id,
      'property_id',v_row.propiedad_id,'assigned_agent_id',v_row.asesor_id,'status',v_row.estado,
      'starts_at',v_row.inicio)),public.integration_actor_id(),v_correlation);
  return v_row;
end;
$$;
create trigger citas_registrar_eventos after insert or update or delete on public.citas
for each row execute function public.registrar_eventos_cita();

create or replace function public.registrar_eventos_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  if tg_op='INSERT' then v_type := 'user.created';
  elsif new.estado_cuenta is distinct from old.estado_cuenta then v_type := 'user.status_changed';
  else return new; end if;
  insert into public.integration_events
    (agencia_id,event_type,event_version,entity_type,entity_id,payload,actor_id,correlation_id)
  values (new.agencia_id,v_type,1,'user',new.id,
    jsonb_build_object('user_id',new.id,'role',new.rol,'status',new.estado_cuenta),
    public.integration_actor_id(),public.integration_correlation_id());
  return new;
end;
$$;
create trigger usuarios_registrar_eventos after insert or update of estado_cuenta on public.usuarios
for each row execute function public.registrar_eventos_usuario();

revoke execute on function public.registrar_eventos_lead() from public, anon, authenticated;
revoke execute on function public.registrar_eventos_propiedad() from public, anon, authenticated;
revoke execute on function public.registrar_eventos_cita() from public, anon, authenticated;
revoke execute on function public.registrar_eventos_usuario() from public, anon, authenticated;

-- Autenticación + idempotencia + caso de uso, todo en una transacción PostgreSQL.
create or replace function public.process_integration_lead_command(
  p_provider text, p_api_key text, p_external_event_id text, p_correlation_id uuid, p_input jsonb
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_prefix text := split_part(p_api_key,'.',1);
  v_secret text := split_part(p_api_key,'.',2);
  v_credential public.integration_credentials;
  v_existing public.integration_idempotency;
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  select * into v_credential from public.integration_credentials
   where provider=p_provider and key_prefix=v_prefix and enabled and revoked_at is null
     and (expires_at is null or expires_at > now())
     and secret_hash=encode(digest(v_secret,'sha256'),'hex');
  if not found or not ('leads.write'=any(v_credential.permissions)) then
    return jsonb_build_object('ok',false,'error_code','unauthorized');
  end if;
  update public.integration_credentials set last_used_at=now() where id=v_credential.id;

  insert into public.integration_idempotency
    (agencia_id,provider,external_event_id,command_type,correlation_id)
  values (v_credential.agencia_id,p_provider,p_external_event_id,'CreateLead',p_correlation_id)
  on conflict (agencia_id,provider,external_event_id) do nothing;
  if not found then
    select * into v_existing from public.integration_idempotency
     where agencia_id=v_credential.agencia_id and provider=p_provider and external_event_id=p_external_event_id;
    return coalesce(v_existing.response,jsonb_build_object('ok',false,'error_code',v_existing.error_code))
      || jsonb_build_object('idempotent_replay',true);
  end if;

  perform set_config('app.correlation_id',p_correlation_id::text,true);
  begin
    v_result := public.crear_o_relacionar_lead(p_input,v_credential.agencia_id);
    v_result := jsonb_build_object('ok',true,'data',v_result,'idempotent_replay',false);
    update public.integration_idempotency set status='completed',response=v_result,completed_at=now()
     where agencia_id=v_credential.agencia_id and provider=p_provider and external_event_id=p_external_event_id;
    insert into public.integration_logs
      (agencia_id,provider,direction,event_type,entity_id,result,correlation_id)
    values (v_credential.agencia_id,p_provider,'inbound','CreateLead',v_result#>>'{data,lead_id}',
      'accepted',p_correlation_id);
    return v_result;
  exception when others then
    update public.integration_idempotency set status='failed',error_code=sqlstate,
      response=jsonb_build_object('ok',false,'error_code',sqlstate),completed_at=now()
     where agencia_id=v_credential.agencia_id and provider=p_provider and external_event_id=p_external_event_id;
    insert into public.integration_logs
      (agencia_id,provider,direction,event_type,result,correlation_id,error_summary)
    values (v_credential.agencia_id,p_provider,'inbound','CreateLead','rejected',p_correlation_id,
      sqlstate);
    return jsonb_build_object('ok',false,'error_code',sqlstate);
  end;
end;
$$;

revoke execute on function public.process_integration_lead_command(text,text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.process_integration_lead_command(text,text,text,uuid,jsonb) to service_role;

create or replace function public.record_integration_sync_result(
  p_agencia_id text, p_provider text, p_succeeded boolean, p_correlation_id uuid,
  p_summary jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  if not exists (select 1 from public.agencias where id=p_agencia_id) then
    raise exception 'Agencia inexistente' using errcode='23503';
  end if;
  insert into public.integration_events
    (agencia_id,event_type,event_version,entity_type,entity_id,payload,correlation_id)
  values (p_agencia_id,case when p_succeeded then 'integration.sync.completed' else 'integration.sync.failed' end,
    1,'integration',p_provider,p_summary,p_correlation_id) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.record_integration_sync_result(text,text,boolean,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.record_integration_sync_result(text,text,boolean,uuid,jsonb) to service_role;

create or replace function public.claim_webhook_deliveries(p_limit integer default 20)
returns table (
  delivery_id uuid, endpoint_url text, signing_secret text, event_id uuid,
  event_type text, event_version integer, occurred_at timestamptz, agency_id text,
  entity_type text, entity_id text, payload jsonb, correlation_id uuid, causation_id uuid, attempt integer
) language sql security definer set search_path = public, vault as $$
  with exhausted as (
    update public.webhook_deliveries delivery
       set status='failed',last_error='Worker lease expired after final attempt'
     where delivery.status='processing' and delivery.attempts >= 5
       and delivery.last_attempt_at < now()-interval '5 minutes'
    returning delivery.*
  ), exhausted_parents as (
    update public.integration_events event
       set status='failed',processed_at=now(),last_error='Una entrega agotó sus reintentos'
     where event.id in (select event_id from exhausted)
    returning event.*
  ), exhausted_events as (
    insert into public.integration_events
      (agencia_id,event_type,event_version,entity_type,entity_id,payload,correlation_id,causation_id)
    select event.agencia_id,'webhook.delivery.failed',1,'webhook',exhausted.id::text,
      jsonb_build_object('delivery_id',exhausted.id,'event_id',event.id,'endpoint_id',exhausted.endpoint_id,
        'attempts',exhausted.attempts,'reason','worker_lease_expired'),event.correlation_id,event.id
      from exhausted join exhausted_parents event on event.id=exhausted.event_id
    returning id
  ), candidates as (
    select delivery.id
      from public.webhook_deliveries delivery
      join public.webhook_endpoints endpoint on endpoint.id=delivery.endpoint_id
     where (
       (delivery.status='pending' and delivery.next_attempt_at <= now())
       or (delivery.status='processing' and delivery.last_attempt_at < now()-interval '5 minutes')
     ) and delivery.attempts < 5 and endpoint.enabled
       and (select count(*) from exhausted_events) >= 0
     order by delivery.next_attempt_at,delivery.created_at
     for update of delivery skip locked limit least(greatest(p_limit,1),100)
  ), claimed as (
    update public.webhook_deliveries delivery
       set status='processing',attempts=attempts+1,last_attempt_at=now()
      from candidates where delivery.id=candidates.id
    returning delivery.*
  )
  select claimed.id,endpoint.url,secrets.decrypted_secret,event.id,event.event_type,event.event_version,
    event.occurred_at,event.agencia_id,event.entity_type,event.entity_id,event.payload,event.correlation_id,
    event.causation_id,claimed.attempts
    from claimed
    join public.webhook_endpoints endpoint on endpoint.id=claimed.endpoint_id
    join vault.decrypted_secrets secrets on secrets.id=endpoint.signing_secret_id
    join public.integration_events event on event.id=claimed.event_id;
$$;

create or replace function public.complete_webhook_delivery(
  p_delivery_id uuid, p_outcome text, p_status integer default null,
  p_error text default null, p_retry_delay_seconds integer default null, p_duration_ms integer default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_delivery public.webhook_deliveries; v_event public.integration_events; v_endpoint public.webhook_endpoints;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'No autorizado' using errcode='42501'; end if;
  select * into v_delivery from public.webhook_deliveries where id=p_delivery_id for update;
  if not found or v_delivery.status <> 'processing' then return; end if;
  select * into v_event from public.integration_events where id=v_delivery.event_id;
  select * into v_endpoint from public.webhook_endpoints where id=v_delivery.endpoint_id;

  update public.integration_events set attempts=greatest(attempts,v_delivery.attempts) where id=v_event.id;

  if p_outcome='success' then
    update public.webhook_deliveries set status='succeeded',delivered_at=now(),response_status=p_status,last_error=null
     where id=p_delivery_id;
  elsif p_outcome='retry' and v_delivery.attempts < 5 and p_retry_delay_seconds between 1 and 86400 then
    update public.webhook_deliveries set status='pending',next_attempt_at=now()+make_interval(secs=>p_retry_delay_seconds),
      response_status=p_status,last_error=left(p_error,500) where id=p_delivery_id;
  else
    update public.webhook_deliveries set status='failed',response_status=p_status,last_error=left(p_error,500)
     where id=p_delivery_id;
    insert into public.integration_events
      (agencia_id,event_type,event_version,entity_type,entity_id,payload,correlation_id,causation_id)
    values (v_event.agencia_id,'webhook.delivery.failed',1,'webhook',p_delivery_id::text,
      jsonb_build_object('delivery_id',p_delivery_id,'event_id',v_event.id,'endpoint_id',v_endpoint.id,
        'attempts',v_delivery.attempts,'status_code',p_status),v_event.correlation_id,v_event.id);
  end if;

  insert into public.integration_logs
    (agencia_id,provider,direction,event_type,entity_id,result,duration_ms,correlation_id,error_summary)
  values (v_event.agencia_id,'webhook','outbound',v_event.event_type,v_event.entity_id,
    case p_outcome when 'success' then 'succeeded' when 'retry' then 'retrying' else 'failed' end,
    p_duration_ms,v_event.correlation_id,left(p_error,500));

  if not exists (select 1 from public.webhook_deliveries where event_id=v_event.id and status in ('pending','processing')) then
    update public.integration_events set status=case when exists (
      select 1 from public.webhook_deliveries where event_id=v_event.id and status='failed'
    ) then 'failed' else 'processed' end,processed_at=now(),last_error=case when exists (
      select 1 from public.webhook_deliveries where event_id=v_event.id and status='failed'
    ) then 'Una o más entregas agotaron sus reintentos' else null end where id=v_event.id;
  end if;
end;
$$;

revoke execute on function public.claim_webhook_deliveries(integer) from public, anon, authenticated;
revoke execute on function public.complete_webhook_delivery(uuid,text,integer,text,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_webhook_deliveries(integer) to service_role;
grant execute on function public.complete_webhook_delivery(uuid,text,integer,text,integer,integer) to service_role;

commit;
