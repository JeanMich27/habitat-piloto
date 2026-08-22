-- Desactiva un asesor y reasigna su trabajo vigente en una sola transacción.
begin;

create or replace function public.desactivar_asesor_y_reasignar(
  p_asesor_id text,
  p_reasignar_a_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agencia text := public.mi_agencia_id();
  v_origen public.usuarios%rowtype;
  v_destino public.usuarios%rowtype;
  v_propiedades integer := 0;
  v_leads integer := 0;
  v_citas integer := 0;
  v_tareas integer := 0;
begin
  if auth.uid() is null then
    raise exception 'La sesión no es válida.' using errcode = '28000';
  end if;
  if not public.es_broker() then
    raise exception 'Solo un broker puede desactivar asesores.' using errcode = '42501';
  end if;
  if nullif(trim(p_asesor_id), '') is null or nullif(trim(p_reasignar_a_id), '') is null
     or p_asesor_id = p_reasignar_a_id then
    raise exception 'La reasignación no es válida.' using errcode = '22023';
  end if;

  select * into v_origen from public.usuarios
   where id = p_asesor_id and agencia_id = v_agencia
   for update;
  if not found then
    raise exception 'El asesor no existe en tu oficina.' using errcode = 'P0002';
  end if;
  if v_origen.rol not in ('asesor_equipo', 'asesor_independiente') then
    raise exception 'La cuenta seleccionada no es un asesor.' using errcode = '22023';
  end if;

  select * into v_destino from public.usuarios
   where id = p_reasignar_a_id and agencia_id = v_agencia
   for update;
  if not found then
    raise exception 'El asesor destino no existe en tu oficina.' using errcode = 'P0002';
  end if;
  if v_destino.estado_cuenta <> 'Activo'
     or v_destino.rol not in ('broker', 'asesor_equipo', 'asesor_independiente') then
    raise exception 'El asesor destino no está activo.' using errcode = '22023';
  end if;

  update public.propiedades set asesor_id = v_destino.id
   where agencia_id = v_agencia and asesor_id = v_origen.id;
  get diagnostics v_propiedades = row_count;

  update public.leads set asesor_id = v_destino.id
   where agencia_id = v_agencia and asesor_id = v_origen.id;
  get diagnostics v_leads = row_count;

  update public.citas set asesor_id = v_destino.id
   where agencia_id = v_agencia
     and asesor_id = v_origen.id
     and estado in ('Agendada', 'Confirmada');
  get diagnostics v_citas = row_count;

  update public.tareas set asesor_id = v_destino.id
   where agencia_id = v_agencia and asesor_id = v_origen.id and estado = 'pendiente';
  get diagnostics v_tareas = row_count;

  update public.usuarios set estado_cuenta = 'Inactivo' where id = v_origen.id;

  return jsonb_build_object(
    'asesor_id', v_origen.id,
    'reasignado_a_id', v_destino.id,
    'propiedades', v_propiedades,
    'leads', v_leads,
    'citas', v_citas,
    'tareas', v_tareas
  );
end;
$$;

revoke all on function public.desactivar_asesor_y_reasignar(text, text) from public, anon;
grant execute on function public.desactivar_asesor_y_reasignar(text, text) to authenticated;

comment on function public.desactivar_asesor_y_reasignar(text, text) is
  'Valida broker y tenant desde auth; reasigna trabajo vigente y desactiva atómicamente.';

commit;
