-- Ficha pública propia de cada inmueble. El slug es estable y no revela el id
-- interno; las dos RPC públicas sólo son invocables por Edge Functions con
-- service_role, nunca directamente desde el navegador.

alter table public.propiedades
  add column if not exists slug_publico text;

comment on column public.propiedades.slug_publico is
  'Identificador estable para /inmueble/:slug. No es el id interno ni una URL de un CRM externo.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'propiedades_slug_publico_formato'
      and conrelid = 'public.propiedades'::regclass
  ) then
    alter table public.propiedades
      add constraint propiedades_slug_publico_formato
      check (slug_publico is null or slug_publico ~ '^[a-z0-9-]{1,120}$');
  end if;
end $$;

create unique index if not exists propiedades_slug_publico_key
  on public.propiedades (slug_publico)
  where slug_publico is not null;

create or replace function public.propiedades_generar_slug_publico()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  base text;
begin
  if nullif(trim(new.slug_publico), '') is not null then
    new.slug_publico := lower(trim(new.slug_publico));
    return new;
  end if;

  base := public.slug_de_texto(coalesce(nullif(trim(new.titulo), ''), 'inmueble'));
  new.slug_publico := left(base, 105) || '-' || left(md5(new.agencia_id || ':' || new.id), 10);
  return new;
end;
$$;

drop trigger if exists propiedades_generar_slug_publico on public.propiedades;
create trigger propiedades_generar_slug_publico
before insert or update of titulo, slug_publico on public.propiedades
for each row execute function public.propiedades_generar_slug_publico();

-- Backfill idempotente para el inventario ya existente.
update public.propiedades
set slug_publico = null
where slug_publico is null;

create or replace function public.propiedad_publica_por_slug(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'slug', p.slug_publico,
    'titulo', p.titulo,
    'precio', p.precio,
    'tipo_operacion', p.tipo_operacion,
    'tipo_inmueble', p.tipo_inmueble,
    'descripcion', p.descripcion,
    'municipio', p.municipio,
    'estado', p.estado,
    'colonia', p.colonia,
    'recamaras', p.recamaras,
    'banos', p.banos,
    'medios_banos', p.medios_banos,
    'm2', p.m2,
    'm2_terreno', p.m2_terreno,
    'estacionamientos', p.estacionamientos,
    'imagenes', coalesce(p.imagenes, '[]'::jsonb),
    'amenidades', coalesce(p.amenidades, '[]'::jsonb),
    'asesor', jsonb_build_object(
      'nombre', u.nombre,
      'puesto', u.puesto,
      'foto_url', u.foto_url,
      'telefono', u.telefono,
      'slug', u.slug_publico
    ),
    'oficina', jsonb_build_object(
      'nombre', a.nombre,
      'logo_url', a.logo_url,
      'sitio_web', a.sitio_web
    )
  )
  from public.propiedades p
  join public.usuarios u
    on u.id = p.asesor_id
   and u.agencia_id = p.agencia_id
  join public.agencias a on a.id = p.agencia_id
  where p.slug_publico = p_slug
    and p.estatus = 'Publicada'
    and u.estado_cuenta = 'Activo'
    and u.rol in ('broker', 'asesor_independiente', 'asesor_equipo')
  limit 1;
$$;

revoke all on function public.propiedad_publica_por_slug(text) from public;
revoke all on function public.propiedad_publica_por_slug(text) from anon;
revoke all on function public.propiedad_publica_por_slug(text) from authenticated;
grant execute on function public.propiedad_publica_por_slug(text) to service_role;

-- El micrositio deja de exponer ids internos y enlaces de EasyBroker. Cada
-- tarjeta recibe únicamente el slug de la ficha pública de la plataforma.
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
        'slug', p.slug_publico,
        'titulo', p.titulo,
        'precio', p.precio,
        'ubicacion', coalesce(nullif(p.colonia, ''), p.municipio),
        'municipio', p.municipio,
        'recamaras', p.recamaras,
        'banos', p.banos,
        'm2', p.m2,
        'imagen', p.imagenes -> 0,
        'tipo_operacion', p.tipo_operacion,
        'tipo_inmueble', p.tipo_inmueble
      ) order by p.publicada_el desc nulls last)
      from public.propiedades p
      where p.asesor_id = u.id
        and p.agencia_id = u.agencia_id
        and p.estatus = 'Publicada'
        and p.slug_publico is not null
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
grant execute on function public.perfil_publico_por_slug(text) to service_role;
