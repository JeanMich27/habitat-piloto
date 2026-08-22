-- ============================================================
-- 08 — Estados comerciales, solicitudes de cambio y enlaces de promoción
--
-- YA APLICADO en habitat-piloto (14 ago 2026) en dos migraciones:
--   multitenant_07_solicitudes_estado_notificaciones
--   multitenant_08_estados_comerciales_enlaces
-- Este archivo las conserva juntas para poder reproducir el esquema en
-- una instancia nueva. Es idempotente donde importa.
--
-- Reglas de negocio que implementa:
--   1. Los 5 estados comerciales: Publicada · No publicada · Reservada ·
--      Vendida o Rentada · Suspendida.
--   2. El asesor de equipo NO da de alta ni edita propiedades. Solo escribe
--      bitácora (eventos, comparables, última actividad).
--   3. El cambio de estado del asesor de equipo viaja como SOLICITUD: el
--      broker recibe la notificación y, al aprobarla, el estado se aplica
--      solo (trigger). Broker y asesor independiente cambian directo.
--   4. enlaces_promocion: dónde se anuncia la propiedad. El enlace de
--      EasyBroker llega por separado en eb_public_url (lo pone el sync);
--      la API de EasyBroker NO expone los enlaces por portal, así que esos
--      se capturan a mano.
-- ============================================================

-- ------------------------------------------------------------
-- PARTE 1 — Solicitudes de cambio de estado y notificaciones
-- ------------------------------------------------------------

create table if not exists public.solicitudes_estado (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id),
  propiedad_id text not null references public.propiedades(id) on delete cascade,
  solicitante_id text not null references public.usuarios(id),
  estado_actual text not null,
  estado_solicitado text not null check (estado_solicitado in
    ('Publicada','No publicada','Reservada','Vendida o Rentada','Suspendida')),
  motivo text,
  estatus text not null default 'pendiente' check (estatus in ('pendiente','aprobada','rechazada')),
  resuelto_por text references public.usuarios(id),
  resuelto_en timestamptz,
  creado_en timestamptz not null default now()
);

create index if not exists solicitudes_estado_agencia_idx
  on public.solicitudes_estado (agencia_id, estatus);
create index if not exists solicitudes_estado_propiedad_idx
  on public.solicitudes_estado (propiedad_id);

-- Una sola solicitud pendiente por propiedad: sin esto, el asesor podría
-- encolar tres cambios contradictorios y el broker no sabría cuál vale.
create unique index if not exists solicitudes_estado_pendiente_unica
  on public.solicitudes_estado (propiedad_id)
  where estatus = 'pendiente';

alter table public.solicitudes_estado enable row level security;

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id),
  destinatario_id text not null references public.usuarios(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  cuerpo text,
  datos jsonb not null default '{}'::jsonb,
  leida boolean not null default false,
  creada_en timestamptz not null default now()
);

create index if not exists notificaciones_destinatario_idx
  on public.notificaciones (destinatario_id, leida, creada_en desc);

alter table public.notificaciones enable row level security;

-- Coherencia de oficina: la propiedad tiene que ser de la misma agencia.
create or replace function public.validar_solicitud_estado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agencia text;
begin
  select agencia_id into v_agencia from public.propiedades where id = new.propiedad_id;
  if v_agencia is null or v_agencia <> new.agencia_id then
    raise exception 'La propiedad no pertenece a tu oficina';
  end if;
  return new;
end;
$$;
revoke execute on function public.validar_solicitud_estado() from public, anon, authenticated;

drop trigger if exists solicitudes_estado_validar on public.solicitudes_estado;
create trigger solicitudes_estado_validar
  before insert on public.solicitudes_estado
  for each row execute function public.validar_solicitud_estado();

-- Al crear la solicitud: avisar a todos los brokers activos de la oficina.
create or replace function public.notificar_solicitud_estado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_titulo_prop text;
  v_nombre_solicitante text;
begin
  select titulo into v_titulo_prop from public.propiedades where id = new.propiedad_id;
  select nombre into v_nombre_solicitante from public.usuarios where id = new.solicitante_id;

  insert into public.notificaciones (agencia_id, destinatario_id, tipo, titulo, cuerpo, datos)
  select new.agencia_id, u.id, 'solicitud_estado',
         'Solicitud de cambio de estado',
         coalesce(v_nombre_solicitante,'Un asesor') || ' solicita cambiar "' ||
         coalesce(v_titulo_prop, new.propiedad_id) || '" de ' || new.estado_actual ||
         ' a ' || new.estado_solicitado,
         jsonb_build_object('solicitud_id', new.id, 'propiedad_id', new.propiedad_id,
                            'estado_solicitado', new.estado_solicitado)
    from public.usuarios u
   where u.agencia_id = new.agencia_id
     and u.rol = 'broker'
     and u.estado_cuenta = 'Activo';
  return new;
end;
$$;
revoke execute on function public.notificar_solicitud_estado() from public, anon, authenticated;

drop trigger if exists solicitudes_estado_notificar on public.solicitudes_estado;
create trigger solicitudes_estado_notificar
  after insert on public.solicitudes_estado
  for each row execute function public.notificar_solicitud_estado();

-- Al resolver: solo desde 'pendiente'. Si se aprueba, el cambio de estado se
-- aplica AQUÍ — el frontend nunca escribe el estatus en este flujo, así que
-- no hay forma de aprobar sin que el estado cambie ni al revés.
create or replace function public.resolver_solicitud_estado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_titulo_prop text;
begin
  if old.estatus <> 'pendiente' then
    raise exception 'La solicitud ya fue resuelta';
  end if;
  if new.estatus not in ('aprobada','rechazada') then
    raise exception 'Transición inválida';
  end if;
  if new.propiedad_id <> old.propiedad_id or new.estado_solicitado <> old.estado_solicitado
     or new.solicitante_id <> old.solicitante_id or new.agencia_id <> old.agencia_id then
    raise exception 'No se puede modificar la solicitud al resolverla';
  end if;

  new.resuelto_por := public.mi_usuario_id();
  new.resuelto_en := now();

  select titulo into v_titulo_prop from public.propiedades where id = new.propiedad_id;

  if new.estatus = 'aprobada' then
    update public.propiedades
       set estatus = new.estado_solicitado,
           ultima_actividad = now()
     where id = new.propiedad_id
       and agencia_id = new.agencia_id;
  end if;

  insert into public.notificaciones (agencia_id, destinatario_id, tipo, titulo, cuerpo, datos)
  values (new.agencia_id, new.solicitante_id,
          case when new.estatus = 'aprobada' then 'solicitud_aprobada' else 'solicitud_rechazada' end,
          case when new.estatus = 'aprobada' then 'Cambio de estado aprobado' else 'Solicitud rechazada' end,
          '"' || coalesce(v_titulo_prop, new.propiedad_id) || '" → ' || new.estado_solicitado ||
          case when new.estatus = 'rechazada' then ' (rechazada)' else '' end,
          jsonb_build_object('solicitud_id', new.id, 'propiedad_id', new.propiedad_id,
                             'estado_solicitado', new.estado_solicitado));
  return new;
end;
$$;
revoke execute on function public.resolver_solicitud_estado() from public, anon, authenticated;

drop trigger if exists solicitudes_estado_resolver on public.solicitudes_estado;
create trigger solicitudes_estado_resolver
  before update on public.solicitudes_estado
  for each row execute function public.resolver_solicitud_estado();

-- RLS: el asesor ve las suyas, el broker las de su oficina y es el único que
-- puede resolverlas.
drop policy if exists solicitudes_select on public.solicitudes_estado;
create policy solicitudes_select on public.solicitudes_estado
  for select to authenticated
  using (agencia_id = (select mi_agencia_id())
         and ((select es_broker()) or solicitante_id = (select mi_usuario_id())));

drop policy if exists solicitudes_insert on public.solicitudes_estado;
create policy solicitudes_insert on public.solicitudes_estado
  for insert to authenticated
  with check (agencia_id = (select mi_agencia_id())
              and solicitante_id = (select mi_usuario_id())
              and (select soy_asesor()));

drop policy if exists solicitudes_update on public.solicitudes_estado;
create policy solicitudes_update on public.solicitudes_estado
  for update to authenticated
  using (agencia_id = (select mi_agencia_id()) and (select es_broker()))
  with check (agencia_id = (select mi_agencia_id()) and (select es_broker()));

-- Notificaciones: cada quien ve solo las suyas. Nadie inserta directo — solo
-- los triggers de arriba, que corren como definer.
drop policy if exists notificaciones_select on public.notificaciones;
create policy notificaciones_select on public.notificaciones
  for select to authenticated
  using (destinatario_id = (select mi_usuario_id())
         and agencia_id = (select mi_agencia_id()));

drop policy if exists notificaciones_update on public.notificaciones;
create policy notificaciones_update on public.notificaciones
  for update to authenticated
  using (destinatario_id = (select mi_usuario_id())
         and agencia_id = (select mi_agencia_id()))
  with check (destinatario_id = (select mi_usuario_id())
              and agencia_id = (select mi_agencia_id()));

-- ------------------------------------------------------------
-- PARTE 2 — Estados comerciales, enlaces y permisos del asesor de equipo
-- ------------------------------------------------------------

-- Migrar el vocabulario técnico al comercial.
update public.propiedades
   set estatus = case estatus
     when 'Activa' then 'Publicada'
     when 'Intake' then 'No publicada'
     when 'Validacion' then 'No publicada'
     when 'Pausada' then 'Suspendida'
     when 'Cerrada' then 'Vendida o Rentada'
     else estatus
   end
 where estatus in ('Activa','Intake','Validacion','Pausada','Cerrada');

alter table public.propiedades
  add column if not exists enlaces_promocion jsonb not null default '[]'::jsonb;

-- Alta de inventario: broker, o asesor independiente sobre lo suyo.
drop policy if exists propiedades_insert on public.propiedades;
create policy propiedades_insert on public.propiedades
  for insert to authenticated
  with check (
    agencia_id = (select mi_agencia_id())
    and (
      (select es_broker())
      or ((select mi_rol_activo()) = 'asesor_independiente'
          and asesor_id = (select mi_usuario_id()))
    )
  );

-- El asesor de equipo solo escribe bitácora. Se comparan columnas concretas
-- (no la fila entera) para tolerar las normalizaciones benignas del frontend
-- (null→0, null→"") sin abrir la puerta a editar lo que importa.
create or replace function public.proteger_propiedad_asesor_equipo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.mi_rol_activo() <> 'asesor_equipo' then
    return new;
  end if;
  if new.estatus is distinct from old.estatus
     or new.titulo is distinct from old.titulo
     or new.descripcion is distinct from old.descripcion
     or new.precio is distinct from old.precio
     or new.recamaras is distinct from old.recamaras
     or new.banos is distinct from old.banos
     or new.m2 is distinct from old.m2
     or new.tipo_inmueble is distinct from old.tipo_inmueble
     or new.tipo_operacion is distinct from old.tipo_operacion
     or new.asesor_id is distinct from old.asesor_id
     or new.propietario is distinct from old.propietario
     or new.documentos is distinct from old.documentos
     or coalesce(new.exclusiva, false) is distinct from coalesce(old.exclusiva, false)
     or new.comision_tipo is distinct from old.comision_tipo
     or new.comision_valor is distinct from old.comision_valor
     or new.publicada_el is distinct from old.publicada_el
     or coalesce(new.enlaces_promocion, '[]'::jsonb)
        is distinct from coalesce(old.enlaces_promocion, '[]'::jsonb)
  then
    raise exception
      'El asesor de equipo no puede editar la propiedad. Solicita el cambio de estado al broker.';
  end if;
  return new;
end;
$$;
revoke execute on function public.proteger_propiedad_asesor_equipo() from public, anon, authenticated;

drop trigger if exists propiedades_proteger_asesor_equipo on public.propiedades;
create trigger propiedades_proteger_asesor_equipo
  before update on public.propiedades
  for each row execute function public.proteger_propiedad_asesor_equipo();

-- ------------------------------------------------------------
-- Verificado el 14 ago 2026 contra datos reales, en transacción revertida:
--   · asesor de equipo no cambia estatus, título, precio, propietario ni enlaces
--   · asesor de equipo no da de alta propiedades (RLS)
--   · asesor de equipo sí escribe cronología
--   · una sola solicitud pendiente por propiedad
--   · el asesor no puede aprobar la suya
--   · al aprobar el broker, el estatus se aplica solo y se generan 3 avisos
--   · una solicitud resuelta ya no se puede volver a resolver
--   · el broker sí edita la propiedad
-- ------------------------------------------------------------
