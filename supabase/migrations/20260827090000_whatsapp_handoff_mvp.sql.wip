-- =============================================================================
-- WhatsApp MVP: ingesta canónica, asignación operable y handoff auditable
-- =============================================================================
-- La respuesta humana sigue ocurriendo en WhatsApp Business (Coexistence).
-- La plataforma conserva el contacto, asigna responsable y permite tomar y
-- cerrar el handoff sin convertir este corte en una bandeja de mensajería.

begin;

alter table public.wa_conversaciones
  add column if not exists telefono_whatsapp text,
  add column if not exists asignado_a text references public.usuarios(id) on delete set null,
  add column if not exists solicitado_humano_en timestamptz,
  add column if not exists asignado_en timestamptz,
  add column if not exists handoff_reason text,
  add column if not exists cerrada_por text references public.usuarios(id) on delete set null,
  add column if not exists cerrada_en timestamptz,
  add column if not exists resumen_cierre text;

alter table public.wa_mensajes
  add column if not exists intent text,
  add column if not exists confidence numeric,
  add column if not exists reason_code text;

alter table public.wa_conversaciones
  drop constraint if exists wa_conversaciones_estado_check;
alter table public.wa_conversaciones
  drop constraint if exists wa_conversaciones_estado_valido;
alter table public.wa_conversaciones
  add constraint wa_conversaciones_estado_valido check (
    estado in ('bot','pendiente_humano','humano','cerrada','bloqueada','requiere_revision')
  );

alter table public.wa_mensajes
  drop constraint if exists wa_mensajes_confidence_valida;
alter table public.wa_mensajes
  add constraint wa_mensajes_confidence_valida check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  );

create index if not exists wa_conversaciones_handoff_idx
  on public.wa_conversaciones (agencia_id, estado, actualizado desc)
  where estado in ('pendiente_humano','humano','requiere_revision');
create index if not exists wa_conversaciones_asignado_idx
  on public.wa_conversaciones (agencia_id, asignado_a, actualizado desc);

comment on column public.wa_conversaciones.telefono_whatsapp is
  'wa_id del contacto. Es el número del cliente usado para abrir wa.me; no confundir con phone_number_id de Meta.';
comment on column public.wa_conversaciones.asignado_a is
  'Responsable operativo. El estado de la conversación y la asignación son conceptos independientes.';
comment on column public.wa_conversaciones.estado is
  'bot responde; pendiente_humano espera claim; humano ya fue tomado; cerrada terminó; bloqueada es opt-out; requiere_revision no pudo asignarse.';

-- -----------------------------------------------------------------------------
-- Ingesta idempotente. Solo service_role puede convertir un webhook validado
-- en filas de negocio. Reutiliza crear_o_relacionar_lead en vez de insertar
-- leads por un camino paralelo.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_mensaje_whatsapp_entrante(
  p_phone_number_id text,
  p_wa_message_id text,
  p_wa_id text,
  p_nombre text,
  p_cuerpo text,
  p_propiedad_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agencia text;
  v_tel_norm text;
  v_nombre text := coalesce(nullif(left(trim(p_nombre), 160), ''), 'Contacto de WhatsApp');
  v_cuerpo text := left(coalesce(p_cuerpo, ''), 4000);
  v_propiedad text := nullif(trim(p_propiedad_id), '');
  v_asesor text;
  v_asesor_existente text;
  v_resultado jsonb;
  v_lead text;
  v_conv public.wa_conversaciones%rowtype;
  v_insertado bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el webhook puede registrar mensajes de WhatsApp.' using errcode = '42501';
  end if;
  if nullif(trim(p_phone_number_id), '') is null
     or nullif(trim(p_wa_message_id), '') is null
     or nullif(trim(p_wa_id), '') is null then
    raise exception 'Faltan identificadores obligatorios de WhatsApp.' using errcode = '22023';
  end if;
  if length(p_wa_message_id) > 255 or length(p_wa_id) > 32 or length(v_cuerpo) = 0 then
    raise exception 'El mensaje de WhatsApp no es válido.' using errcode = '22023';
  end if;

  -- Respuesta idempotente antes de tocar el lead. Meta reintenta el mismo wamid.
  select wc.* into v_conv
    from public.wa_mensajes wm
    join public.wa_conversaciones wc on wc.id = wm.conversacion_id
   where wm.wa_message_id = p_wa_message_id
     and wm.direccion = 'entrante';
  if found then
    return jsonb_build_object(
      'replay', true,
      'conversation_id', v_conv.id,
      'lead_id', v_conv.lead_id,
      'assigned_agent_id', v_conv.asignado_a,
      'state', v_conv.estado,
      'should_respond', false
    );
  end if;

  v_agencia := public.agencia_por_phone_number_id(trim(p_phone_number_id));
  if v_agencia is null then
    raise exception 'El phone_number_id no está vinculado a una oficina activa.' using errcode = '23503';
  end if;
  v_tel_norm := public.norm_tel(p_wa_id);
  if v_tel_norm is null then
    raise exception 'El wa_id no contiene un teléfono válido.' using errcode = '22023';
  end if;

  -- La propiedad manda solo si su asesor puede iniciar sesión hoy.
  if v_propiedad is not null then
    select u.id into v_asesor
      from public.propiedades p
      join public.usuarios u on u.id = p.asesor_id and u.agencia_id = p.agencia_id
     where p.id = v_propiedad
       and p.agencia_id = v_agencia
       and u.estado_cuenta = 'Activo'
       and u.auth_id is not null
       and u.rol in ('broker','asesor_independiente','asesor_equipo');
    if not found and not exists (
      select 1 from public.propiedades where id = v_propiedad and agencia_id = v_agencia
    ) then
      raise exception 'La propiedad no pertenece a la oficina.' using errcode = '23503';
    end if;
  end if;

  -- Fallback operativo: un broker real que sí puede entrar a la plataforma.
  if v_asesor is null then
    select id into v_asesor
      from public.usuarios
     where agencia_id = v_agencia
       and rol = 'broker'
       and estado_cuenta = 'Activo'
       and auth_id is not null
     order by id
     limit 1;
  end if;

  v_resultado := public.crear_o_relacionar_lead(
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_nombre,
      'phone', trim(p_wa_id),
      'property_id', v_propiedad,
      'assigned_agent_id', v_asesor,
      'message', v_cuerpo,
      'source', 'whatsapp',
      'origin', 'Directo'
    )),
    v_agencia
  );
  v_lead := v_resultado ->> 'lead_id';

  -- Conserva la asignación previa solo si esa persona puede atender hoy. Una
  -- ficha "Activa" sin auth_id sigue siendo inaccesible y cae al broker.
  select u.id into v_asesor_existente
    from public.leads l
    join public.usuarios u on u.id = l.asesor_id and u.agencia_id = l.agencia_id
   where l.id = v_lead
     and l.agencia_id = v_agencia
     and u.estado_cuenta = 'Activo'
     and u.auth_id is not null
     and u.rol in ('broker','asesor_independiente','asesor_equipo');
  v_asesor := coalesce(v_asesor_existente, v_asesor);

  -- Completa el contexto y corrige asignaciones inaccesibles. El UPDATE pasa
  -- por el trigger canónico de eventos y tareas; no queda como cambio oculto.
  update public.leads
     set asesor_id = v_asesor,
         interes_propiedad_id = coalesce(interes_propiedad_id, v_propiedad),
         canal_entrada = 'whatsapp',
         mensaje_entrada = v_cuerpo
   where id = v_lead and agencia_id = v_agencia;

  insert into public.wa_conversaciones (
    agencia_id, telefono_norm, telefono_whatsapp, lead_id, asignado_a,
    estado, ventana_expira_en, actualizado
  ) values (
    v_agencia, v_tel_norm, trim(p_wa_id), v_lead, v_asesor,
    case when v_asesor is null then 'requiere_revision' else 'bot' end,
    now() + interval '24 hours', now()
  )
  on conflict (agencia_id, telefono_norm) do update
    set telefono_whatsapp = excluded.telefono_whatsapp,
        lead_id = coalesce(public.wa_conversaciones.lead_id, excluded.lead_id),
        asignado_a = coalesce(public.wa_conversaciones.asignado_a, excluded.asignado_a),
        estado = case
          when public.wa_conversaciones.estado = 'cerrada' then excluded.estado
          else public.wa_conversaciones.estado
        end,
        cerrada_por = case when public.wa_conversaciones.estado = 'cerrada' then null else public.wa_conversaciones.cerrada_por end,
        cerrada_en = case when public.wa_conversaciones.estado = 'cerrada' then null else public.wa_conversaciones.cerrada_en end,
        resumen_cierre = case when public.wa_conversaciones.estado = 'cerrada' then null else public.wa_conversaciones.resumen_cierre end,
        ventana_expira_en = excluded.ventana_expira_en,
        actualizado = now()
  returning * into v_conv;

  insert into public.wa_mensajes (
    agencia_id, conversacion_id, direccion, wa_message_id, cuerpo, autor
  ) values (
    v_agencia, v_conv.id, 'entrante', p_wa_message_id, v_cuerpo, 'usuario'
  )
  on conflict (wa_message_id) where wa_message_id is not null do nothing
  returning id into v_insertado;

  if v_insertado is null then
    return jsonb_build_object(
      'replay', true,
      'conversation_id', v_conv.id,
      'lead_id', v_conv.lead_id,
      'assigned_agent_id', v_conv.asignado_a,
      'state', v_conv.estado,
      'should_respond', false
    );
  end if;

  return jsonb_build_object(
    'replay', false,
    'conversation_id', v_conv.id,
    'lead_id', v_conv.lead_id,
    'assigned_agent_id', v_conv.asignado_a,
    'state', v_conv.estado,
    'should_respond', v_conv.estado = 'bot'
  );
end;
$$;

revoke all on function public.registrar_mensaje_whatsapp_entrante(text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.registrar_mensaje_whatsapp_entrante(text,text,text,text,text,text)
  to service_role;

-- La recomendación del modelo se registra, pero la función no le concede al
-- modelo capacidad para decidir estados ni destinatarios.
create or replace function public.registrar_clasificacion_whatsapp(
  p_conversacion_id integer,
  p_wa_message_id text,
  p_intent text,
  p_confidence numeric,
  p_reason_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación reservada al webhook.' using errcode = '42501';
  end if;
  update public.wa_mensajes
     set intent = left(nullif(trim(p_intent), ''), 80),
         confidence = greatest(0, least(1, p_confidence)),
         reason_code = left(nullif(trim(p_reason_code), ''), 120)
   where conversacion_id = p_conversacion_id
     and wa_message_id = p_wa_message_id
     and direccion = 'entrante';
end;
$$;
revoke all on function public.registrar_clasificacion_whatsapp(integer,text,text,numeric,text)
  from public, anon, authenticated;
grant execute on function public.registrar_clasificacion_whatsapp(integer,text,text,numeric,text)
  to service_role;

create or replace function public.solicitar_handoff_whatsapp(
  p_conversacion_id integer,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.wa_conversaciones%rowtype;
  v_asesor text;
  v_tarea uuid;
  v_nombre text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación reservada al webhook.' using errcode = '42501';
  end if;

  select * into v_conv from public.wa_conversaciones
   where id = p_conversacion_id for update;
  if not found then raise exception 'Conversación inexistente.' using errcode = '23503'; end if;
  if v_conv.estado = 'bloqueada' then
    return jsonb_build_object('state', v_conv.estado, 'task_id', null);
  end if;

  v_asesor := v_conv.asignado_a;
  if v_asesor is null or not exists (
    select 1 from public.usuarios
     where id = v_asesor and agencia_id = v_conv.agencia_id
       and estado_cuenta = 'Activo' and auth_id is not null
       and rol in ('broker','asesor_independiente','asesor_equipo')
  ) then
    select id into v_asesor from public.usuarios
     where agencia_id = v_conv.agencia_id and rol = 'broker'
       and estado_cuenta = 'Activo' and auth_id is not null
     order by id limit 1;
  end if;
  if v_asesor is null then
    update public.wa_conversaciones
       set estado = 'requiere_revision', handoff_reason = left(p_reason_code, 120), actualizado = now()
     where id = v_conv.id;
    return jsonb_build_object(
      'state', 'requiere_revision',
      'task_id', null,
      'assigned_agent_id', null,
      'warning', 'No hay un operador activo con acceso para atender el handoff.'
    );
  end if;

  update public.wa_conversaciones
     set estado = case when estado = 'humano' then estado else 'pendiente_humano' end,
         asignado_a = v_asesor,
         solicitado_humano_en = coalesce(solicitado_humano_en, now()),
         handoff_reason = left(nullif(trim(p_reason_code), ''), 120),
         actualizado = now()
   where id = v_conv.id;

  select id into v_tarea
    from public.tareas
   where agencia_id = v_conv.agencia_id
     and lead_id = v_conv.lead_id
     and estado = 'pendiente'
     and (
       metadata ->> 'tipo' = 'whatsapp_handoff'
       or (titulo = 'Contactar lead' and creada_en >= now() - interval '5 minutes')
     )
   order by (metadata ->> 'tipo' = 'whatsapp_handoff') desc, creada_en
   limit 1
   for update;

  if v_tarea is null then
    insert into public.tareas (agencia_id, lead_id, asesor_id, titulo, vence_en, metadata)
    values (
      v_conv.agencia_id, v_conv.lead_id, v_asesor, 'Atender conversación de WhatsApp',
      now() + interval '15 minutes',
      jsonb_build_object('tipo', 'whatsapp_handoff', 'conversacion_id', v_conv.id)
    ) returning id into v_tarea;
  else
    update public.tareas
       set asesor_id = v_asesor,
           titulo = 'Atender conversación de WhatsApp',
           vence_en = least(vence_en, now() + interval '15 minutes'),
           metadata = metadata || jsonb_build_object('tipo', 'whatsapp_handoff', 'conversacion_id', v_conv.id)
     where id = v_tarea;
  end if;

  select nombre into v_nombre from public.leads where id = v_conv.lead_id;
  if not exists (
    select 1 from public.notificaciones
     where destinatario_id = v_asesor
       and tipo = 'whatsapp_handoff'
       and not leida
       and datos ->> 'conversacion_id' = v_conv.id::text
  ) then
    insert into public.notificaciones (agencia_id, destinatario_id, tipo, titulo, cuerpo, datos)
    values (
      v_conv.agencia_id, v_asesor, 'whatsapp_handoff',
      'WhatsApp requiere atención',
      coalesce(v_nombre, v_conv.telefono_whatsapp, v_conv.telefono_norm) || ' espera una respuesta humana.',
      jsonb_build_object(
        'conversacion_id', v_conv.id, 'lead_id', v_conv.lead_id,
        'telefono', v_conv.telefono_whatsapp, 'reason_code', p_reason_code
      )
    );
  end if;

  return jsonb_build_object('state', 'pendiente_humano', 'task_id', v_tarea, 'assigned_agent_id', v_asesor);
end;
$$;
revoke all on function public.solicitar_handoff_whatsapp(integer,text) from public, anon, authenticated;
grant execute on function public.solicitar_handoff_whatsapp(integer,text) to service_role;

create or replace function public.bloquear_conversacion_whatsapp(p_conversacion_id integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_conv public.wa_conversaciones%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación reservada al webhook.' using errcode = '42501';
  end if;
  select * into v_conv from public.wa_conversaciones where id = p_conversacion_id for update;
  if not found then raise exception 'Conversación inexistente.' using errcode = '23503'; end if;
  update public.wa_conversaciones
     set estado = 'bloqueada', actualizado = now(), handoff_reason = 'opt_out'
   where id = v_conv.id;
  update public.tareas
     set estado = 'cancelada'
   where agencia_id = v_conv.agencia_id and lead_id = v_conv.lead_id and estado = 'pendiente'
     and metadata ->> 'tipo' = 'whatsapp_handoff';
end;
$$;
revoke all on function public.bloquear_conversacion_whatsapp(integer) from public, anon, authenticated;
grant execute on function public.bloquear_conversacion_whatsapp(integer) to service_role;

-- -----------------------------------------------------------------------------
-- Acciones humanas. Los RPC validan tenant, rol y concurrencia; el navegador
-- no recibe permiso de UPDATE directo sobre la conversación.
-- -----------------------------------------------------------------------------
create or replace function public.tomar_conversacion_whatsapp(p_conversacion_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text := public.mi_usuario_id();
  v_agencia text := public.mi_agencia_id();
  v_rol text := public.mi_rol_activo();
  v_conv public.wa_conversaciones%rowtype;
begin
  if v_usuario is null or v_rol not in ('broker','asesor_independiente','asesor_equipo') then
    raise exception 'Tu cuenta no puede tomar conversaciones.' using errcode = '42501';
  end if;
  select * into v_conv from public.wa_conversaciones
   where id = p_conversacion_id and agencia_id = v_agencia for update;
  if not found then raise exception 'Conversación inexistente.' using errcode = '23503'; end if;
  if v_conv.estado not in ('pendiente_humano','humano','requiere_revision') then
    raise exception 'La conversación ya no está disponible para tomar.' using errcode = 'P0001';
  end if;
  if v_conv.estado = 'humano' and v_conv.asignado_a is distinct from v_usuario then
    raise exception 'Otro asesor ya tomó esta conversación.' using errcode = 'P0001';
  end if;
  if v_rol <> 'broker' and v_conv.asignado_a is distinct from v_usuario then
    raise exception 'La conversación está asignada a otro usuario.' using errcode = '42501';
  end if;

  update public.wa_conversaciones
     set estado = 'humano', asignado_a = v_usuario,
         asignado_en = coalesce(asignado_en, now()), actualizado = now()
   where id = v_conv.id;
  update public.tareas
     set asesor_id = v_usuario
   where agencia_id = v_agencia and lead_id = v_conv.lead_id and estado = 'pendiente'
     and metadata ->> 'conversacion_id' = v_conv.id::text;
  return jsonb_build_object('conversation_id', v_conv.id, 'state', 'humano', 'assigned_agent_id', v_usuario);
end;
$$;
revoke all on function public.tomar_conversacion_whatsapp(integer) from public, anon;
grant execute on function public.tomar_conversacion_whatsapp(integer) to authenticated;

create or replace function public.cerrar_conversacion_whatsapp(
  p_conversacion_id integer,
  p_resumen text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text := public.mi_usuario_id();
  v_agencia text := public.mi_agencia_id();
  v_rol text := public.mi_rol_activo();
  v_resumen text := nullif(left(trim(p_resumen), 1000), '');
  v_conv public.wa_conversaciones%rowtype;
begin
  if v_usuario is null or v_rol not in ('broker','asesor_independiente','asesor_equipo') then
    raise exception 'Tu cuenta no puede cerrar conversaciones.' using errcode = '42501';
  end if;
  if v_resumen is null or length(v_resumen) < 10 then
    raise exception 'Escribe un resumen de al menos 10 caracteres.' using errcode = '22023';
  end if;
  select * into v_conv from public.wa_conversaciones
   where id = p_conversacion_id and agencia_id = v_agencia for update;
  if not found then raise exception 'Conversación inexistente.' using errcode = '23503'; end if;
  if v_conv.estado not in ('pendiente_humano','humano') then
    raise exception 'Solo se puede cerrar un handoff activo.' using errcode = 'P0001';
  end if;
  if v_rol <> 'broker' and v_conv.asignado_a is distinct from v_usuario then
    raise exception 'La conversación está asignada a otro usuario.' using errcode = '42501';
  end if;

  update public.wa_conversaciones
     set estado = 'cerrada', cerrada_por = v_usuario, cerrada_en = now(),
         resumen_cierre = v_resumen, actualizado = now()
   where id = v_conv.id;
  update public.tareas
     set estado = 'completada', completada_en = now()
   where agencia_id = v_agencia and lead_id = v_conv.lead_id and estado = 'pendiente'
     and metadata ->> 'conversacion_id' = v_conv.id::text;
  update public.notificaciones
     set leida = true
   where agencia_id = v_agencia and destinatario_id = v_usuario
     and tipo = 'whatsapp_handoff' and datos ->> 'conversacion_id' = v_conv.id::text;
  return jsonb_build_object('conversation_id', v_conv.id, 'state', 'cerrada');
end;
$$;
revoke all on function public.cerrar_conversacion_whatsapp(integer,text) from public, anon;
grant execute on function public.cerrar_conversacion_whatsapp(integer,text) to authenticated;

-- Lectura estricta: broker ve la oficina; asesor únicamente lo asignado.
drop policy if exists wa_conversaciones_select on public.wa_conversaciones;
drop policy if exists "wa_conversaciones_select" on public.wa_conversaciones;
create policy wa_conversaciones_select on public.wa_conversaciones for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or asignado_a = (select public.mi_usuario_id())
    )
  );

drop policy if exists wa_conversaciones_update on public.wa_conversaciones;
drop policy if exists "wa_conversaciones_update" on public.wa_conversaciones;

drop policy if exists wa_mensajes_select on public.wa_mensajes;
drop policy if exists "wa_mensajes_select" on public.wa_mensajes;
create policy wa_mensajes_select on public.wa_mensajes for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and exists (
      select 1 from public.wa_conversaciones wc
       where wc.id = wa_mensajes.conversacion_id
         and wc.agencia_id = wa_mensajes.agencia_id
         and ((select public.es_broker()) or wc.asignado_a = (select public.mi_usuario_id()))
    )
  );

revoke insert, update, delete on public.wa_conversaciones, public.wa_mensajes from authenticated;
grant select on public.wa_conversaciones, public.wa_mensajes to authenticated;
grant all on public.wa_conversaciones, public.wa_mensajes to service_role;
grant usage, select on sequence public.wa_conversaciones_id_seq, public.wa_mensajes_id_seq to service_role;

commit;
