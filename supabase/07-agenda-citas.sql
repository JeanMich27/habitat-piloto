-- =============================================================================
-- MIGRACIÓN 07 — Agenda de citas
-- Ejecutar DESPUÉS de 05-endurecer-funciones.sql
--
-- Qué agrega:
--   1. Tabla `citas`  — la agenda de campo del asesor.
--   2. Tabla `agenda_feeds` — token privado por usuario para el feed ICS.
--   3. RLS: el broker ve toda su oficina; el asesor solo lo suyo;
--      propietario y cliente NO tienen acceso a ninguna cita.
--
-- Principio heredado de la migración 02: toda política empieza filtrando por
-- `agencia_id`, y las funciones se invocan como (select f()) para que Postgres
-- las evalúe una vez por consulta y no fila por fila.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tabla de citas
-- -----------------------------------------------------------------------------
-- `id` es text para no romper con el resto del esquema (usuarios, leads y
-- propiedades ya usan text y el frontend genera los ids).
create table if not exists public.citas (
  id             text primary key,
  agencia_id     text        not null references public.agencias(id) on delete cascade,
  -- Dueño de la cita. Es el eje de todo el modelo de permisos.
  asesor_id      text        not null references public.usuarios(id) on delete cascade,
  lead_id        text        references public.leads(id)        on delete set null,
  propiedad_id   text        references public.propiedades(id)  on delete set null,
  titulo         text        not null,
  tipo           text        not null default 'visita',
  -- timestamptz, nunca timestamp: una cita guardada sin zona se corre de hora
  -- en cuanto el asesor cruza a otro huso o cambia el horario de verano, y al
  -- exportarla a Google/iPhone el error se vuelve visible para el cliente.
  inicio         timestamptz not null,
  fin            timestamptz not null,
  ubicacion      text        not null default '',
  notas          text        not null default '',
  estado         text        not null default 'Agendada',
  creada_por     text        references public.usuarios(id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint citas_rango_valido  check (fin > inicio),
  constraint citas_tipo_valido   check (tipo in ('visita','llamada','firma','captacion','otro')),
  constraint citas_estado_valido check (estado in ('Agendada','Confirmada','Realizada','No asistió','Cancelada'))
);

-- La consulta dominante es "las citas de este asesor en este rango".
create index if not exists citas_asesor_inicio_idx  on public.citas (agencia_id, asesor_id, inicio);
-- Y la del broker, "todo lo de la oficina en este rango".
create index if not exists citas_agencia_inicio_idx on public.citas (agencia_id, inicio);
create index if not exists citas_lead_idx           on public.citas (lead_id) where lead_id is not null;

-- `actualizado_en` lo controla la base, no el cliente: si lo enviara el
-- frontend, un reloj mal puesto en un teléfono desordenaría el historial.
create or replace function public.tocar_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists citas_actualizado_en on public.citas;
create trigger citas_actualizado_en
  before update on public.citas
  for each row execute function public.tocar_actualizado_en();

-- Integridad entre oficinas: RLS impide escribir en OTRA agencia, pero no
-- impediría por sí sola apuntar `asesor_id` a un usuario de otra oficina si
-- alguna vez se relajara una política. Se valida aquí, en el único lugar que
-- ninguna ruta de escritura puede saltarse.
create or replace function public.validar_cita_misma_agencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.usuarios u
    where u.id = new.asesor_id and u.agencia_id = new.agencia_id
  ) then
    raise exception 'El asesor % no pertenece a la oficina %', new.asesor_id, new.agencia_id;
  end if;
  return new;
end;
$$;

drop trigger if exists citas_valida_agencia on public.citas;
create trigger citas_valida_agencia
  before insert or update of asesor_id, agencia_id on public.citas
  for each row execute function public.validar_cita_misma_agencia();

-- -----------------------------------------------------------------------------
-- 2. Feed ICS: un token privado por usuario
-- -----------------------------------------------------------------------------
-- Tabla aparte, NO una columna en `usuarios`. Motivo concreto: la política de
-- lectura de `usuarios` alcanza a toda la oficina, así que un token guardado
-- ahí sería legible por cualquier compañero — y con la URL del broker en la
-- mano, cualquiera vería la agenda completa de la oficina desde su teléfono.
create table if not exists public.agenda_feeds (
  usuario_id    text        primary key references public.usuarios(id) on delete cascade,
  agencia_id    text        not null references public.agencias(id) on delete cascade,
  token         uuid        not null unique default gen_random_uuid(),
  creado_en     timestamptz not null default now(),
  ultimo_acceso timestamptz
);

-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------
alter table public.citas        enable row level security;
alter table public.agenda_feeds enable row level security;

-- Barrido por tabla, no por nombre: una política vieja sobreviviente se
-- combinaría con OR y anularía el aislamiento (lección de la migración 02).
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('citas','agenda_feeds')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ---------- citas ----------
-- Lectura. `soy_asesor()` es lo que deja fuera a propietario y cliente: sin
-- él, un propietario cuyo id apareciera por error en `asesor_id` vería citas.
create policy citas_select on public.citas
  for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or ((select public.soy_asesor()) and asesor_id = (select public.mi_usuario_id()))
    )
  );

-- Alta. El broker puede agendar por cualquiera de sus asesores (eso es lo que
-- hace útil una agenda de oficina); el asesor solo por sí mismo.
create policy citas_insert on public.citas
  for insert to authenticated
  with check (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or ((select public.soy_asesor()) and asesor_id = (select public.mi_usuario_id()))
    )
  );

create policy citas_update on public.citas
  for update to authenticated
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

-- Borrado. Una cita pasada es evidencia de actividad: se cancela, no se borra.
-- Se deja solo al broker para poder limpiar errores de captura.
create policy citas_delete on public.citas
  for delete to authenticated
  using (agencia_id = (select public.mi_agencia_id()) and (select public.es_broker()));

-- ---------- agenda_feeds ----------
-- Cada quien ve y administra únicamente su propia fila. Ni el broker lee el
-- token de sus asesores: si lo necesita, se genera el suyo.
create policy feeds_propio on public.agenda_feeds
  for all to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and usuario_id = (select public.mi_usuario_id())
  )
  with check (
    agencia_id = (select public.mi_agencia_id())
    and usuario_id = (select public.mi_usuario_id())
  );

-- -----------------------------------------------------------------------------
-- 4. Funciones del feed
-- -----------------------------------------------------------------------------
-- Devuelve el token del usuario y lo crea la primera vez. Idempotente: llamarla
-- N veces devuelve siempre el mismo valor, así el botón "copiar URL" no genera
-- una suscripción nueva cada vez que alguien lo toca.
create or replace function public.mi_token_agenda()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text := public.mi_usuario_id();
  v_agencia text := public.mi_agencia_id();
  v_token   uuid;
begin
  if v_usuario is null or v_agencia is null then
    raise exception 'Sesión sin oficina asignada';
  end if;
  if not public.soy_asesor() then
    raise exception 'Este rol no tiene agenda';
  end if;

  insert into public.agenda_feeds (usuario_id, agencia_id)
  values (v_usuario, v_agencia)
  on conflict (usuario_id) do nothing;

  select token into v_token from public.agenda_feeds where usuario_id = v_usuario;
  return v_token;
end;
$$;

-- Invalida la URL anterior. Se usa cuando un asesor deja la oficina o cree que
-- compartió su enlace de más.
create or replace function public.rotar_token_agenda()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text := public.mi_usuario_id();
  v_token   uuid;
begin
  if v_usuario is null then
    raise exception 'Sesión sin oficina asignada';
  end if;
  perform public.mi_token_agenda();
  update public.agenda_feeds
     set token = gen_random_uuid(), creado_en = now()
   where usuario_id = v_usuario
  returning token into v_token;
  return v_token;
end;
$$;

-- Resuelve un token a las citas que le corresponden. La usa SOLO la Edge
-- Function con `service_role`; jamás el navegador. Por eso no se le concede
-- EXECUTE a authenticated ni a anon (ver punto 5).
create or replace function public.citas_por_token(p_token uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (
  id text, titulo text, inicio timestamptz, fin timestamptz,
  ubicacion text, notas text, estado text, tipo text,
  lead_nombre text, lead_telefono text, propiedad_titulo text, asesor_nombre text
)
language sql
security definer
set search_path = public
as $$
  with duenio as (
    select f.usuario_id, f.agencia_id, u.rol
      from public.agenda_feeds f
      join public.usuarios u on u.id = f.usuario_id
     where f.token = p_token
       and u.estado_cuenta = 'Activo'
  )
  select c.id, c.titulo, c.inicio, c.fin, c.ubicacion, c.notas, c.estado, c.tipo,
         l.nombre, l.telefono, p.titulo, a.nombre
    from public.citas c
    join duenio d
      on d.agencia_id = c.agencia_id
     -- Mismo alcance que la política de lectura: broker toda la oficina,
     -- asesor solo lo suyo. Si se cambia allá, hay que cambiarlo aquí.
     and (d.rol = 'broker' or c.asesor_id = d.usuario_id)
    left join public.leads       l on l.id = c.lead_id
    left join public.propiedades p on p.id = c.propiedad_id
    left join public.usuarios    a on a.id = c.asesor_id
   where c.inicio between p_desde and p_hasta
     and c.estado <> 'Cancelada'
   order by c.inicio;
$$;

create or replace function public.marcar_acceso_feed(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.agenda_feeds set ultimo_acceso = now() where token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- 5. Permisos de ejecución
-- -----------------------------------------------------------------------------
-- Aquí hay DOS mecanismos que conceden permiso, no uno, y hay que cerrar los dos:
--
--   a) PostgreSQL concede EXECUTE a PUBLIC en toda función nueva.
--   b) Supabase, además, tiene privilegios por defecto en el esquema `public`
--      que conceden EXECUTE a `anon` y `authenticated` DIRECTAMENTE.
--
-- (b) es la parte que muerde: `revoke ... from public` deja intacta la
-- concesión directa a anon. Se comprobó contra esta misma base — se creó una
-- función de prueba, se revocó de PUBLIC y `has_function_privilege('anon', ...)`
-- seguía devolviendo true. Por eso cada revoke nombra a los tres.
revoke execute on function public.mi_token_agenda()          from public, anon;
revoke execute on function public.rotar_token_agenda()       from public, anon;
revoke execute on function public.citas_por_token(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.marcar_acceso_feed(uuid)   from public, anon, authenticated;
revoke execute on function public.validar_cita_misma_agencia() from public, anon, authenticated;
revoke execute on function public.tocar_actualizado_en()     from public, anon, authenticated;

grant execute on function public.mi_token_agenda()    to authenticated;
grant execute on function public.rotar_token_agenda() to authenticated;
-- citas_por_token y marcar_acceso_feed: solo service_role (la Edge Function).
-- Ningún navegador debe poder llamarlas, ni con sesión iniciada.

-- -----------------------------------------------------------------------------
-- 6. Realtime
-- -----------------------------------------------------------------------------
-- Para que el asesor vea aparecer en su teléfono la cita que el broker le
-- acaba de agendar, sin recargar.
do $$
begin
  alter publication supabase_realtime add table public.citas;
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Cerrojo: la migración se niega a terminar si quedó algo abierto
-- -----------------------------------------------------------------------------
-- Comprobar a mano después de aplicar es opcional, y lo opcional se olvida.
-- Esto revienta la transacción entera antes del commit.
do $$
begin
  if has_function_privilege('anon', 'public.citas_por_token(uuid, timestamptz, timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.citas_por_token(uuid, timestamptz, timestamptz)', 'EXECUTE') then
    raise exception 'citas_por_token sigue siendo ejecutable desde el navegador';
  end if;
  if has_function_privilege('anon', 'public.marcar_acceso_feed(uuid)', 'EXECUTE') then
    raise exception 'marcar_acceso_feed sigue siendo ejecutable por anon';
  end if;
  if has_function_privilege('anon', 'public.mi_token_agenda()', 'EXECUTE') then
    raise exception 'mi_token_agenda sigue siendo ejecutable por anon';
  end if;
  if not has_function_privilege('authenticated', 'public.mi_token_agenda()', 'EXECUTE') then
    raise exception 'mi_token_agenda quedó inaccesible para las sesiones reales';
  end if;
end $$;

commit;

-- =============================================================================
-- Verificación rápida (ejecutar aparte, con la sesión de un asesor)
-- =============================================================================
-- select count(*) from public.citas;              -- solo las suyas
-- select public.mi_token_agenda();                -- devuelve siempre el mismo
-- select * from public.agenda_feeds;              -- exactamente 1 fila
