-- Micrositio público: defensa en profundidad para el aislamiento de inventario.
-- `propiedades_coherencia_agencia` ya impide asignar una propiedad a un asesor
-- de otra oficina, pero esta RPC es SECURITY DEFINER y sirve datos sin sesión.
-- Por eso valida la agencia también en la propia consulta de salida.

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
        and p.agencia_id = u.agencia_id
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
