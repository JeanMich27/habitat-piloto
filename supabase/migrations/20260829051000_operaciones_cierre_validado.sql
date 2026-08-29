-- =============================================================================
-- Operaciones: asesor reporta, broker valida, cierre e historial son atómicos
-- =============================================================================

begin;

create table if not exists public.operaciones (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id),
  lead_id text not null references public.leads(id) on delete cascade,
  propiedad_id text references public.propiedades(id) on delete set null,
  propiedad_referencia text,
  crm_propiedad_id text,
  estado_validacion text not null default 'reportada'
    check (estado_validacion in ('reportada','devuelta','validada','cancelada')),
  reportado_por text not null references public.usuarios(id),
  reportado_en timestamptz not null default now(),
  tipo_operacion text check (tipo_operacion in ('Venta','Renta')),
  fecha_cierre timestamptz,
  monto_final numeric(15,2) check (monto_final is null or monto_final >= 0),
  moneda text not null default 'MXN' check (moneda ~ '^[A-Z]{3}$'),
  comision_bruta_confirmada numeric(15,2)
    check (comision_bruta_confirmada is null or comision_bruta_confirmada >= 0),
  comentario_asesor text,
  observacion_broker text,
  resuelto_por text references public.usuarios(id),
  resuelto_en timestamptz,
  datos_reportados_originales jsonb not null default '{}'::jsonb,
  historial_revisiones jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (jsonb_typeof(datos_reportados_originales) = 'object'),
  check (jsonb_typeof(historial_revisiones) = 'array')
);

create index if not exists operaciones_agencia_estado_idx
  on public.operaciones (agencia_id, estado_validacion, reportado_en desc);
create index if not exists operaciones_lead_idx
  on public.operaciones (lead_id, reportado_en desc);
create unique index if not exists operaciones_reportada_unica
  on public.operaciones (lead_id)
  where estado_validacion = 'reportada';

alter table public.operaciones enable row level security;

revoke all on table public.operaciones from public, anon, authenticated;
grant select on table public.operaciones to authenticated;
grant all on table public.operaciones to service_role;

drop policy if exists operaciones_select on public.operaciones;
create policy operaciones_select on public.operaciones
  for select to authenticated
  using (
    agencia_id = (select public.mi_agencia_id())
    and (
      (select public.es_broker())
      or reportado_por = (select public.mi_usuario_id())
      or exists (
        select 1 from public.leads l
         where l.id = lead_id
           and l.agencia_id = operaciones.agencia_id
           and l.asesor_id = (select public.mi_usuario_id())
      )
    )
  );

-- No hay políticas INSERT/UPDATE/DELETE: todas las mutaciones pasan por RPC.

create or replace function public.reportar_operacion(
  p_lead_id text,
  p_propiedad_id text default null,
  p_propiedad_referencia text default null,
  p_crm_propiedad_id text default null,
  p_tipo_operacion text default null,
  p_fecha_cierre timestamptz default null,
  p_monto_final numeric default null,
  p_moneda text default 'MXN',
  p_comision_bruta_confirmada numeric default null,
  p_comentario text default null
)
returns public.operaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agencia text := public.mi_agencia_id();
  v_usuario text := public.mi_usuario_id();
  v_rol text := public.mi_rol_activo();
  v_lead public.leads%rowtype;
  v_operacion public.operaciones%rowtype;
  v_datos jsonb;
begin
  if v_agencia is null or v_usuario is null
     or v_rol not in ('broker','asesor_equipo','asesor_independiente') then
    raise exception 'Tu cuenta no puede reportar operaciones.' using errcode = '42501';
  end if;

  select * into v_lead from public.leads
   where id = p_lead_id and agencia_id = v_agencia
   for update;
  if not found then
    raise exception 'El cliente no pertenece a tu oficina.' using errcode = '23503';
  end if;
  if v_rol <> 'broker' and v_lead.asesor_id is distinct from v_usuario then
    raise exception 'Solo puedes reportar operaciones de tus clientes.' using errcode = '42501';
  end if;
  if v_lead.estado_lead = 'Ganado' or exists (
    select 1 from public.operaciones o
     where o.lead_id = p_lead_id and o.estado_validacion = 'validada'
  ) then
    raise exception 'Este cliente ya tiene una operación validada.' using errcode = '40001';
  end if;

  if p_propiedad_id is not null and not exists (
    select 1 from public.propiedades p
     where p.id = p_propiedad_id and p.agencia_id = v_agencia
  ) then
    raise exception 'La propiedad no pertenece a tu oficina.' using errcode = '23503';
  end if;
  if p_tipo_operacion is not null and p_tipo_operacion not in ('Venta','Renta') then
    raise exception 'El tipo de operación no es válido.' using errcode = '22023';
  end if;
  if p_monto_final is not null and p_monto_final < 0 then
    raise exception 'El monto final no puede ser negativo.' using errcode = '22003';
  end if;
  if p_comision_bruta_confirmada is not null and p_comision_bruta_confirmada < 0 then
    raise exception 'La comisión no puede ser negativa.' using errcode = '22003';
  end if;

  v_datos := jsonb_strip_nulls(jsonb_build_object(
    'propiedad_id', p_propiedad_id,
    'propiedad_referencia', nullif(trim(p_propiedad_referencia), ''),
    'crm_propiedad_id', nullif(trim(p_crm_propiedad_id), ''),
    'tipo_operacion', p_tipo_operacion,
    'fecha_cierre', p_fecha_cierre,
    'monto_final', p_monto_final,
    'moneda', upper(coalesce(nullif(trim(p_moneda), ''), 'MXN')),
    'comision_bruta_confirmada', p_comision_bruta_confirmada,
    'comentario', nullif(trim(p_comentario), '')
  ));

  select * into v_operacion from public.operaciones
   where lead_id = p_lead_id and estado_validacion = 'devuelta'
   order by reportado_en desc limit 1 for update;

  if found then
    update public.operaciones
       set propiedad_id = p_propiedad_id,
           propiedad_referencia = nullif(trim(p_propiedad_referencia), ''),
           crm_propiedad_id = nullif(trim(p_crm_propiedad_id), ''),
           estado_validacion = 'reportada',
           tipo_operacion = p_tipo_operacion,
           fecha_cierre = p_fecha_cierre,
           monto_final = p_monto_final,
           moneda = upper(coalesce(nullif(trim(p_moneda), ''), 'MXN')),
           comision_bruta_confirmada = p_comision_bruta_confirmada,
           comentario_asesor = nullif(trim(p_comentario), ''),
           observacion_broker = null,
           resuelto_por = null,
           resuelto_en = null,
           historial_revisiones = historial_revisiones || jsonb_build_array(
             jsonb_build_object('tipo','reenviada','fecha',now(),'actor_id',v_usuario,'datos',v_datos)
           ),
           version = version + 1,
           actualizado_en = now()
     where id = v_operacion.id
     returning * into v_operacion;
  else
    insert into public.operaciones (
      agencia_id, lead_id, propiedad_id, propiedad_referencia, crm_propiedad_id,
      reportado_por, tipo_operacion, fecha_cierre, monto_final, moneda,
      comision_bruta_confirmada, comentario_asesor,
      datos_reportados_originales, historial_revisiones
    ) values (
      v_agencia, p_lead_id, p_propiedad_id, nullif(trim(p_propiedad_referencia), ''),
      nullif(trim(p_crm_propiedad_id), ''), v_usuario, p_tipo_operacion,
      p_fecha_cierre, p_monto_final, upper(coalesce(nullif(trim(p_moneda), ''), 'MXN')),
      p_comision_bruta_confirmada, nullif(trim(p_comentario), ''), v_datos,
      jsonb_build_array(jsonb_build_object('tipo','reportada','fecha',now(),'actor_id',v_usuario,'datos',v_datos))
    ) returning * into v_operacion;
  end if;

  update public.leads
     set historial = coalesce(historial, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
       'id', 'op-reportada-' || v_operacion.id::text,
       'fecha', now(), 'tipo', 'Etapa',
       'descripcion', 'Operación reportada; pendiente de validación del broker',
       'autor', (select nombre from public.usuarios where id = v_usuario)
     ))
   where id = p_lead_id and agencia_id = v_agencia;

  return v_operacion;
end;
$$;

create or replace function public.resolver_operacion(
  p_operacion_id uuid,
  p_resultado text,
  p_observacion text default null,
  p_tipo_operacion text default null,
  p_fecha_cierre timestamptz default null,
  p_monto_final numeric default null,
  p_moneda text default null,
  p_comision_bruta_confirmada numeric default null,
  p_propiedad_id text default null,
  p_propiedad_referencia text default null,
  p_crm_propiedad_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agencia text := public.mi_agencia_id();
  v_usuario text := public.mi_usuario_id();
  v_operacion public.operaciones%rowtype;
  v_fecha timestamptz;
  v_brokers integer;
  v_autovalidada boolean := false;
  v_lead public.leads%rowtype;
  v_propiedad public.propiedades%rowtype;
begin
  if v_agencia is null or v_usuario is null or not public.es_broker() then
    raise exception 'Solo un broker puede resolver operaciones.' using errcode = '42501';
  end if;
  if p_resultado not in ('validada','devuelta') then
    raise exception 'La resolución no es válida.' using errcode = '22023';
  end if;

  select * into v_operacion from public.operaciones
   where id = p_operacion_id and agencia_id = v_agencia
   for update;
  if not found then
    raise exception 'La operación no pertenece a tu oficina.' using errcode = '23503';
  end if;
  if v_operacion.estado_validacion <> 'reportada' then
    raise exception 'La operación ya fue resuelta.' using errcode = '40001';
  end if;

  if p_resultado = 'devuelta' then
    if nullif(trim(p_observacion), '') is null then
      raise exception 'Explica qué debe corregir el asesor.' using errcode = '23502';
    end if;
    update public.operaciones
       set estado_validacion = 'devuelta', observacion_broker = trim(p_observacion),
           resuelto_por = v_usuario, resuelto_en = now(),
           historial_revisiones = historial_revisiones || jsonb_build_array(
             jsonb_build_object('tipo','devuelta','fecha',now(),'actor_id',v_usuario,'observacion',trim(p_observacion))
           ),
           version = version + 1, actualizado_en = now()
     where id = p_operacion_id returning * into v_operacion;
    return jsonb_build_object('operacion', to_jsonb(v_operacion));
  end if;

  select count(*) into v_brokers from public.usuarios
   where agencia_id = v_agencia and rol = 'broker' and estado_cuenta = 'Activo';
  if v_operacion.reportado_por = v_usuario and v_brokers > 1 then
    raise exception 'Otro broker activo debe validar esta operación.' using errcode = '42501';
  end if;
  v_autovalidada := v_operacion.reportado_por = v_usuario;

  if coalesce(p_tipo_operacion, v_operacion.tipo_operacion) not in ('Venta','Renta') then
    raise exception 'Indica si fue venta o renta.' using errcode = '23502';
  end if;
  v_fecha := coalesce(p_fecha_cierre, v_operacion.fecha_cierre, now());
  if coalesce(p_monto_final, v_operacion.monto_final) is not null
     and coalesce(p_monto_final, v_operacion.monto_final) < 0 then
    raise exception 'El monto final no puede ser negativo.' using errcode = '22003';
  end if;
  if coalesce(p_comision_bruta_confirmada, v_operacion.comision_bruta_confirmada) is not null
     and coalesce(p_comision_bruta_confirmada, v_operacion.comision_bruta_confirmada) < 0 then
    raise exception 'La comisión no puede ser negativa.' using errcode = '22003';
  end if;
  if p_propiedad_id is not null and not exists (
    select 1 from public.propiedades p
     where p.id = p_propiedad_id and p.agencia_id = v_agencia
  ) then
    raise exception 'La propiedad no pertenece a tu oficina.' using errcode = '23503';
  end if;

  update public.operaciones
     set estado_validacion = 'validada',
         tipo_operacion = coalesce(p_tipo_operacion, tipo_operacion),
         fecha_cierre = v_fecha,
         propiedad_id = p_propiedad_id,
         propiedad_referencia = nullif(trim(p_propiedad_referencia), ''),
         crm_propiedad_id = nullif(trim(p_crm_propiedad_id), ''),
         monto_final = p_monto_final,
         moneda = upper(coalesce(nullif(trim(p_moneda), ''), moneda, 'MXN')),
         comision_bruta_confirmada = p_comision_bruta_confirmada,
         observacion_broker = nullif(trim(p_observacion), ''),
         resuelto_por = v_usuario, resuelto_en = now(),
         historial_revisiones = historial_revisiones || jsonb_build_array(jsonb_build_object(
           'tipo','validada','fecha',now(),'actor_id',v_usuario,'autovalidada',v_autovalidada,
           'tipo_operacion',coalesce(p_tipo_operacion,tipo_operacion),'fecha_cierre',v_fecha,
           'propiedad_id',p_propiedad_id,'propiedad_referencia',nullif(trim(p_propiedad_referencia),''),
           'monto_final',p_monto_final,
           'comision_bruta_confirmada',p_comision_bruta_confirmada
         )),
         version = version + 1, actualizado_en = now()
   where id = p_operacion_id returning * into v_operacion;

  perform set_config('app.validando_operacion', '1', true);
  update public.leads
     set etapa = 'Cierre', estado_lead = 'Ganado', cerrado_en = v_fecha,
         cerrado_por = (select nombre from public.usuarios where id = v_operacion.reportado_por),
         familia_perdida = null, motivo_perdida = null, detalle_perdida = null,
         historial = coalesce(historial, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'id', 'op-validada-' || v_operacion.id::text,
           'fecha', now(), 'tipo', 'Etapa',
           'descripcion', 'Operación validada por el broker' || case when v_autovalidada then ' (autovalidación auditada)' else '' end,
           'autor', (select nombre from public.usuarios where id = v_usuario)
         ))
   where id = v_operacion.lead_id and agencia_id = v_agencia
   returning * into v_lead;

  if v_operacion.propiedad_id is not null then
    update public.propiedades
       set estatus = 'Vendida o Rentada', ultima_actividad = now()
     where id = v_operacion.propiedad_id and agencia_id = v_agencia
     returning * into v_propiedad;
  end if;

  return jsonb_build_object(
    'operacion', to_jsonb(v_operacion), 'lead', to_jsonb(v_lead),
    'propiedad', case when v_propiedad.id is null then null else to_jsonb(v_propiedad) end,
    'autovalidada', v_autovalidada
  );
end;
$$;

create or replace function public.proteger_ganado_por_operacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.estado_lead = 'Ganado'
     and new.estado_lead is distinct from 'Ganado'
     and exists (
       select 1 from public.operaciones o
        where o.lead_id = old.id and o.estado_validacion = 'validada'
     ) then
    raise exception 'Un cierre validado no puede reabrirse sin cancelar primero la operación.'
      using errcode = '42501';
  end if;
  if new.estado_lead = 'Ganado'
     and (tg_op = 'INSERT' or old.estado_lead is distinct from 'Ganado')
     and (
       coalesce(current_setting('app.validando_operacion', true), '') <> '1'
       or not exists (
         select 1 from public.operaciones o
          where o.lead_id = new.id and o.estado_validacion = 'validada'
       )
     ) then
    raise exception 'Una operación debe ser validada por el broker antes de marcarse como ganada.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_proteger_ganado_por_operacion on public.leads;
create trigger leads_proteger_ganado_por_operacion
  before insert or update of estado_lead on public.leads
  for each row execute function public.proteger_ganado_por_operacion();

revoke all on function public.reportar_operacion(text,text,text,text,text,timestamptz,numeric,text,numeric,text) from public, anon;
grant execute on function public.reportar_operacion(text,text,text,text,text,timestamptz,numeric,text,numeric,text) to authenticated;
revoke all on function public.resolver_operacion(uuid,text,text,text,timestamptz,numeric,text,numeric,text,text,text) from public, anon;
grant execute on function public.resolver_operacion(uuid,text,text,text,timestamptz,numeric,text,numeric,text,text,text) to authenticated;
revoke execute on function public.proteger_ganado_por_operacion() from public, anon, authenticated;

commit;
