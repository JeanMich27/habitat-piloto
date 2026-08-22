-- =============================================================================
-- MIGRACIÓN 02 — Funciones auxiliares y políticas RLS multi-tenant
-- Ejecutar DESPUÉS de 01-multitenant-modelo-datos.sql
--
-- PRINCIPIO ÚNICO: toda política empieza filtrando por agencia_id.
-- La lógica de roles que ya existía (broker / asesor / propietario / cliente)
-- se conserva tal cual; solo queda envuelta por el filtro de oficina.
--
-- Patrón de rendimiento: las funciones se invocan como (select f()) para que
-- Postgres las evalúe una sola vez por consulta (InitPlan) y no fila por fila.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Funciones auxiliares
-- -----------------------------------------------------------------------------

-- Agencia de la sesión actual. Devuelve NULL si:
--   - no hay sesión,
--   - la cuenta no está Activa,
--   - la agencia está suspendida (impago / fin de contrato).
-- NULL => todas las comparaciones dan NULL => no se ve nada. Falla cerrado.
create or replace function public.mi_agencia_id()
returns text language sql stable security definer set search_path = public as $$
  select u.agencia_id
    from public.usuarios u
    join public.agencias a on a.id = u.agencia_id
   where u.auth_id = (select auth.uid())
     and u.estado_cuenta = 'Activo'
     and a.estado <> 'suspendida'
   limit 1;
$$;

create or replace function public.mi_correo()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.mi_usuario_id()
returns text language sql stable security definer set search_path = public as $$
  select id from public.usuarios
   where auth_id = (select auth.uid())
     and estado_cuenta = 'Activo'
   limit 1;
$$;

create or replace function public.mi_rol_activo()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.usuarios
   where auth_id = (select auth.uid())
     and estado_cuenta = 'Activo'
   limit 1;
$$;

create or replace function public.es_broker()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol_activo() = 'broker', false);
$$;

create or replace function public.soy_asesor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol_activo() in ('broker','asesor_independiente','asesor_equipo'), false);
$$;

-- Permiso de ver la cartera de los demás. Ahora lee la configuración DE SU
-- AGENCIA, no la fila global 'default' (ese era el bug de origen).
create or replace function public.puedo_ver_todas()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when u.rol = 'broker' then true
    when u.rol = 'asesor_equipo' then
      coalesce(u.puede_ver_otras_propiedades, false)
      or coalesce((select c.permiso_equipo_ver_todas
                     from public.configuracion c
                    where c.agencia_id = u.agencia_id), false)
    else false
  end
  from public.usuarios u
  where u.auth_id = (select auth.uid())
    and u.estado_cuenta = 'Activo';
$$;


-- -----------------------------------------------------------------------------
-- 2. Alta de cuentas: nadie entra sin agencia
-- -----------------------------------------------------------------------------
-- El trigger anterior vinculaba por correo a nivel global. Con varias oficinas
-- eso mete al usuario nuevo en la agencia equivocada. Ahora:
--   a) si el correo ya fue invitado -> hereda la agencia de esa invitación;
--   b) si es correo nuevo -> exige código de invitación válido;
--   c) sin (a) ni (b) -> se rechaza el registro.

create or replace function public.manejar_nuevo_registro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fila_existente  public.usuarios%rowtype;
  v_agencia_id    text;
  codigo          text := nullif(trim(new.raw_user_meta_data ->> 'codigo_invitacion'), '');
  rol_solicitado  text := coalesce(new.raw_user_meta_data ->> 'rol_solicitado', 'asesor_equipo');
  nombre_meta     text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1));
  telefono_meta   text := coalesce(new.raw_user_meta_data ->> 'telefono', '');
begin
  if rol_solicitado not in ('asesor_equipo','asesor_independiente','propietario','cliente') then
    rol_solicitado := 'asesor_equipo';  -- nadie se auto-nombra broker
  end if;

  -- (a) invitación previa: la fila ya existe y ya trae su agencia
  select * into fila_existente
    from public.usuarios
   where lower(correo) = lower(new.email)
   order by case when estado_cuenta = 'Invitado' then 0 else 1 end
   limit 1;

  if found then
    update public.usuarios
       set auth_id  = new.id,
           telefono = case when telefono = '' then telefono_meta else telefono end,
           estado_cuenta = case when estado_cuenta = 'Invitado' then 'Activo' else estado_cuenta end
     where id = fila_existente.id;
    return new;
  end if;

  -- (b) correo nuevo: exige código de invitación de una agencia activa
  if codigo is null then
    raise exception 'Se requiere un código de invitación de la oficina para crear la cuenta.';
  end if;

  select id into v_agencia_id
    from public.agencias
   where codigo_invitacion = codigo
     and estado <> 'suspendida';

  if v_agencia_id is null then
    raise exception 'Código de invitación inválido o inactivo.';
  end if;

  insert into public.usuarios (
    id, agencia_id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta
  ) values (
    'user-' || substr(new.id::text, 1, 8),
    v_agencia_id,
    new.id,
    nombre_meta,
    lower(new.email),
    telefono_meta,
    rol_solicitado,
    case rol_solicitado
      when 'propietario' then 'Propietario'
      when 'cliente'     then 'Cliente'
      else 'Asesor Inmobiliario'
    end,
    upper(left(split_part(nombre_meta,' ',1),1) || left(split_part(nombre_meta,' ',2),1)),
    'Pendiente'   -- el broker de esa oficina lo aprueba
  );

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.manejar_nuevo_registro();


-- Nadie puede moverse de agencia ni auto-escalar rol.
create or replace function public.proteger_campos_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.agencia_id is distinct from old.agencia_id then
      raise exception 'No se puede cambiar la agencia de un usuario desde la aplicación.';
    end if;
    if not public.es_broker() then
      if new.rol is distinct from old.rol
         or new.estado_cuenta is distinct from old.estado_cuenta
         or new.puede_ver_otras_propiedades is distinct from old.puede_ver_otras_propiedades then
        raise exception 'Solo el broker puede cambiar rol, estado o permisos.';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists usuarios_proteger_campos on public.usuarios;
create trigger usuarios_proteger_campos
  before update on public.usuarios
  for each row execute function public.proteger_campos_usuario();


-- -----------------------------------------------------------------------------
-- 3. Políticas RLS
-- -----------------------------------------------------------------------------
-- Se eliminan TODAS las políticas previas de estas tablas antes de recrearlas.
-- Motivo: las políticas permisivas se combinan con OR. Una sola política vieja
-- que sobreviva (por ejemplo `agencia_select using(true)`, que sigue viva
-- después de renombrar la tabla a `agencias`) anula todo el aislamiento.
-- Borrar por nombre no basta: hay que barrer por tabla.
do $$
declare p record;
begin
  for p in
    select policyname, tablename
      from pg_policies
     where schemaname = 'public'
       and tablename in ('agencias','usuarios','propiedades','leads',
                         'configuracion','sync_estado','ingesta_log',
                         'wa_conversaciones','wa_mensajes')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ---------- agencias ----------
alter table public.agencias enable row level security;

drop policy if exists "agencias_select" on public.agencias;
create policy "agencias_select" on public.agencias for select to authenticated
  using (id = (select public.mi_agencia_id()));

drop policy if exists "agencias_update" on public.agencias;
create policy "agencias_update" on public.agencias for update to authenticated
  using      (id = (select public.mi_agencia_id()) and (select public.es_broker()))
  with check (id = (select public.mi_agencia_id()) and (select public.es_broker()));
-- Alta y baja de agencias: solo service_role (sin política = sin acceso).

-- ---------- usuarios ----------
-- FUGA CORREGIDA: la política anterior era `using (true)`. Cualquier sesión de
-- cualquier oficina podía leer nombres, correos y teléfonos de todo el sistema.
drop policy if exists "usuarios_select" on public.usuarios;
create policy "usuarios_select" on public.usuarios for select to authenticated
  using (agencia_id = (select public.mi_agencia_id()));

drop policy if exists "usuarios_insert_broker" on public.usuarios;
create policy "usuarios_insert_broker" on public.usuarios for insert to authenticated
  with check (agencia_id = (select public.mi_agencia_id()) and (select public.es_broker()));

drop policy if exists "usuarios_update" on public.usuarios;
create policy "usuarios_update" on public.usuarios for update to authenticated
  using      (agencia_id = (select public.mi_agencia_id()) and ((select public.es_broker()) or auth_id = (select auth.uid())))
  with check (agencia_id = (select public.mi_agencia_id()) and ((select public.es_broker()) or auth_id = (select auth.uid())));

drop policy if exists "usuarios_delete_broker" on public.usuarios;
create policy "usuarios_delete_broker" on public.usuarios for delete to authenticated
  using (agencia_id = (select public.mi_agencia_id()) and (select public.es_broker()));

-- ---------- propiedades ----------
drop policy if exists "propiedades_select" on public.propiedades;
create policy "propiedades_select" on public.propiedades for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or ((select public.soy_asesor()) and (asesor_id = (select public.mi_usuario_id()) or (select public.puedo_ver_todas())))
      or ((select public.mi_rol_activo()) = 'propietario' and lower(propietario ->> 'correo') = (select public.mi_correo()))
      or ((select public.mi_rol_activo()) = 'cliente' and exists (
            select 1 from public.leads l
             where l.interes_propiedad_id = propiedades.id
               and l.agencia_id = propiedades.agencia_id
               and lower(l.correo) = (select public.mi_correo())
          ))
    )
  );

drop policy if exists "propiedades_insert" on public.propiedades;
create policy "propiedades_insert" on public.propiedades for insert to authenticated
  with check (
    agencia_id = (select public.mi_agencia_id())
    and ((select public.es_broker()) or ((select public.soy_asesor()) and asesor_id = (select public.mi_usuario_id())))
  );

drop policy if exists "propiedades_update" on public.propiedades;
create policy "propiedades_update" on public.propiedades for update to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and ((select public.es_broker()) or ((select public.soy_asesor()) and asesor_id = (select public.mi_usuario_id())))
  )
  with check (
    agencia_id = (select public.mi_agencia_id())
    and ((select public.es_broker()) or ((select public.soy_asesor()) and asesor_id = (select public.mi_usuario_id())))
  );

drop policy if exists "propiedades_delete" on public.propiedades;
create policy "propiedades_delete" on public.propiedades for delete to authenticated
  using (agencia_id = (select public.mi_agencia_id()) and (select public.es_broker()));

-- ---------- leads ----------
drop policy if exists "leads_select" on public.leads;
create policy "leads_select" on public.leads for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or ((select public.soy_asesor()) and (asesor_id = (select public.mi_usuario_id()) or (select public.puedo_ver_todas())))
      or ((select public.mi_rol_activo()) = 'cliente' and lower(correo) = (select public.mi_correo()))
    )
  );

drop policy if exists "leads_insert" on public.leads;
create policy "leads_insert" on public.leads for insert to authenticated
  with check (
    agencia_id = (select public.mi_agencia_id())
    and ((select public.es_broker()) or ((select public.soy_asesor()) and asesor_id = (select public.mi_usuario_id())))
  );

drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads for update to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or ((select public.soy_asesor()) and asesor_id = (select public.mi_usuario_id()))
      or ((select public.mi_rol_activo()) = 'cliente' and lower(correo) = (select public.mi_correo()))
    )
  )
  with check (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or ((select public.soy_asesor()) and asesor_id = (select public.mi_usuario_id()))
      or ((select public.mi_rol_activo()) = 'cliente' and lower(correo) = (select public.mi_correo()))
    )
  );

drop policy if exists "leads_delete" on public.leads;
create policy "leads_delete" on public.leads for delete to authenticated
  using (agencia_id = (select public.mi_agencia_id()) and (select public.es_broker()));

-- ---------- configuracion ----------
drop policy if exists "configuracion_select" on public.configuracion;
create policy "configuracion_select" on public.configuracion for select to authenticated
  using (agencia_id = (select public.mi_agencia_id()));

drop policy if exists "configuracion_write" on public.configuracion;
create policy "configuracion_write" on public.configuracion for all to authenticated
  using      (agencia_id = (select public.mi_agencia_id()) and (select public.es_broker()))
  with check (agencia_id = (select public.mi_agencia_id()) and (select public.es_broker()));

-- ---------- operación interna ----------
drop policy if exists "sync_estado_broker" on public.sync_estado;
create policy "sync_estado_broker" on public.sync_estado for select to authenticated
  using (agencia_id = (select public.mi_agencia_id()) and (select public.es_broker()));

drop policy if exists "ingesta_log_broker" on public.ingesta_log;
create policy "ingesta_log_broker" on public.ingesta_log for select to authenticated
  using (agencia_id = (select public.mi_agencia_id()) and (select public.es_broker()));

-- ---------- WhatsApp ----------
-- Solo lectura desde la app. La escritura la hace la Edge Function con
-- service_role: el bot nunca actúa con la sesión de un usuario.
drop policy if exists "wa_conversaciones_select" on public.wa_conversaciones;
create policy "wa_conversaciones_select" on public.wa_conversaciones for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (select public.soy_asesor())
  );

drop policy if exists "wa_conversaciones_update" on public.wa_conversaciones;
create policy "wa_conversaciones_update" on public.wa_conversaciones for update to authenticated
  using      (agencia_id = (select public.mi_agencia_id()) and (select public.soy_asesor()))
  with check (agencia_id = (select public.mi_agencia_id()) and (select public.soy_asesor()));
-- (permite el handoff: el asesor cambia estado 'bot' -> 'humano')

drop policy if exists "wa_mensajes_select" on public.wa_mensajes;
create policy "wa_mensajes_select" on public.wa_mensajes for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (select public.soy_asesor())
  );


-- -----------------------------------------------------------------------------
-- 4. Cierre de accesos anónimos
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

commit;
