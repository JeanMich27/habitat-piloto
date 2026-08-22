-- El portal cliente consume la tabla canónica public.citas sin recibir notas privadas.
begin;

create or replace function public.mis_citas_cliente()
returns table (
  id uuid,
  agencia_id text,
  asesor_id text,
  lead_id text,
  propiedad_id text,
  titulo text,
  tipo text,
  inicio timestamptz,
  fin timestamptz,
  ubicacion text,
  notas text,
  estado text,
  creada_por text,
  creado_en timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.agencia_id, c.asesor_id, c.lead_id, c.propiedad_id,
         c.titulo, c.tipo, c.inicio, c.fin, c.ubicacion,
         ''::text as notas, c.estado, null::text as creada_por, c.creado_en
    from public.citas c
    join public.leads l on l.id = c.lead_id and l.agencia_id = c.agencia_id
   where public.mi_rol_activo() = 'cliente'
     and c.agencia_id = public.mi_agencia_id()
     and lower(l.correo) = public.mi_correo()
     and c.inicio >= now() - interval '30 days'
   order by c.inicio;
$$;

revoke all on function public.mis_citas_cliente() from public, anon;
grant execute on function public.mis_citas_cliente() to authenticated;

create or replace function public.cliente_confirmar_cita(p_lead_id text, p_cita_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol_activo() <> 'cliente' then
    raise exception 'Esta operación solo está disponible para clientes.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.citas c
    join public.leads l on l.id = c.lead_id and l.agencia_id = c.agencia_id
    where c.id = p_cita_id::uuid
      and l.id = p_lead_id
      and c.agencia_id = public.mi_agencia_id()
      and lower(l.correo) = public.mi_correo()
      and c.estado = 'Confirmada'
  ) then
    return true;
  end if;

  update public.citas c
     set estado = 'Confirmada'
    from public.leads l
   where c.id = p_cita_id::uuid
     and l.id = p_lead_id
     and l.id = c.lead_id
     and l.agencia_id = c.agencia_id
     and c.agencia_id = public.mi_agencia_id()
     and lower(l.correo) = public.mi_correo()
     and c.estado = 'Agendada';
  return found;
exception
  when invalid_text_representation then return false;
end;
$$;

revoke all on function public.cliente_confirmar_cita(text, text) from public, anon;
grant execute on function public.cliente_confirmar_cita(text, text) to authenticated;

comment on function public.mis_citas_cliente() is
  'Citas del cliente sin notas internas ni datos de otros contactos o tenants.';

commit;
