-- Agregados para propietario: métricas reales sin exponer PII, notas ni BANT.
begin;

create or replace function public.metricas_propietario()
returns table (
  propiedad_id text,
  leads integer,
  visitas integer,
  ofertas integer,
  actividad integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         count(l.id)::integer,
         count(l.id) filter (where l.etapa in ('Visitado', 'Negociacion', 'Cierre'))::integer,
         count(l.id) filter (where l.monto_oferta is not null)::integer,
         coalesce(jsonb_array_length(coalesce(p.eventos, '[]'::jsonb)), 0)::integer
    from public.propiedades p
    left join public.leads l
      on l.agencia_id = p.agencia_id and l.interes_propiedad_id = p.id
   where public.mi_rol_activo() = 'propietario'
     and p.agencia_id = public.mi_agencia_id()
     and lower(coalesce(p.propietario ->> 'correo', '')) = public.mi_correo()
   group by p.id, p.eventos
   order by p.id;
$$;

revoke all on function public.metricas_propietario() from public, anon;
grant execute on function public.metricas_propietario() to authenticated;

comment on function public.metricas_propietario() is
  'Agrega actividad de las propiedades propias; no devuelve identidades, contacto, notas ni BANT de leads.';

commit;
