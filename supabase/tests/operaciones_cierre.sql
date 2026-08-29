begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

insert into public.agencias (id, nombre, direccion, slug, estado, plan, codigo_invitacion)
values
  ('op-test-a', 'Operaciones A', '', 'op-test-a', 'prueba', 'prueba', 'OPTA'),
  ('op-test-b', 'Operaciones B', '', 'op-test-b', 'prueba', 'prueba', 'OPTB');

insert into public.usuarios
  (id, agencia_id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta)
values
  ('op-broker-a', 'op-test-a', '61000000-0000-4000-8000-000000000001', 'Broker A', 'op-ba@test.mx', '', 'broker', 'Broker', 'BA', 'Activo'),
  ('op-asesor-a', 'op-test-a', '61000000-0000-4000-8000-000000000002', 'Asesor A', 'op-aa@test.mx', '', 'asesor_equipo', 'Asesor', 'AA', 'Activo'),
  ('op-broker-b', 'op-test-b', '62000000-0000-4000-8000-000000000001', 'Broker B', 'op-bb@test.mx', '', 'broker', 'Broker', 'BB', 'Activo');

insert into public.propiedades (id, agencia_id, titulo, tipo_inmueble, tipo_operacion, asesor_id, propietario)
values ('op-prop-a', 'op-test-a', 'Propiedad A', 'Casa', 'Venta', 'op-asesor-a', '{}');
insert into public.leads (id, agencia_id, nombre, telefono, etapa, origen, asesor_id, interes_propiedad_id)
values
  ('op-lead-a', 'op-test-a', 'Lead A', '', 'Cierre', 'Directo', 'op-asesor-a', 'op-prop-a'),
  ('op-lead-self-one', 'op-test-a', 'Lead Broker Único', '', 'Cierre', 'Directo', 'op-broker-a', ''),
  ('op-lead-self-multi', 'op-test-a', 'Lead Dos Brokers', '', 'Cierre', 'Directo', 'op-broker-a', ''),
  ('op-lead-b', 'op-test-b', 'Lead B', '', 'Cierre', 'Directo', 'op-broker-b', '');

select has_table('public', 'operaciones', 'existe la tabla de operaciones');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$select public.reportar_operacion('op-lead-a')$$,
  'el asesor puede reportar sin inventar importes ni comisión'
);
select results_eq(
  $$select estado_validacion from public.operaciones where lead_id='op-lead-a'$$,
  array['reportada']::text[],
  'el reporte queda pendiente'
);
select results_eq(
  $$select estado_lead from public.leads where id='op-lead-a'$$,
  array['Activo']::text[],
  'reportar no marca el lead como ganado'
);
select throws_ok(
  $$update public.leads set estado_lead='Ganado' where id='op-lead-a'$$,
  '42501', 'Una operación debe ser validada por el broker antes de marcarse como ganada.',
  'el asesor no puede saltarse la validación'
);
select throws_ok(
  $$select public.reportar_operacion('op-lead-b')$$,
  '23503', 'El cliente no pertenece a tu oficina.',
  'no permite reportar un lead de otra oficina'
);

select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.resolver_operacion(
    p_operacion_id => (select id from public.operaciones where lead_id='op-lead-a'),
    p_resultado => 'validada', p_tipo_operacion => 'Venta',
    p_fecha_cierre => '2026-08-28T18:00:00Z', p_monto_final => 2500000,
    p_moneda => 'MXN', p_comision_bruta_confirmada => null,
    p_propiedad_id => 'op-prop-a'
  )$$,
  'el broker valida en una operación atómica'
);
select results_eq(
  $$select estado_validacion from public.operaciones where lead_id='op-lead-a'$$,
  array['validada']::text[],
  'la operación queda validada'
);
select results_eq(
  $$select estado_lead from public.leads where id='op-lead-a'$$,
  array['Ganado']::text[],
  'la validación marca el lead como ganado'
);
select results_eq(
  $$select estatus from public.propiedades where id='op-prop-a'$$,
  array['Vendida o Rentada']::text[],
  'la validación cierra la propiedad vinculada'
);
select is(
  (select comision_bruta_confirmada from public.operaciones where lead_id='op-lead-a'),
  null::numeric,
  'un cierre validado puede conservar el ingreso pendiente'
);
select results_eq(
  $$select cerrado_en::date::text from public.leads where id='op-lead-a'$$,
  array['2026-08-28']::text[],
  'la fecha real de cierre llega al lead'
);

select lives_ok(
  $$select public.reportar_operacion('op-lead-self-one', null, 'Propiedad externa', null, 'Renta')$$,
  'el broker también puede reportar un cierre'
);
select is(
  (select (public.resolver_operacion(
    (select id from public.operaciones where lead_id='op-lead-self-one'),
    'validada'
  )->>'autovalidada')::boolean),
  true,
  'el único broker puede autovalidar y queda auditado'
);

insert into public.usuarios
  (id, agencia_id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta)
values ('op-broker-a2', 'op-test-a', '61000000-0000-4000-8000-000000000003', 'Broker A2', 'op-ba2@test.mx', '', 'broker', 'Broker', 'B2', 'Activo');
select lives_ok(
  $$select public.reportar_operacion('op-lead-self-multi', null, 'Otra externa', null, 'Venta')$$,
  'el broker reporta aun cuando hay otro broker activo'
);
select throws_ok(
  $$select public.resolver_operacion((select id from public.operaciones where lead_id='op-lead-self-multi'), 'validada')$$,
  '42501', 'Otro broker activo debe validar esta operación.',
  'con dos brokers se exige que valide otra persona'
);

select set_config('request.jwt.claims', '{"sub":"62000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.resolver_operacion((select id from public.operaciones where lead_id='op-lead-a'), 'devuelta', 'No corresponde')$$,
  '23503', 'La operación no pertenece a tu oficina.',
  'un broker de otra oficina no puede resolverla'
);

select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.resolver_operacion((select id from public.operaciones where lead_id='op-lead-a'), 'validada')$$,
  '40001', 'La operación ya fue resuelta.',
  'una operación no se aprueba dos veces'
);

select * from finish();
rollback;
