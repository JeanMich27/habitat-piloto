-- ============================================================================
-- Micrositio del asesor: campos de perfil público, slug autogenerado,
-- función pública de solo lectura (mismo patrón que citas_por_token) y
-- notificación "actualiza tu perfil" para micrositios incompletos.
--
-- Decisión de Jean (26 ago 2026): el micrositio siempre está activo, sin
-- aprobación del broker y sin gate de campos obligatorios — es
-- responsabilidad del asesor llenarlo bien. Por eso no hay ningún check que
-- bloquee la publicación; en su lugar, una notificación recurrente le
-- recuerda completarlo.
-- ============================================================================

-- 1) Columnas nuevas en usuarios. Todas nullable/con default vacío — ninguna
--    bloquea nada, el micrositio se sirve igual estén o no llenas.
alter table public.usuarios
  add column if not exists foto_url text,
  add column if not exists bio_corta text,
  add column if not exists especialidades text[] not null default '{}',
  add column if not exists anos_experiencia smallint,
  add column if not exists idiomas text[] not null default '{}',
  add column if not exists certificaciones text[] not null default '{}',
  add column if not exists redes_sociales jsonb not null default '[]'::jsonb,
  add column if not exists slug_publico text;

comment on column public.usuarios.foto_url is 'Foto de perfil pública para el micrositio. No existía ninguna imagen de asesor antes de esto.';
comment on column public.usuarios.bio_corta is 'Bio pública del micrositio, máx. 280 caracteres (usuarios_bio_corta_longitud).';
comment on column public.usuarios.especialidades is 'Zonas/tipos de propiedad en los que se especializa, para el micrositio.';
comment on column public.usuarios.slug_publico is 'Slug único para la URL pública del micrositio. Se autogenera desde nombre, nunca expone el id interno.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usuarios_bio_corta_longitud') then
    alter table public.usuarios
      add constraint usuarios_bio_corta_longitud
      check (bio_corta is null or char_length(bio_corta) <= 280);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_anos_experiencia_no_negativo') then
    alter table public.usuarios
      add constraint usuarios_anos_experiencia_no_negativo
      check (anos_experiencia is null or anos_experiencia >= 0);
  end if;
end $$;

create unique index if not exists usuarios_slug_publico_key
  on public.usuarios (slug_publico)
  where slug_publico is not null;

-- 2) Autogenerar slug_publico a partir del nombre, reusando slug_de_texto()
--    (ya existe, mismo helper usado en alta de oficinas). Nunca se pisa un
--    slug ya asignado, así que la URL del asesor no cambia sola.
create or replace function public.usuarios_generar_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  intento int := 0;
begin
  if new.slug_publico is not null and new.slug_publico <> '' then
    return new;
  end if;

  base := public.slug_de_texto(new.nombre);
  if base is null or base = '' then
    base := 'asesor';
  end if;

  candidate := base;
  while exists (
    select 1 from public.usuarios u
    where u.slug_publico = candidate and u.id <> new.id
  ) loop
    intento := intento + 1;
    candidate := base || '-' || intento::text;
  end loop;

  new.slug_publico := candidate;
  return new;
end;
$$;

drop trigger if exists trg_usuarios_generar_slug on public.usuarios;
create trigger trg_usuarios_generar_slug
  before insert or update of nombre on public.usuarios
  for each row
  execute function public.usuarios_generar_slug();

-- Backfill: dispara el trigger sobre las filas ya existentes sin slug
-- (UPDATE OF nombre se activa por listar la columna, aunque el valor no
-- cambie). Es la razón por la que el micrositio de los asesores actuales
-- queda activo hoy mismo, sin esperar a que editen su nombre.
update public.usuarios set nombre = nombre where slug_publico is null;

-- 3) Función pública de solo lectura. Mismo hallazgo de seguridad que
--    citas_por_token: revocar EXECUTE de PUBLIC no basta en Supabase, hay que
--    nombrar explícitamente a anon y authenticated también. Solo la llama la
--    Edge Function con service_role.
create or replace function public.perfil_publico_por_slug(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'nombre', u.nombre,
    'puesto', u.puesto,
    'foto_url', u.foto_url,
    'bio_corta', u.bio_corta,
    'especialidades', to_jsonb(u.especialidades),
    'anos_experiencia', u.anos_experiencia,
    'idiomas', to_jsonb(u.idiomas),
    'certificaciones', to_jsonb(u.certificaciones),
    'redes_sociales', u.redes_sociales,
    'telefono', u.telefono,
    'perfil_completo', (
      u.foto_url is not null
      and u.bio_corta is not null
      and coalesce(array_length(u.especialidades, 1), 0) > 0
    ),
    'oficina', jsonb_build_object(
      'nombre', a.nombre,
      'logo_url', a.logo_url,
      'sitio_web', a.sitio_web
    ),
    'propiedades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'titulo', p.titulo,
        'precio', p.precio,
        'ubicacion', p.ubicacion,
        'municipio', p.municipio,
        'recamaras', p.recamaras,
        'banos', p.banos,
        'm2', p.m2,
        'imagen', p.imagenes -> 0,
        'eb_public_url', p.eb_public_url
      ) order by p.publicada_el desc nulls last)
      from public.propiedades p
      where p.asesor_id = u.id
        and p.estatus = 'Publicada'
    ), '[]'::jsonb)
  )
  from public.usuarios u
  join public.agencias a on a.id = u.agencia_id
  where u.slug_publico = p_slug
    and u.rol in ('broker', 'asesor_independiente', 'asesor_equipo')
    and u.estado_cuenta = 'Activo'
  limit 1;
$$;

revoke all on function public.perfil_publico_por_slug(text) from public;
revoke all on function public.perfil_publico_por_slug(text) from anon;
revoke all on function public.perfil_publico_por_slug(text) from authenticated;

-- 4) Notificación "actualiza tu perfil". No bloquea nada — solo avisa.
--    Evita duplicar: no crea una nueva si ya hay una sin leer del mismo tipo.
create or replace function public.evaluar_notificaciones_micrositio()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creadas integer := 0;
  r record;
  v_faltantes text[];
begin
  for r in
    select u.id, u.agencia_id, u.foto_url, u.bio_corta, u.especialidades
    from public.usuarios u
    where u.rol in ('broker', 'asesor_independiente', 'asesor_equipo')
      and u.estado_cuenta = 'Activo'
  loop
    v_faltantes := array[]::text[];
    if r.foto_url is null then
      v_faltantes := array_append(v_faltantes, 'foto');
    end if;
    if r.bio_corta is null then
      v_faltantes := array_append(v_faltantes, 'bio');
    end if;
    if coalesce(array_length(r.especialidades, 1), 0) = 0 then
      v_faltantes := array_append(v_faltantes, 'especialidades');
    end if;

    if array_length(v_faltantes, 1) > 0
       and not exists (
         select 1 from public.notificaciones n
         where n.destinatario_id = r.id
           and n.tipo = 'micrositio_incompleto'
           and n.leida = false
       )
    then
      insert into public.notificaciones (agencia_id, destinatario_id, tipo, titulo, cuerpo, datos)
      values (
        r.agencia_id, r.id, 'micrositio_incompleto',
        'Actualiza tu perfil',
        'Tu micrositio ya está activo y visible para tus clientes, pero le falta información para verse completo. Complétalo en tu Perfil.',
        jsonb_build_object('faltantes', to_jsonb(v_faltantes))
      );
      v_creadas := v_creadas + 1;
    end if;
  end loop;

  return v_creadas;
end;
$$;

revoke all on function public.evaluar_notificaciones_micrositio() from public;
revoke all on function public.evaluar_notificaciones_micrositio() from anon;
revoke all on function public.evaluar_notificaciones_micrositio() from authenticated;

-- 5) Revisión recurrente (lunes 9am CDMX = 15:00 UTC). Best-effort: si
--    pg_cron no está disponible tal como se espera en este proyecto, no
--    debe tumbar el resto de la migración por eso.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'evaluar_notificaciones_micrositio_semanal') then
    perform cron.schedule(
      'evaluar_notificaciones_micrositio_semanal',
      '0 15 * * 1',
      $cron$select public.evaluar_notificaciones_micrositio();$cron$
    );
  end if;
exception when others then
  raise notice 'pg_cron scheduling omitido: %', sqlerrm;
end $$;
