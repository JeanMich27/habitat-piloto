-- =============================================================================
-- WhatsApp multicanal: piloto de texto, privacidad y supervisión de solo lectura
-- =============================================================================
-- Cada número conectado es un canal. En canales personales/Coexistence, un
-- remitente desconocido queda pendiente para el asesor y nunca es visible para
-- el broker hasta que el asesor lo confirma como conversación laboral.

begin;

create table if not exists public.wa_canales (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id) on delete cascade,
  usuario_id text references public.usuarios(id) on delete set null,
  phone_number_id text not null,
  waba_id text,
  telefono_mostrado text,
  modo text not null default 'coexistence' check (modo in ('cloud_api','coexistence')),
  protege_personal boolean not null default true,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (phone_number_id)
);

create unique index if not exists wa_canales_usuario_activo_key
  on public.wa_canales (agencia_id, usuario_id)
  where activo and usuario_id is not null;
create index if not exists wa_canales_agencia_idx
  on public.wa_canales (agencia_id, activo, usuario_id);
create unique index if not exists wa_canales_id_agencia_key
  on public.wa_canales (id, agencia_id);

alter table public.wa_canales enable row level security;
revoke all on public.wa_canales from anon, authenticated;
grant select on public.wa_canales to authenticated;
grant all on public.wa_canales to service_role;

-- La credencial es por número, no por oficina. Dos asesores pueden haber
-- autorizado WABA distintos y nunca se expone el secreto a sesiones web.
create table if not exists public.wa_canal_credenciales (
  canal_id uuid primary key,
  agencia_id text not null,
  secreto_id uuid not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  foreign key (canal_id, agencia_id)
    references public.wa_canales(id, agencia_id) on delete cascade
);
alter table public.wa_canal_credenciales enable row level security;
revoke all on public.wa_canal_credenciales from public, anon, authenticated;
grant all on public.wa_canal_credenciales to service_role;

-- Recupera la conexión ya existente sin presumir que es un número central.
-- Si la configuración antigua no declara el modo, se elige el valor más
-- restrictivo: Coexistence y protección de conversaciones desconocidas.
insert into public.wa_canales (
  agencia_id, phone_number_id, waba_id, telefono_mostrado, modo, protege_personal
)
select
  ai.agencia_id,
  ai.config ->> 'phone_number_id',
  nullif(ai.config ->> 'waba_id', ''),
  nullif(ai.config ->> 'display_phone_number', ''),
  case when ai.config ->> 'modo' = 'cloud_api' then 'cloud_api' else 'coexistence' end,
  case when ai.config ->> 'protege_personal' = 'false' then false else true end
from public.agencia_integraciones ai
where ai.proveedor = 'whatsapp'
  and ai.activo
  and nullif(ai.config ->> 'phone_number_id', '') is not null
on conflict (phone_number_id) do nothing;

insert into public.wa_canal_credenciales (canal_id, agencia_id, secreto_id)
select c.id, c.agencia_id, ai.secreto_id
  from public.wa_canales c
  join public.agencia_integraciones ai
    on ai.agencia_id = c.agencia_id
   and ai.proveedor = 'whatsapp'
   and ai.activo
   and ai.config ->> 'phone_number_id' = c.phone_number_id
 where ai.secreto_id is not null
on conflict (canal_id) do nothing;

create or replace function public.obtener_secreto_canal_whatsapp(p_phone_number_id text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select ds.decrypted_secret
    from public.wa_canales c
    join public.wa_canal_credenciales cc
      on cc.canal_id = c.id and cc.agencia_id = c.agencia_id
    join vault.decrypted_secrets ds on ds.id = cc.secreto_id
   where c.phone_number_id = p_phone_number_id and c.activo
   limit 1;
$$;
revoke all on function public.obtener_secreto_canal_whatsapp(text)
  from public, anon, authenticated;
grant execute on function public.obtener_secreto_canal_whatsapp(text) to service_role;

-- Punto de persistencia para el futuro Embedded Signup y para altas manuales
-- controladas del piloto. El token termina en Vault, nunca en wa_canales.
create or replace function public.registrar_canal_whatsapp(
  p_agencia_id text,
  p_usuario_id text,
  p_phone_number_id text,
  p_waba_id text,
  p_telefono_mostrado text,
  p_modo text,
  p_access_token text
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_canal_id uuid;
  v_agencia_existente text;
  v_secreto_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación reservada al alta segura de WhatsApp.' using errcode = '42501';
  end if;
  if nullif(trim(p_phone_number_id), '') is null
     or nullif(trim(p_access_token), '') is null
     or p_modo not in ('cloud_api','coexistence') then
    raise exception 'Los datos del canal de WhatsApp no son válidos.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.usuarios
     where id = p_usuario_id and agencia_id = p_agencia_id
       and estado_cuenta = 'Activo' and auth_id is not null
       and rol in ('asesor_independiente','asesor_equipo')
  ) then
    raise exception 'El asesor no está activo o pertenece a otra oficina.' using errcode = '23503';
  end if;

  select id, agencia_id into v_canal_id, v_agencia_existente
    from public.wa_canales
   where phone_number_id = trim(p_phone_number_id)
   for update;
  if v_canal_id is not null and v_agencia_existente <> p_agencia_id then
    raise exception 'El número ya está conectado a otra oficina.' using errcode = '23505';
  end if;

  if v_canal_id is null then
    insert into public.wa_canales (
      agencia_id, usuario_id, phone_number_id, waba_id, telefono_mostrado,
      modo, protege_personal, activo
    ) values (
      p_agencia_id, p_usuario_id, trim(p_phone_number_id), nullif(trim(p_waba_id), ''),
      nullif(trim(p_telefono_mostrado), ''), p_modo, p_modo = 'coexistence', true
    ) returning id into v_canal_id;
  else
    update public.wa_canales
       set usuario_id = p_usuario_id,
           waba_id = nullif(trim(p_waba_id), ''),
           telefono_mostrado = nullif(trim(p_telefono_mostrado), ''),
           modo = p_modo,
           protege_personal = p_modo = 'coexistence',
           activo = true,
           actualizado_en = now()
     where id = v_canal_id;
  end if;

  select secreto_id into v_secreto_id
    from public.wa_canal_credenciales
   where canal_id = v_canal_id;
  if v_secreto_id is null then
    v_secreto_id := vault.create_secret(
      trim(p_access_token),
      p_agencia_id || ':whatsapp:' || trim(p_phone_number_id),
      'Credencial de canal WhatsApp'
    );
    insert into public.wa_canal_credenciales (canal_id, agencia_id, secreto_id)
    values (v_canal_id, p_agencia_id, v_secreto_id);
  else
    perform vault.update_secret(v_secreto_id, trim(p_access_token));
    update public.wa_canal_credenciales
       set actualizado_en = now()
     where canal_id = v_canal_id;
  end if;
  return v_canal_id;
end;
$$;
revoke all on function public.registrar_canal_whatsapp(text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.registrar_canal_whatsapp(text,text,text,text,text,text,text)
  to service_role;

alter table public.wa_conversaciones
  add column if not exists canal_id uuid references public.wa_canales(id) on delete restrict,
  add column if not exists visibilidad text not null default 'laboral',
  add column if not exists contacto_nombre text;

alter table public.wa_conversaciones
  drop constraint if exists wa_conversaciones_visibilidad_valida;
alter table public.wa_conversaciones
  add constraint wa_conversaciones_visibilidad_valida
  check (visibilidad in ('laboral','pendiente','personal'));

update public.wa_conversaciones wc
   set canal_id = c.id
  from public.wa_canales c
 where wc.canal_id is null
   and c.agencia_id = wc.agencia_id
   and c.activo;

alter table public.wa_conversaciones
  drop constraint if exists wa_conversaciones_agencia_id_telefono_norm_key;
create unique index if not exists wa_conversaciones_canal_telefono_key
  on public.wa_conversaciones (canal_id, telefono_norm)
  where canal_id is not null;
create index if not exists wa_conversaciones_visibilidad_idx
  on public.wa_conversaciones (agencia_id, visibilidad, actualizado desc);

alter table public.wa_mensajes
  add column if not exists enviado_por text references public.usuarios(id) on delete set null,
  add column if not exists estado_entrega text,
  add column if not exists client_request_id uuid;

alter table public.wa_mensajes
  drop constraint if exists wa_mensajes_estado_entrega_valido;
alter table public.wa_mensajes
  add constraint wa_mensajes_estado_entrega_valido
  check (estado_entrega is null or estado_entrega in ('pendiente','enviado','entregado','leido','fallido'));
create unique index if not exists wa_mensajes_client_request_key
  on public.wa_mensajes (client_request_id)
  where client_request_id is not null;

-- El broker administra a quién pertenece el canal, pero esa acción no le
-- concede permiso para escribir mensajes.
create or replace function public.asignar_canal_whatsapp(
  p_canal_id uuid,
  p_usuario_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agencia text := public.mi_agencia_id();
begin
  if not public.es_broker() then
    raise exception 'Solo el broker puede asignar números de WhatsApp.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.usuarios
     where id = p_usuario_id and agencia_id = v_agencia
       and estado_cuenta = 'Activo' and auth_id is not null
       and rol in ('asesor_independiente','asesor_equipo')
  ) then
    raise exception 'El asesor no está activo o pertenece a otra oficina.' using errcode = '23503';
  end if;
  update public.wa_canales
     set usuario_id = p_usuario_id, actualizado_en = now()
   where id = p_canal_id and agencia_id = v_agencia and activo;
  if not found then
    raise exception 'Canal de WhatsApp inexistente.' using errcode = '23503';
  end if;
  update public.wa_conversaciones
     set asignado_a = p_usuario_id, actualizado = now()
   where canal_id = p_canal_id and agencia_id = v_agencia;
end;
$$;
revoke all on function public.asignar_canal_whatsapp(uuid,text) from public, anon;
grant execute on function public.asignar_canal_whatsapp(uuid,text) to authenticated;

-- Sustituye los RPC del corte anterior: el broker queda completamente fuera de
-- las mutaciones de conversación, no solo sin controles visibles en React.
create or replace function public.tomar_conversacion_whatsapp(p_conversacion_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text := public.mi_usuario_id();
  v_agencia text := public.mi_agencia_id();
  v_conv public.wa_conversaciones%rowtype;
begin
  if public.mi_rol_activo() not in ('asesor_independiente','asesor_equipo') then
    raise exception 'Solo un asesor puede tomar conversaciones.' using errcode = '42501';
  end if;
  select wc.* into v_conv
    from public.wa_conversaciones wc
    join public.wa_canales c on c.id = wc.canal_id
   where wc.id = p_conversacion_id and wc.agencia_id = v_agencia
     and c.usuario_id = v_usuario and c.activo
   for update of wc;
  if not found then raise exception 'Conversación inexistente o ajena.' using errcode = '42501'; end if;
  if v_conv.estado not in ('pendiente_humano','humano','requiere_revision') then
    raise exception 'La conversación no está disponible para tomar.' using errcode = 'P0001';
  end if;
  update public.wa_conversaciones
     set estado = 'humano', asignado_a = v_usuario,
         asignado_en = coalesce(asignado_en, now()), actualizado = now()
   where id = v_conv.id;
  return jsonb_build_object('conversation_id', v_conv.id, 'state', 'humano');
end;
$$;

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
  v_resumen text := nullif(left(trim(p_resumen), 1000), '');
  v_conv public.wa_conversaciones%rowtype;
begin
  if public.mi_rol_activo() not in ('asesor_independiente','asesor_equipo') then
    raise exception 'Solo un asesor puede cerrar conversaciones.' using errcode = '42501';
  end if;
  if v_resumen is null or length(v_resumen) < 10 then
    raise exception 'Escribe un resumen de al menos 10 caracteres.' using errcode = '22023';
  end if;
  select wc.* into v_conv
    from public.wa_conversaciones wc
    join public.wa_canales c on c.id = wc.canal_id
   where wc.id = p_conversacion_id and wc.agencia_id = v_agencia
     and c.usuario_id = v_usuario and c.activo
   for update of wc;
  if not found then raise exception 'Conversación inexistente o ajena.' using errcode = '42501'; end if;
  if v_conv.estado not in ('pendiente_humano','humano') then
    raise exception 'Solo se puede cerrar una conversación activa.' using errcode = 'P0001';
  end if;
  update public.wa_conversaciones
     set estado = 'cerrada', cerrada_por = v_usuario, cerrada_en = now(),
         resumen_cierre = v_resumen, actualizado = now()
   where id = v_conv.id;
  update public.tareas set estado = 'completada', completada_en = now()
   where agencia_id = v_agencia and lead_id = v_conv.lead_id and estado = 'pendiente'
     and metadata ->> 'conversacion_id' = v_conv.id::text;
  return jsonb_build_object('conversation_id', v_conv.id, 'state', 'cerrada');
end;
$$;

-- Ingesta multicanal. Un canal personal no crea leads ni responde a números
-- desconocidos: primero el asesor decide si la conversación es de trabajo.
create or replace function public.registrar_mensaje_whatsapp_entrante_v2(
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
  v_canal public.wa_canales%rowtype;
  v_tel_norm text;
  v_nombre text := coalesce(nullif(left(trim(p_nombre), 160), ''), 'Contacto de WhatsApp');
  v_cuerpo text := left(coalesce(p_cuerpo, ''), 4000);
  v_propiedad text := nullif(trim(p_propiedad_id), '');
  v_lead text;
  v_lead_asesor text;
  v_resultado jsonb;
  v_conv public.wa_conversaciones%rowtype;
  v_insertado bigint;
  v_laboral boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el webhook puede registrar mensajes de WhatsApp.' using errcode = '42501';
  end if;
  if nullif(trim(p_phone_number_id), '') is null
     or nullif(trim(p_wa_message_id), '') is null
     or nullif(trim(p_wa_id), '') is null
     or length(p_wa_message_id) > 255
     or length(p_wa_id) > 32
     or length(v_cuerpo) = 0 then
    raise exception 'El mensaje de WhatsApp no es válido.' using errcode = '22023';
  end if;

  select * into v_canal from public.wa_canales
   where phone_number_id = trim(p_phone_number_id) and activo;
  if not found then
    raise exception 'El número receptor no está vinculado a un canal activo.' using errcode = '23503';
  end if;
  v_tel_norm := public.norm_tel(p_wa_id);
  if v_tel_norm is null then
    raise exception 'El wa_id no contiene un teléfono válido.' using errcode = '22023';
  end if;

  select wc.* into v_conv
    from public.wa_mensajes wm
    join public.wa_conversaciones wc on wc.id = wm.conversacion_id
   where wm.wa_message_id = p_wa_message_id and wm.direccion = 'entrante';
  if found then
    return jsonb_build_object(
      'replay', true, 'conversation_id', v_conv.id, 'lead_id', v_conv.lead_id,
      'assigned_agent_id', v_conv.asignado_a, 'state', v_conv.estado,
      'visibility', v_conv.visibilidad, 'agency_id', v_conv.agencia_id,
      'should_respond', false
    );
  end if;

  select * into v_conv from public.wa_conversaciones
   where canal_id = v_canal.id and telefono_norm = v_tel_norm for update;
  if found and v_conv.visibilidad = 'personal' then
    return jsonb_build_object(
      'replay', false, 'conversation_id', v_conv.id, 'lead_id', null,
      'assigned_agent_id', v_canal.usuario_id, 'state', 'cerrada',
      'visibility', 'personal', 'agency_id', v_canal.agencia_id,
      'should_respond', false, 'ignored_personal', true
    );
  end if;

  select l.id, l.asesor_id into v_lead, v_lead_asesor
    from public.leads l
   where l.agencia_id = v_canal.agencia_id and l.telefono_norm = v_tel_norm
   order by (l.asesor_id = v_canal.usuario_id) desc, l.creado desc
   limit 1;

  v_laboral := not v_canal.protege_personal
    or v_propiedad is not null
    or (v_lead is not null and v_lead_asesor = v_canal.usuario_id);

  if v_laboral then
    v_resultado := public.crear_o_relacionar_lead(
      jsonb_strip_nulls(jsonb_build_object(
        'name', v_nombre, 'phone', trim(p_wa_id), 'property_id', v_propiedad,
        'assigned_agent_id', v_canal.usuario_id, 'message', v_cuerpo,
        'source', 'whatsapp', 'origin', 'Directo'
      )),
      v_canal.agencia_id
    );
    v_lead := v_resultado ->> 'lead_id';
  else
    v_lead := null;
  end if;

  insert into public.wa_conversaciones (
    agencia_id, canal_id, telefono_norm, telefono_whatsapp, contacto_nombre,
    lead_id, asignado_a, visibilidad, estado, ventana_expira_en, actualizado
  ) values (
    v_canal.agencia_id, v_canal.id, v_tel_norm, trim(p_wa_id), v_nombre,
    v_lead, v_canal.usuario_id,
    case when v_laboral then 'laboral' else 'pendiente' end,
    case when v_laboral and v_canal.usuario_id is not null then 'bot' else 'requiere_revision' end,
    now() + interval '24 hours', now()
  )
  on conflict (canal_id, telefono_norm) where canal_id is not null do update
    set telefono_whatsapp = excluded.telefono_whatsapp,
        contacto_nombre = coalesce(public.wa_conversaciones.contacto_nombre, excluded.contacto_nombre),
        lead_id = coalesce(public.wa_conversaciones.lead_id, excluded.lead_id),
        asignado_a = coalesce(public.wa_conversaciones.asignado_a, excluded.asignado_a),
        visibilidad = case
          when public.wa_conversaciones.visibilidad = 'personal' then 'personal'
          else excluded.visibilidad
        end,
        estado = case
          when public.wa_conversaciones.estado = 'cerrada' then excluded.estado
          else public.wa_conversaciones.estado
        end,
        cerrada_por = case
          when public.wa_conversaciones.estado = 'cerrada' then null
          else public.wa_conversaciones.cerrada_por
        end,
        cerrada_en = case
          when public.wa_conversaciones.estado = 'cerrada' then null
          else public.wa_conversaciones.cerrada_en
        end,
        resumen_cierre = case
          when public.wa_conversaciones.estado = 'cerrada' then null
          else public.wa_conversaciones.resumen_cierre
        end,
        ventana_expira_en = excluded.ventana_expira_en,
        actualizado = now()
  returning * into v_conv;

  if v_conv.visibilidad = 'personal' then
    return jsonb_build_object(
      'replay', false, 'conversation_id', v_conv.id, 'lead_id', null,
      'assigned_agent_id', v_canal.usuario_id, 'state', v_conv.estado,
      'visibility', 'personal', 'agency_id', v_canal.agencia_id,
      'should_respond', false, 'ignored_personal', true
    );
  end if;

  insert into public.wa_mensajes (
    agencia_id, conversacion_id, direccion, wa_message_id, cuerpo, autor
  ) values (
    v_canal.agencia_id, v_conv.id, 'entrante', p_wa_message_id, v_cuerpo, 'usuario'
  )
  on conflict (wa_message_id) where wa_message_id is not null do nothing
  returning id into v_insertado;

  return jsonb_build_object(
    'replay', v_insertado is null, 'conversation_id', v_conv.id,
    'lead_id', v_conv.lead_id, 'assigned_agent_id', v_conv.asignado_a,
    'state', v_conv.estado, 'visibility', v_conv.visibilidad,
    'agency_id', v_conv.agencia_id,
    'should_respond', v_insertado is not null and v_conv.visibilidad = 'laboral' and v_conv.estado = 'bot'
  );
end;
$$;
revoke all on function public.registrar_mensaje_whatsapp_entrante_v2(text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.registrar_mensaje_whatsapp_entrante_v2(text,text,text,text,text,text)
  to service_role;

-- Compatibilidad hacia adelante para cualquier consumidor que todavía use el
-- nombre del primer corte. Ambos caminos pasan ya por el ruteo multicanal.
create or replace function public.registrar_mensaje_whatsapp_entrante(
  p_phone_number_id text,
  p_wa_message_id text,
  p_wa_id text,
  p_nombre text,
  p_cuerpo text,
  p_propiedad_id text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.registrar_mensaje_whatsapp_entrante_v2(
    p_phone_number_id, p_wa_message_id, p_wa_id, p_nombre, p_cuerpo, p_propiedad_id
  );
$$;
revoke all on function public.registrar_mensaje_whatsapp_entrante(text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.registrar_mensaje_whatsapp_entrante(text,text,text,text,text,text)
  to service_role;

-- El asesor puede decidir sobre un remitente desconocido. Si es personal se
-- elimina el contenido recibido; si es laboral se vincula o crea el lead.
create or replace function public.clasificar_conversacion_whatsapp(
  p_conversacion_id integer,
  p_clasificacion text,
  p_lead_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text := public.mi_usuario_id();
  v_agencia text := public.mi_agencia_id();
  v_conv public.wa_conversaciones%rowtype;
  v_canal public.wa_canales%rowtype;
  v_lead text;
  v_resultado jsonb;
  v_mensaje text;
begin
  if public.mi_rol_activo() not in ('asesor_independiente','asesor_equipo') then
    raise exception 'Solo el asesor propietario puede clasificar la conversación.' using errcode = '42501';
  end if;
  if p_clasificacion not in ('laboral','personal') then
    raise exception 'Clasificación no válida.' using errcode = '22023';
  end if;
  select * into v_conv from public.wa_conversaciones
   where id = p_conversacion_id and agencia_id = v_agencia for update;
  if not found then raise exception 'Conversación inexistente.' using errcode = '23503'; end if;
  select * into v_canal from public.wa_canales
   where id = v_conv.canal_id and usuario_id = v_usuario and activo;
  if not found then raise exception 'La conversación pertenece a otro canal.' using errcode = '42501'; end if;

  if p_clasificacion = 'personal' then
    delete from public.wa_mensajes where conversacion_id = v_conv.id;
    update public.wa_conversaciones
       set visibilidad = 'personal', lead_id = null, estado = 'cerrada', actualizado = now()
     where id = v_conv.id;
    return jsonb_build_object('conversation_id', v_conv.id, 'visibility', 'personal');
  end if;

  if p_lead_id is not null then
    select id into v_lead from public.leads
     where id = p_lead_id and agencia_id = v_agencia and asesor_id = v_usuario;
    if not found then
      raise exception 'Solo puedes vincular clientes de tu cartera.' using errcode = '42501';
    end if;
  else
    select id into v_lead from public.leads
     where agencia_id = v_agencia and telefono_norm = v_conv.telefono_norm
       and asesor_id = v_usuario
     order by creado desc limit 1;
  end if;

  if v_lead is null then
    select cuerpo into v_mensaje from public.wa_mensajes
     where conversacion_id = v_conv.id and direccion = 'entrante'
     order by recibido_en asc limit 1;
    v_resultado := public.crear_o_relacionar_lead(
      jsonb_build_object(
        'name', coalesce(v_conv.contacto_nombre, 'Contacto de WhatsApp'),
        'phone', coalesce(v_conv.telefono_whatsapp, v_conv.telefono_norm),
        'assigned_agent_id', v_usuario, 'message', coalesce(v_mensaje, ''),
        'source', 'whatsapp', 'origin', 'Directo'
      ),
      v_agencia
    );
    v_lead := v_resultado ->> 'lead_id';
    if exists (select 1 from public.leads where id = v_lead and asesor_id is distinct from v_usuario) then
      raise exception 'El teléfono ya pertenece a la cartera de otro asesor.' using errcode = 'P0001';
    end if;
  end if;

  update public.wa_conversaciones
     set visibilidad = 'laboral', lead_id = v_lead, asignado_a = v_usuario,
         estado = 'pendiente_humano', actualizado = now()
   where id = v_conv.id;
  return jsonb_build_object(
    'conversation_id', v_conv.id, 'visibility', 'laboral', 'lead_id', v_lead
  );
end;
$$;
revoke all on function public.clasificar_conversacion_whatsapp(integer,text,text) from public, anon;
grant execute on function public.clasificar_conversacion_whatsapp(integer,text,text) to authenticated;

-- Reserva idempotentemente un mensaje antes de llamar a Meta. La función
-- rechaza al broker incluso si intenta saltarse la interfaz.
create or replace function public.preparar_envio_whatsapp(
  p_conversacion_id integer,
  p_cuerpo text,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text := public.mi_usuario_id();
  v_agencia text := public.mi_agencia_id();
  v_conv public.wa_conversaciones%rowtype;
  v_canal public.wa_canales%rowtype;
  v_mensaje public.wa_mensajes%rowtype;
  v_cuerpo text := left(trim(coalesce(p_cuerpo, '')), 4000);
begin
  if public.mi_rol_activo() not in ('asesor_independiente','asesor_equipo') then
    raise exception 'La cuenta no puede enviar mensajes de WhatsApp.' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'Falta el identificador único del envío.' using errcode = '22023';
  end if;
  if length(v_cuerpo) = 0 then raise exception 'Escribe un mensaje.' using errcode = '22023'; end if;

  select * into v_conv from public.wa_conversaciones
   where id = p_conversacion_id and agencia_id = v_agencia for update;
  if not found then raise exception 'Conversación inexistente.' using errcode = '23503'; end if;
  select * into v_canal from public.wa_canales
   where id = v_conv.canal_id and usuario_id = v_usuario and activo;
  if not found or v_conv.asignado_a is distinct from v_usuario then
    raise exception 'La conversación pertenece a otro asesor.' using errcode = '42501';
  end if;
  if v_conv.visibilidad <> 'laboral' or v_conv.estado = 'bloqueada' then
    raise exception 'Solo se puede responder una conversación laboral activa.' using errcode = '42501';
  end if;
  if v_conv.ventana_expira_en is null or v_conv.ventana_expira_en <= now() then
    raise exception 'Terminó la ventana de 24 horas; se requiere una plantilla aprobada.' using errcode = 'P0001';
  end if;

  select * into v_mensaje from public.wa_mensajes
   where client_request_id = p_client_request_id;
  if found and (
    v_mensaje.agencia_id is distinct from v_agencia
    or v_mensaje.conversacion_id is distinct from v_conv.id
    or v_mensaje.enviado_por is distinct from v_usuario
    or v_mensaje.cuerpo is distinct from v_cuerpo
  ) then
    raise exception 'El identificador del envío ya fue utilizado.' using errcode = '23505';
  end if;
  if not found then
    insert into public.wa_mensajes (
      agencia_id, conversacion_id, direccion, cuerpo, autor, enviado_por,
      estado_entrega, client_request_id
    ) values (
      v_agencia, v_conv.id, 'saliente', v_cuerpo, 'asesor', v_usuario,
      'pendiente', p_client_request_id
    ) returning * into v_mensaje;
  end if;

  update public.wa_conversaciones
     set actualizado = now()
   where id = v_conv.id;

  return jsonb_build_object(
    'message_id', v_mensaje.id, 'status', v_mensaje.estado_entrega,
    'phone_number_id', v_canal.phone_number_id,
    'recipient', coalesce(v_conv.telefono_whatsapp, v_conv.telefono_norm),
    'agency_id', v_agencia, 'body', v_mensaje.cuerpo
  );
end;
$$;
revoke all on function public.preparar_envio_whatsapp(integer,text,uuid) from public, anon;
grant execute on function public.preparar_envio_whatsapp(integer,text,uuid) to authenticated;

create or replace function public.registrar_estado_mensaje_whatsapp(
  p_wa_message_id text,
  p_estado text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text := case p_estado
    when 'sent' then 'enviado'
    when 'delivered' then 'entregado'
    when 'read' then 'leido'
    when 'failed' then 'fallido'
    else null
  end;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Operación reservada al webhook.' using errcode = '42501';
  end if;
  if v_estado is null then return; end if;
  update public.wa_mensajes
     set estado_entrega = case
       when v_estado = 'fallido' then v_estado
       when estado_entrega = 'fallido' then estado_entrega
       when array_position(array['pendiente','enviado','entregado','leido'], v_estado)
          >= array_position(array['pendiente','enviado','entregado','leido'], coalesce(estado_entrega, 'pendiente'))
         then v_estado
       else estado_entrega
     end
   where wa_message_id = p_wa_message_id and direccion = 'saliente';
end;
$$;
revoke all on function public.registrar_estado_mensaje_whatsapp(text,text) from public, anon, authenticated;
grant execute on function public.registrar_estado_mensaje_whatsapp(text,text) to service_role;

-- Broker: todas las conversaciones laborales de su oficina, siempre lectura.
-- Asesor: las de su propio canal, incluidas las pendientes de clasificar.
drop policy if exists wa_canales_select on public.wa_canales;
create policy wa_canales_select on public.wa_canales for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and ((select public.es_broker()) or usuario_id = (select public.mi_usuario_id()))
  );

drop policy if exists wa_conversaciones_select on public.wa_conversaciones;
create policy wa_conversaciones_select on public.wa_conversaciones for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (
      ((select public.es_broker()) and visibilidad = 'laboral')
      or exists (
        select 1 from public.wa_canales c
         where c.id = wa_conversaciones.canal_id
           and c.usuario_id = (select public.mi_usuario_id())
      )
    )
  );

drop policy if exists wa_mensajes_select on public.wa_mensajes;
create policy wa_mensajes_select on public.wa_mensajes for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and exists (
      select 1 from public.wa_conversaciones wc
       where wc.id = wa_mensajes.conversacion_id
         and wc.agencia_id = wa_mensajes.agencia_id
         and (
           ((select public.es_broker()) and wc.visibilidad = 'laboral')
           or exists (
             select 1 from public.wa_canales c
              where c.id = wc.canal_id
                and c.usuario_id = (select public.mi_usuario_id())
           )
         )
    )
  );

revoke insert, update, delete on public.wa_canales, public.wa_conversaciones, public.wa_mensajes
  from authenticated;

commit;
