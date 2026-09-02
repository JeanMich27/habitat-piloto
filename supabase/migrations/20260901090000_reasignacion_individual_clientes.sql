-- Reasignación individual y auditable de clientes.
-- El responsable actual puede cambiar; el asesor de origen se conserva como
-- dato neutral y no implica por sí mismo una regla de comisión.
begin;

alter table public.leads
  add column if not exists captado_por_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'leads_captado_por_id_fkey'
       and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_captado_por_id_fkey
      foreign key (captado_por_id) references public.usuarios(id) on delete set null;
  end if;
end;
$$;

-- Reconstruye primero el origen desde la bitácora existente. Sólo usa al
-- responsable actual cuando no hay evidencia histórica; en ningún caso se
-- interpreta como derecho a comisión.
-- Es un backfill técnico: no genera 1 evento externo ni incrementa la versión
-- comercial de cada uno de los clientes existentes.
alter table public.leads disable trigger leads_registrar_eventos;
alter table public.leads disable trigger leads_incrementar_version;

update public.leads lead
   set captado_por_id = coalesce(
     (
       select usuario.id
         from public.integration_events evento
         join public.usuarios usuario
           on usuario.id = nullif(evento.payload ->> 'assigned_agent_id', '')
          and usuario.agencia_id = lead.agencia_id
        where evento.agencia_id = lead.agencia_id
          and evento.entity_type = 'lead'
          and evento.entity_id = lead.id
          and evento.event_type = 'lead.created'
        order by evento.occurred_at, evento.created_at
        limit 1
     ),
     (
       select usuario.id
         from public.integration_events evento
         join public.usuarios usuario
           on usuario.id = nullif(evento.payload ->> 'previous_agent_id', '')
          and usuario.agencia_id = lead.agencia_id
        where evento.agencia_id = lead.agencia_id
          and evento.entity_type = 'lead'
          and evento.entity_id = lead.id
          and evento.event_type = 'lead.assigned'
        order by evento.occurred_at, evento.created_at
        limit 1
     ),
     lead.asesor_id
   )
 where lead.captado_por_id is null;

alter table public.leads enable trigger leads_incrementar_version;
alter table public.leads enable trigger leads_registrar_eventos;

create index if not exists leads_captado_por_idx
  on public.leads (agencia_id, captado_por_id);

create or replace function public.fijar_y_validar_captador_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.captado_por_id is null then
    new.captado_por_id := new.asesor_id;
  end if;

  if new.captado_por_id is not null and not exists (
    select 1 from public.usuarios u
     where u.id = new.captado_por_id
       and u.agencia_id = new.agencia_id
  ) then
    raise exception 'El asesor de origen no pertenece a la oficina del cliente.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_fijar_y_validar_captador on public.leads;
create trigger leads_fijar_y_validar_captador
  before insert or update of captado_por_id, agencia_id on public.leads
  for each row execute function public.fijar_y_validar_captador_lead();

create table if not exists public.lead_asignaciones (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id) on delete cascade,
  lead_id text not null references public.leads(id) on delete cascade,
  asesor_anterior_id text references public.usuarios(id) on delete set null,
  asesor_nuevo_id text not null references public.usuarios(id) on delete restrict,
  reasignado_por_id text not null references public.usuarios(id) on delete restrict,
  motivo text not null,
  creado_en timestamptz not null default now(),
  constraint lead_asignaciones_motivo_valido
    check (char_length(trim(motivo)) between 1 and 500),
  constraint lead_asignaciones_cambio_real
    check (asesor_anterior_id is distinct from asesor_nuevo_id)
);

create index if not exists lead_asignaciones_lead_idx
  on public.lead_asignaciones (agencia_id, lead_id, creado_en desc);

alter table public.lead_asignaciones enable row level security;

drop policy if exists lead_asignaciones_select_broker on public.lead_asignaciones;
create policy lead_asignaciones_select_broker
  on public.lead_asignaciones for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (select public.es_broker())
  );

revoke all on public.lead_asignaciones from anon, authenticated;
grant select on public.lead_asignaciones to authenticated;
grant all on public.lead_asignaciones to service_role;

-- Las reasignaciones manuales son datos internos. Conservamos los eventos en
-- la bitácora de integración para auditoría del broker, pero durante esta RPC
-- no creamos entregas hacia endpoints externos. El flag sólo vive durante la
-- transacción y también cubre el evento de las citas transferidas.
create or replace function public.route_integration_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.reasignacion_interna', true) = 'true'
     and new.event_type in ('lead.assigned', 'appointment.updated') then
    update public.integration_events
       set status = 'processed', processed_at = now()
     where id = new.id;
    return new;
  end if;

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

revoke execute on function public.route_integration_event() from public, anon, authenticated;

create or replace function public.reasignar_lead(
  p_lead_id text,
  p_nuevo_asesor_id text,
  p_motivo text,
  p_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agencia text := public.mi_agencia_id();
  v_actor_id text := public.mi_usuario_id();
  v_lead public.leads%rowtype;
  v_destino public.usuarios%rowtype;
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_tareas integer := 0;
  v_citas integer := 0;
  v_version integer;
  v_creado_en timestamptz := now();
  v_flag_interno_anterior text := current_setting('app.reasignacion_interna', true);
begin
  if auth.uid() is null then
    raise exception 'La sesión no es válida.' using errcode = '28000';
  end if;
  if not public.es_broker() then
    raise exception 'Solo un broker puede reasignar clientes.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_lead_id, '')), '') is null
     or nullif(trim(coalesce(p_nuevo_asesor_id, '')), '') is null
     or char_length(v_motivo) not between 1 and 500 then
    raise exception 'La reasignación requiere cliente, asesor destino y motivo.' using errcode = '22023';
  end if;

  select * into v_lead
    from public.leads
   where id = p_lead_id and agencia_id = v_agencia
   for update;
  if not found then
    raise exception 'El cliente no existe en tu oficina.' using errcode = 'P0002';
  end if;
  if p_version is not null and v_lead.version <> p_version then
    raise exception 'El cliente cambió en otra sesión. Recarga antes de reasignar.' using errcode = '40001';
  end if;
  if v_lead.asesor_id = p_nuevo_asesor_id then
    raise exception 'El cliente ya está asignado a ese asesor.' using errcode = '22023';
  end if;

  select * into v_destino
    from public.usuarios
   where id = p_nuevo_asesor_id
     and agencia_id = v_agencia
     and estado_cuenta = 'Activo'
     and rol in ('asesor_equipo', 'asesor_independiente')
   for update;
  if not found then
    raise exception 'El asesor destino no está activo en tu oficina.' using errcode = 'P0002';
  end if;

  perform set_config('app.reasignacion_interna', 'true', true);

  update public.leads
     set asesor_id = v_destino.id
   where id = v_lead.id
   returning version into v_version;

  update public.tareas
     set asesor_id = v_destino.id
   where agencia_id = v_agencia
     and lead_id = v_lead.id
     and estado = 'pendiente';
  get diagnostics v_tareas = row_count;

  update public.citas
     set asesor_id = v_destino.id
   where agencia_id = v_agencia
     and lead_id = v_lead.id
     and inicio >= v_creado_en
     and estado in ('Agendada', 'Confirmada');
  get diagnostics v_citas = row_count;

  insert into public.lead_asignaciones (
    agencia_id, lead_id, asesor_anterior_id, asesor_nuevo_id,
    reasignado_por_id, motivo, creado_en
  ) values (
    v_agencia, v_lead.id, v_lead.asesor_id, v_destino.id,
    v_actor_id, v_motivo, v_creado_en
  );

  perform set_config('app.reasignacion_interna', coalesce(v_flag_interno_anterior, ''), true);

  return jsonb_build_object(
    'lead_id', v_lead.id,
    'previous_agent_id', v_lead.asesor_id,
    'assigned_agent_id', v_destino.id,
    'version', v_version,
    'pending_tasks_transferred', v_tareas,
    'future_appointments_transferred', v_citas,
    'occurred_at', v_creado_en
  );
end;
$$;

revoke all on function public.reasignar_lead(text, text, text, integer) from public, anon;
grant execute on function public.reasignar_lead(text, text, text, integer) to authenticated;

comment on column public.leads.captado_por_id is
  'Asesor de origen registrado. Dato interno neutral; no define comisiones.';
comment on table public.lead_asignaciones is
  'Historial interno y append-only de reasignaciones de clientes, visible sólo para brokers de la oficina.';
comment on function public.reasignar_lead(text, text, text, integer) is
  'Reasigna un cliente dentro de su oficina y transfiere tareas pendientes y citas futuras en una sola transacción.';

commit;
