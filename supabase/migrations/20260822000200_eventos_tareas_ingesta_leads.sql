-- =============================================================================
-- Outbox de integración + tareas + creación transaccional de leads
-- =============================================================================
-- Esta migración es aditiva. No elimina ni reescribe datos existentes.
-- La función crear_o_relacionar_lead es el punto único para altas manuales y
-- futuras entradas de n8n. Los triggers cubren también altas que sigan llegando
-- desde sincronizaciones existentes, sin acoplarlas a ningún webhook.

begin;

alter table public.leads
  add column if not exists canal_entrada text not null default 'manual',
  add column if not exists mensaje_entrada text;

comment on column public.leads.canal_entrada is
  'Canal técnico de captura (manual, whatsapp, easybroker, importacion). No sustituye el origen comercial.';
comment on column public.leads.mensaje_entrada is
  'Último mensaje de entrada asociado al alta/relación. No contiene credenciales.';

create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id) on delete cascade,
  lead_id text references public.leads(id) on delete cascade,
  asesor_id text references public.usuarios(id) on delete set null,
  titulo text not null,
  estado text not null default 'pendiente',
  vence_en timestamptz not null,
  creada_en timestamptz not null default now(),
  completada_en timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint tareas_estado_valido check (estado in ('pendiente', 'completada', 'cancelada')),
  constraint tareas_completada_coherente check (
    (estado = 'completada' and completada_en is not null)
    or (estado <> 'completada' and completada_en is null)
  )
);

create index if not exists tareas_pendientes_asesor_idx
  on public.tareas (agencia_id, asesor_id, vence_en)
  where estado = 'pendiente';
create index if not exists tareas_lead_idx on public.tareas (lead_id);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  available_at timestamptz not null default now(),
  constraint integration_events_status_valido
    check (status in ('pending', 'processing', 'processed', 'failed')),
  constraint integration_events_attempts_valido check (attempts >= 0),
  constraint integration_events_procesado_coherente check (
    status <> 'processed' or processed_at is not null
  )
);

create index if not exists integration_events_pendientes_idx
  on public.integration_events (status, available_at, created_at)
  where status in ('pending', 'failed');
create index if not exists integration_events_entidad_idx
  on public.integration_events (agencia_id, entity_type, entity_id, created_at desc);

alter table public.tareas enable row level security;
alter table public.integration_events enable row level security;

drop policy if exists tareas_select on public.tareas;
create policy tareas_select on public.tareas for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or asesor_id = (select public.mi_usuario_id())
    )
  );

drop policy if exists tareas_insert on public.tareas;
create policy tareas_insert on public.tareas for insert to authenticated
  with check (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or asesor_id = (select public.mi_usuario_id())
    )
  );

drop policy if exists tareas_update on public.tareas;
create policy tareas_update on public.tareas for update to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and ((select public.es_broker()) or asesor_id = (select public.mi_usuario_id()))
  )
  with check (
    agencia_id = (select public.mi_agencia_id())
    and ((select public.es_broker()) or asesor_id = (select public.mi_usuario_id()))
  );

-- No existe DELETE para usuarios: cancelar conserva la trazabilidad.
-- Los eventos son append-only para el navegador. El broker puede auditarlos;
-- solo service_role (Edge Functions/n8n detrás de endpoint) cambia su estado.
drop policy if exists integration_events_select on public.integration_events;
create policy integration_events_select on public.integration_events for select to authenticated
  using (agencia_id = (select public.mi_agencia_id()) and (select public.es_broker()));

revoke all on public.tareas, public.integration_events from anon;
grant select, insert, update on public.tareas to authenticated;
grant select on public.integration_events to authenticated;
grant all on public.tareas, public.integration_events to service_role;

create or replace function public.validar_tarea_misma_agencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agencia_lead text;
  v_asesor_lead text;
  v_agencia_asesor text;
begin
  if new.lead_id is not null then
    select agencia_id, asesor_id into v_agencia_lead, v_asesor_lead
      from public.leads where id = new.lead_id;
    if v_agencia_lead is distinct from new.agencia_id then
      raise exception 'El lead no pertenece a la oficina de la tarea.' using errcode = '23503';
    end if;
    if coalesce(auth.role(), '') = 'authenticated'
       and not public.es_broker()
       and v_asesor_lead is distinct from public.mi_usuario_id() then
      raise exception 'No puedes crear una tarea para un lead ajeno.' using errcode = '42501';
    end if;
  end if;
  if new.asesor_id is not null then
    select agencia_id into v_agencia_asesor from public.usuarios where id = new.asesor_id;
    if v_agencia_asesor is distinct from new.agencia_id then
      raise exception 'El asesor no pertenece a la oficina de la tarea.' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tareas_validar_agencia on public.tareas;
create trigger tareas_validar_agencia
  before insert or update on public.tareas
  for each row execute function public.validar_tarea_misma_agencia();

revoke execute on function public.validar_tarea_misma_agencia() from public, anon, authenticated;

-- Emite eventos y crea la tarea inicial incluso si el alta provino de una
-- sincronización legacy. Los contactos de directorio no generan trabajo falso.
create or replace function public.registrar_eventos_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_event_id uuid;
  v_task_id uuid;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.es_directorio, false) then
      return new;
    end if;

    insert into public.integration_events (
      agencia_id, event_type, entity_type, entity_id, payload
    ) values (
      new.agencia_id,
      'lead.created',
      'lead',
      new.id,
      jsonb_strip_nulls(jsonb_build_object(
        'lead_id', new.id,
        'property_id', new.interes_propiedad_id,
        'assigned_agent_id', new.asesor_id,
        'source', new.canal_entrada,
        'created_at', new.creado
      ))
    ) returning id into v_event_id;

    if new.asesor_id is not null then
      insert into public.tareas (
        agencia_id, lead_id, asesor_id, titulo, vence_en, metadata
      ) values (
        new.agencia_id,
        new.id,
        new.asesor_id,
        'Contactar lead',
        now() + interval '1 day',
        jsonb_build_object('source_event_id', v_event_id)
      ) returning id into v_task_id;

      insert into public.integration_events (
        agencia_id, event_type, entity_type, entity_id, payload
      ) values (
        new.agencia_id,
        'task.created',
        'task',
        v_task_id::text,
        jsonb_build_object(
          'task_id', v_task_id,
          'lead_id', new.id,
          'assigned_agent_id', new.asesor_id,
          'due_at', now() + interval '1 day'
        )
      );
    end if;
    return new;
  end if;

  if new.asesor_id is distinct from old.asesor_id and new.asesor_id is not null then
    insert into public.integration_events (agencia_id, event_type, entity_type, entity_id, payload)
    values (
      new.agencia_id,
      'lead.assigned',
      'lead',
      new.id,
      jsonb_build_object('lead_id', new.id, 'assigned_agent_id', new.asesor_id)
    );

    v_task_id := null;
    insert into public.tareas (agencia_id, lead_id, asesor_id, titulo, vence_en)
    select new.agencia_id, new.id, new.asesor_id, 'Contactar lead', now() + interval '1 day'
     where not exists (
       select 1 from public.tareas t
        where t.lead_id = new.id and t.estado = 'pendiente'
     )
    returning id into v_task_id;

    if v_task_id is not null then
      insert into public.integration_events (
        agencia_id, event_type, entity_type, entity_id, payload
      ) values (
        new.agencia_id,
        'task.created',
        'task',
        v_task_id::text,
        jsonb_build_object(
          'task_id', v_task_id,
          'lead_id', new.id,
          'assigned_agent_id', new.asesor_id,
          'due_at', now() + interval '1 day'
        )
      );
    end if;
  end if;

  if new.etapa is distinct from old.etapa then
    v_event_type := case new.etapa
      when 'Contactado' then 'lead.contacted'
      when 'Visitado' then 'visit.completed'
      when 'Cierre' then 'deal.closed'
      else 'lead.updated'
    end;
    insert into public.integration_events (agencia_id, event_type, entity_type, entity_id, payload)
    values (
      new.agencia_id,
      v_event_type,
      'lead',
      new.id,
      jsonb_build_object('lead_id', new.id, 'previous_stage', old.etapa, 'stage', new.etapa)
    );
  end if;

  if new.bant is distinct from old.bant then
    insert into public.integration_events (agencia_id, event_type, entity_type, entity_id, payload)
    values (new.agencia_id, 'lead.profiled', 'lead', new.id, jsonb_build_object('lead_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists leads_registrar_eventos on public.leads;
create trigger leads_registrar_eventos
  after insert or update of asesor_id, etapa, bant on public.leads
  for each row execute function public.registrar_eventos_lead();

revoke execute on function public.registrar_eventos_lead() from public, anon, authenticated;

create or replace function public.registrar_eventos_tarea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'completada' and old.estado is distinct from new.estado then
    insert into public.integration_events (agencia_id, event_type, entity_type, entity_id, payload)
    values (
      new.agencia_id,
      'task.completed',
      'task',
      new.id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'task_id', new.id,
        'lead_id', new.lead_id,
        'assigned_agent_id', new.asesor_id,
        'completed_at', new.completada_en
      ))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists tareas_registrar_eventos on public.tareas;
create trigger tareas_registrar_eventos
  after update of estado on public.tareas
  for each row execute function public.registrar_eventos_tarea();

revoke execute on function public.registrar_eventos_tarea() from public, anon, authenticated;

-- Alta idempotente por identidad. Teléfono y correo pueden coincidir con una
-- fila existente; si apuntan a personas distintas, falla cerrado y exige
-- revisión humana en vez de fusionar datos incorrectos.
create or replace function public.crear_o_relacionar_lead(
  p_input jsonb,
  p_agencia_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_agencia text;
  v_usuario text;
  v_rol text;
  v_nombre text := nullif(trim(p_input ->> 'name'), '');
  v_telefono text := nullif(trim(p_input ->> 'phone'), '');
  v_tel_norm text;
  v_correo text := nullif(lower(trim(p_input ->> 'email')), '');
  v_propiedad text := nullif(trim(p_input ->> 'property_id'), '');
  v_asesor text := nullif(trim(p_input ->> 'assigned_agent_id'), '');
  v_mensaje text := nullif(left(trim(p_input ->> 'message'), 4000), '');
  v_ocupacion text := nullif(left(trim(p_input ->> 'occupation'), 160), '');
  v_canal text := coalesce(nullif(lower(trim(p_input ->> 'source')), ''), 'manual');
  v_origen text := coalesce(nullif(trim(p_input ->> 'origin'), ''), 'Directo');
  v_candidatos text[];
  v_lead_id text;
  v_asesor_existente text;
  v_creado boolean := false;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'El payload debe ser un objeto JSON.' using errcode = '22023';
  end if;

  if v_service then
    v_agencia := nullif(trim(p_agencia_id), '');
  else
    v_agencia := public.mi_agencia_id();
    v_usuario := public.mi_usuario_id();
    v_rol := public.mi_rol_activo();
    if v_rol not in ('broker', 'asesor_independiente', 'asesor_equipo') then
      raise exception 'Tu cuenta no puede crear leads.' using errcode = '42501';
    end if;
  end if;

  if v_agencia is null or not exists (
    select 1 from public.agencias where id = v_agencia and estado in ('activa', 'prueba')
  ) then
    raise exception 'La oficina no está disponible.' using errcode = '42501';
  end if;
  if v_nombre is null or length(v_nombre) > 160 then
    raise exception 'El nombre es obligatorio y debe tener máximo 160 caracteres.' using errcode = '22023';
  end if;
  if v_service and v_telefono is null and v_correo is null then
    raise exception 'Se requiere teléfono o correo.' using errcode = '22023';
  end if;
  if v_correo is not null and (length(v_correo) > 254 or v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;
  if length(v_canal) > 40 or v_canal !~ '^[a-z0-9_-]+$' then
    raise exception 'El canal de entrada no es válido.' using errcode = '22023';
  end if;
  if v_origen not in ('Portal', 'Referido', 'Redes', 'Directo') then
    v_origen := 'Directo';
  end if;

  v_tel_norm := public.norm_tel(v_telefono);
  if v_telefono is not null and v_tel_norm is null then
    raise exception 'El teléfono no es válido.' using errcode = '22023';
  end if;

  -- Serializa altas de la misma identidad sin imponer una restricción única
  -- retroactiva sobre datos reales que todavía puedan requerir conciliación.
  -- Todos toman los locks en el mismo orden para evitar deadlocks. Separarlos
  -- evita dos altas concurrentes con mismo teléfono y distinto correo (o al
  -- revés), que una llave compuesta no serializaría.
  if v_tel_norm is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_agencia || ':tel:' || v_tel_norm, 0));
  end if;
  if v_correo is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_agencia || ':mail:' || v_correo, 0));
  end if;

  if v_propiedad is not null then
    select coalesce(v_asesor, asesor_id) into v_asesor
      from public.propiedades
     where id = v_propiedad and agencia_id = v_agencia;
    if not found then
      raise exception 'La propiedad no pertenece a la oficina.' using errcode = '23503';
    end if;
  end if;

  if not v_service and v_rol <> 'broker' then
    if v_asesor is not null and v_asesor <> v_usuario then
      raise exception 'Un asesor solo puede crear leads para sí mismo.' using errcode = '42501';
    end if;
    v_asesor := v_usuario;
  end if;

  if v_asesor is not null and not exists (
    select 1 from public.usuarios
     where id = v_asesor
       and agencia_id = v_agencia
       and estado_cuenta = 'Activo'
       and rol in ('broker', 'asesor_independiente', 'asesor_equipo')
  ) then
    raise exception 'El asesor asignado no está activo en esta oficina.' using errcode = '23503';
  end if;

  select array_agg(distinct id order by id) into v_candidatos
    from public.leads
   where agencia_id = v_agencia
     and (
       (v_tel_norm is not null and telefono_norm = v_tel_norm)
       or (v_correo is not null and lower(correo) = v_correo)
     );

  if coalesce(array_length(v_candidatos, 1), 0) > 1 then
    raise exception 'Teléfono y correo coinciden con contactos distintos; se requiere revisión manual.'
      using errcode = 'P0001';
  end if;

  v_lead_id := v_candidatos[1];
  if v_lead_id is null then
    v_lead_id := 'lead-' || gen_random_uuid()::text;
    insert into public.leads (
      id, agencia_id, nombre, telefono, correo, etapa, origen,
      interes_propiedad_id, asesor_id, creado, nota, ocupacion, historial,
      canal_entrada, mensaje_entrada
    ) values (
      v_lead_id, v_agencia, v_nombre, coalesce(v_telefono, ''), coalesce(v_correo, ''),
      'Nuevo', v_origen, v_propiedad, v_asesor, now(), coalesce(v_mensaje, ''), coalesce(v_ocupacion, ''),
      jsonb_build_array(jsonb_build_object(
        'id', 'int-' || gen_random_uuid()::text,
        'fecha', now(),
        'tipo', 'Nota',
        'descripcion', 'Cliente dado de alta',
        'autor', case when v_service then 'Integración' else 'Sistema' end
      )),
      v_canal, v_mensaje
    );
    v_creado := true;
  else
    select asesor_id into v_asesor_existente from public.leads where id = v_lead_id;
    if not v_service and v_rol <> 'broker' and v_asesor_existente is distinct from v_usuario then
      raise exception 'El contacto ya está administrado por otro asesor.' using errcode = '42501';
    end if;

    update public.leads
       set telefono = case when telefono = '' then coalesce(v_telefono, telefono) else telefono end,
           correo = case when correo = '' then coalesce(v_correo, correo) else correo end,
           mensaje_entrada = coalesce(v_mensaje, mensaje_entrada),
           canal_entrada = v_canal
     where id = v_lead_id;

    insert into public.integration_events (agencia_id, event_type, entity_type, entity_id, payload)
    values (
      v_agencia,
      'lead.updated',
      'lead',
      v_lead_id,
      jsonb_build_object('lead_id', v_lead_id, 'source', v_canal, 'reason', 'existing_identity')
    );
  end if;

  return jsonb_build_object('lead_id', v_lead_id, 'created', v_creado);
end;
$$;

revoke all on function public.crear_o_relacionar_lead(jsonb, text) from public, anon;
grant execute on function public.crear_o_relacionar_lead(jsonb, text) to authenticated, service_role;

commit;
