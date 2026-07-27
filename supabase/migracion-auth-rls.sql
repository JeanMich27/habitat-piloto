-- =============================================================================
-- Migración: Cuentas de usuario (Supabase Auth) + seguridad real por rol (RLS)
-- Reemplaza las políticas abiertas del piloto por reglas basadas en la cuenta.
--
-- Cómo funciona:
--  1. Cada cuenta de Auth se vincula a una fila de public.usuarios (auth_id).
--  2. Al registrarse, un trigger crea/vincula el perfil:
--     - Si el correo ya existe en usuarios (invitado o sembrado) → se vincula
--       y, si estaba "Invitado", pasa a "Activo".
--     - Si es correo nuevo → se crea con el rol solicitado y estado "Pendiente"
--       hasta que el broker lo apruebe.
--  3. Políticas RLS por rol:
--     - broker: todo.
--     - asesor_independiente: solo sus propiedades/leads.
--     - asesor_equipo: los suyos + los demás solo si tiene permiso.
--     - propietario: solo propiedades cuyo propietario.correo = su correo.
--     - cliente: solo sus leads (leads.correo = su correo) y las propiedades
--       de interés de esos leads.
--  4. El rol "anon" (sin sesión) no puede leer ni escribir nada.
-- =============================================================================

-- ---------- 1. Columnas nuevas ----------
alter table public.usuarios add column if not exists auth_id uuid unique;
alter table public.usuarios alter column estado_cuenta set default 'Pendiente';
-- El cliente se identifica por correo; antes los leads no lo guardaban.
alter table public.leads add column if not exists correo text not null default '';

-- ---------- 2. Funciones auxiliares (security definer: evitan recursión RLS) ----------
create or replace function public.mi_correo()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.mi_usuario_id()
returns text language sql stable security definer set search_path = public as $$
  select id from public.usuarios
  where auth_id = auth.uid()
  limit 1;
$$;

create or replace function public.mi_rol_activo()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.usuarios
  where auth_id = auth.uid() and estado_cuenta = 'Activo'
  limit 1;
$$;

create or replace function public.es_broker()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol_activo() = 'broker', false);
$$;

-- ¿Este asesor puede ver propiedades/leads de otros? (permiso individual o
-- política global de Configuración; solo aplica a asesor_equipo)
create or replace function public.puedo_ver_todas()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when u.rol = 'broker' then true
    when u.rol = 'asesor_equipo' then
      coalesce(u.puede_ver_otras_propiedades, false)
      or coalesce((select c.permiso_equipo_ver_todas from public.configuracion c where c.id = 'default'), false)
    else false
  end
  from public.usuarios u
  where u.auth_id = auth.uid() and u.estado_cuenta = 'Activo';
$$;

create or replace function public.soy_asesor()
returns boolean language sql stable as $$
  select public.mi_rol_activo() in ('broker', 'asesor_independiente', 'asesor_equipo');
$$;

-- ---------- 3. Trigger de registro: crea/vincula el perfil ----------
create or replace function public.manejar_nuevo_registro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  existente_id text;
  rol_solicitado text := coalesce(new.raw_user_meta_data ->> 'rol_solicitado', 'asesor_equipo');
  nombre_meta text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1));
  telefono_meta text := coalesce(new.raw_user_meta_data ->> 'telefono', '');
begin
  if rol_solicitado not in ('asesor_equipo', 'asesor_independiente', 'propietario', 'cliente') then
    rol_solicitado := 'asesor_equipo'; -- nadie se auto-nombra broker
  end if;

  select id into existente_id from public.usuarios where lower(correo) = lower(new.email) limit 1;

  if existente_id is not null then
    update public.usuarios
    set auth_id = new.id,
        telefono = case when telefono = '' then telefono_meta else telefono end,
        estado_cuenta = case when estado_cuenta = 'Invitado' then 'Activo' else estado_cuenta end
    where id = existente_id;
  else
    insert into public.usuarios (id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta)
    values (
      'user-' || substr(new.id::text, 1, 8),
      new.id,
      nombre_meta,
      lower(new.email),
      telefono_meta,
      rol_solicitado,
      case rol_solicitado
        when 'propietario' then 'Propietario'
        when 'cliente' then 'Cliente'
        else 'Asesor Inmobiliario'
      end,
      upper(left(split_part(nombre_meta, ' ', 1), 1) || left(split_part(nombre_meta, ' ', 2), 1)),
      'Pendiente'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.manejar_nuevo_registro();

-- ---------- 4. Protección contra auto-escalamiento de rol ----------
create or replace function public.proteger_campos_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo el broker puede cambiar rol, estado de cuenta o permisos de otros.
  if not public.es_broker() and auth.uid() is not null then
    if new.rol is distinct from old.rol
       or new.estado_cuenta is distinct from old.estado_cuenta
       or new.puede_ver_otras_propiedades is distinct from old.puede_ver_otras_propiedades then
      raise exception 'Solo el broker puede cambiar rol, estado o permisos.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists usuarios_proteger_campos on public.usuarios;
create trigger usuarios_proteger_campos
  before update on public.usuarios
  for each row execute function public.proteger_campos_usuario();

-- ---------- 5. Cuenta del broker (bootstrap) ----------
-- Deja lista la fila del broker real: al registrarse con este correo queda
-- vinculado y activo automáticamente (estado 'Invitado' → 'Activo').
insert into public.usuarios (id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta)
values ('user-broker-jean', 'Jean', 'niper987@gmail.com', '', 'broker', 'Broker / Administrador', 'JN', 'Invitado')
on conflict (id) do nothing;

-- ---------- 6. Políticas RLS ----------
-- Quitar las políticas abiertas del piloto.
drop policy if exists "piloto_todo_acceso" on public.agencia;
drop policy if exists "piloto_todo_acceso" on public.configuracion;
drop policy if exists "piloto_todo_acceso" on public.usuarios;
drop policy if exists "piloto_todo_acceso" on public.propiedades;
drop policy if exists "piloto_todo_acceso" on public.leads;

-- --- usuarios ---
drop policy if exists "usuarios_select" on public.usuarios;
create policy "usuarios_select" on public.usuarios for select to authenticated
  using (true); -- cualquier sesión puede leer el directorio (nombres/roles)

drop policy if exists "usuarios_insert_broker" on public.usuarios;
create policy "usuarios_insert_broker" on public.usuarios for insert to authenticated
  with check (public.es_broker());

drop policy if exists "usuarios_update" on public.usuarios;
create policy "usuarios_update" on public.usuarios for update to authenticated
  using (public.es_broker() or auth_id = auth.uid())
  with check (public.es_broker() or auth_id = auth.uid());

drop policy if exists "usuarios_delete_broker" on public.usuarios;
create policy "usuarios_delete_broker" on public.usuarios for delete to authenticated
  using (public.es_broker());

-- --- propiedades ---
drop policy if exists "propiedades_select" on public.propiedades;
create policy "propiedades_select" on public.propiedades for select to authenticated
  using (
    public.es_broker()
    or (public.soy_asesor() and (asesor_id = public.mi_usuario_id() or public.puedo_ver_todas()))
    or (public.mi_rol_activo() = 'propietario' and lower(propietario ->> 'correo') = public.mi_correo())
    or (public.mi_rol_activo() = 'cliente' and exists (
          select 1 from public.leads l
          where l.interes_propiedad_id = propiedades.id
            and lower(l.correo) = public.mi_correo()
        ))
  );

drop policy if exists "propiedades_insert" on public.propiedades;
create policy "propiedades_insert" on public.propiedades for insert to authenticated
  with check (public.es_broker() or (public.soy_asesor() and asesor_id = public.mi_usuario_id()));

drop policy if exists "propiedades_update" on public.propiedades;
create policy "propiedades_update" on public.propiedades for update to authenticated
  using (public.es_broker() or (public.soy_asesor() and asesor_id = public.mi_usuario_id()))
  with check (public.es_broker() or (public.soy_asesor() and asesor_id = public.mi_usuario_id()));

drop policy if exists "propiedades_delete" on public.propiedades;
create policy "propiedades_delete" on public.propiedades for delete to authenticated
  using (public.es_broker());

-- --- leads ---
drop policy if exists "leads_select" on public.leads;
create policy "leads_select" on public.leads for select to authenticated
  using (
    public.es_broker()
    or (public.soy_asesor() and (asesor_id = public.mi_usuario_id() or public.puedo_ver_todas()))
    or (public.mi_rol_activo() = 'cliente' and lower(correo) = public.mi_correo())
  );

drop policy if exists "leads_insert" on public.leads;
create policy "leads_insert" on public.leads for insert to authenticated
  with check (public.es_broker() or (public.soy_asesor() and asesor_id = public.mi_usuario_id()));

drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads for update to authenticated
  using (
    public.es_broker()
    or (public.soy_asesor() and asesor_id = public.mi_usuario_id())
    or (public.mi_rol_activo() = 'cliente' and lower(correo) = public.mi_correo())
  )
  with check (
    public.es_broker()
    or (public.soy_asesor() and asesor_id = public.mi_usuario_id())
    or (public.mi_rol_activo() = 'cliente' and lower(correo) = public.mi_correo())
  );

drop policy if exists "leads_delete" on public.leads;
create policy "leads_delete" on public.leads for delete to authenticated
  using (public.es_broker());

-- --- agencia y configuracion ---
drop policy if exists "agencia_select" on public.agencia;
create policy "agencia_select" on public.agencia for select to authenticated using (true);
drop policy if exists "agencia_write" on public.agencia;
create policy "agencia_write" on public.agencia for all to authenticated
  using (public.es_broker()) with check (public.es_broker());

drop policy if exists "configuracion_select" on public.configuracion;
create policy "configuracion_select" on public.configuracion for select to authenticated using (true);
drop policy if exists "configuracion_write" on public.configuracion;
create policy "configuracion_write" on public.configuracion for all to authenticated
  using (public.es_broker()) with check (public.es_broker());

-- ---------- 7. Revocar acceso anónimo ----------
revoke all on all tables in schema public from anon;
