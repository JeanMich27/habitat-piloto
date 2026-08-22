-- =============================================================================
-- P0 — Autorización por operación en leads + directorio de mínimo privilegio
-- =============================================================================

begin;

-- La tabla base de usuarios contiene auth_id, correo, teléfono, estado y
-- permisos. Solo el broker necesita el directorio completo; cada otra cuenta
-- conserva acceso directo únicamente a su propio perfil (Auth lo necesita).
drop policy if exists "usuarios_select" on public.usuarios;
create policy "usuarios_select" on public.usuarios for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and ((select public.es_broker()) or auth_id = (select auth.uid()))
  );

-- Directorio adaptado al rol. Nunca expone auth_id. Los asesores reciben solo
-- identidad operativa del equipo; el propietario recibe contacto únicamente
-- de los asesores asignados a sus inmuebles; el cliente no recibe directorio.
create or replace function public.directorio_visible()
returns table (
  id text,
  agencia_id text,
  nombre text,
  correo text,
  telefono text,
  rol text,
  puesto text,
  iniciales text,
  estado_cuenta text,
  puede_ver_otras_propiedades boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with sesion as (
    select
      public.mi_agencia_id() as agencia_id,
      public.mi_usuario_id() as usuario_id,
      public.mi_rol_activo() as rol,
      public.mi_correo() as correo
  )
  select
    u.id,
    u.agencia_id,
    u.nombre,
    case
      when s.rol = 'broker' or u.id = s.usuario_id then u.correo
      when s.rol = 'propietario' then u.correo
      else ''
    end as correo,
    case
      when s.rol = 'broker' or u.id = s.usuario_id then u.telefono
      when s.rol = 'propietario' then u.telefono
      else ''
    end as telefono,
    u.rol,
    u.puesto,
    u.iniciales,
    case when s.rol = 'broker' or u.id = s.usuario_id then u.estado_cuenta else 'Activo' end,
    case
      when s.rol = 'broker' or u.id = s.usuario_id
        then coalesce(u.puede_ver_otras_propiedades, false)
      else false
    end
  from public.usuarios u
  cross join sesion s
  where s.agencia_id is not null
    and u.agencia_id = s.agencia_id
    and (
      s.rol = 'broker'
      or (
        s.rol in ('asesor_equipo', 'asesor_independiente')
        and u.rol in ('broker', 'asesor_equipo', 'asesor_independiente')
        and u.estado_cuenta = 'Activo'
      )
      or (
        s.rol = 'propietario'
        and (
          u.id = s.usuario_id
          or exists (
            select 1
              from public.propiedades p
             where p.agencia_id = s.agencia_id
               and p.asesor_id = u.id
               and lower(p.propietario ->> 'correo') = s.correo
          )
        )
      )
      or (s.rol = 'cliente' and u.id = s.usuario_id)
    );
$$;

revoke all on function public.directorio_visible() from public, anon;
grant execute on function public.directorio_visible() to authenticated;

-- El cliente deja de tener UPDATE directo sobre leads. Asesor/broker conservan
-- las operaciones actuales, siempre dentro de su agencia y ownership.
drop policy if exists "leads_update" on public.leads;
create policy "leads_update" on public.leads for update to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or ((select public.soy_asesor()) and asesor_id = (select public.mi_usuario_id()))
    )
  )
  with check (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or ((select public.soy_asesor()) and asesor_id = (select public.mi_usuario_id()))
    )
  );

-- Única escritura permitida al cliente en P0: confirmar una cita que ya existe
-- dentro del cierre de SU lead. La función no acepta JSON ni nombres de
-- columnas, por lo que no puede cambiar agencia, asesor, etapa, BANT o notas.
create or replace function public.cliente_confirmar_cita(p_lead_id text, p_cita_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_indice integer;
begin
  if public.mi_rol_activo() <> 'cliente' then
    raise exception 'Esta operación solo está disponible para clientes.' using errcode = '42501';
  end if;

  select (c.ordinalidad - 1)::integer
    into v_indice
    from public.leads l
    cross join lateral jsonb_array_elements(coalesce(l.cierre -> 'citas', '[]'::jsonb))
      with ordinality as c(cita, ordinalidad)
   where l.id = p_lead_id
     and l.agencia_id = public.mi_agencia_id()
     and lower(l.correo) = public.mi_correo()
     and c.cita ->> 'id' = p_cita_id
     and coalesce(c.cita ->> 'estado', '') <> 'Realizada'
   limit 1;

  if v_indice is null then
    return false;
  end if;

  update public.leads l
     set cierre = jsonb_set(
       l.cierre,
       array['citas', v_indice::text, 'estado'],
       '"Confirmada"'::jsonb,
       false
     )
   where l.id = p_lead_id
     and l.agencia_id = public.mi_agencia_id()
     and lower(l.correo) = public.mi_correo();

  return found;
end;
$$;

revoke all on function public.cliente_confirmar_cita(text, text) from public, anon;
grant execute on function public.cliente_confirmar_cita(text, text) to authenticated;

commit;

