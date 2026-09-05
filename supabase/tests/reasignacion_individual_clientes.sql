begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.agencias (id, nombre, direccion, slug, estado, plan, codigo_invitacion)
values
  ('reasig-a', 'Reasignación A', '', 'reasig-a', 'prueba', 'prueba', 'REASIGA'),
  ('reasig-b', 'Reasignación B', '', 'reasig-b', 'prueba', 'prueba', 'REASIGB');

insert into public.configuracion (id, agencia_id)
values ('reasig-a', 'reasig-a'), ('reasig-b', 'reasig-b');

insert into public.usuarios
  (id, agencia_id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta)
values
  ('reasig-broker-a', 'reasig-a', '61000000-0000-4000-8000-000000000001', 'Broker A', 'broker-a@reasig.test', '', 'broker', 'Broker', 'BA', 'Activo'),
  ('reasig-origen-a', 'reasig-a', '61000000-0000-4000-8000-000000000002', 'Origen A', 'origen-a@reasig.test', '', 'asesor_equipo', 'Asesor', 'OA', 'Activo'),
  ('reasig-destino-a', 'reasig-a', '61000000-0000-4000-8000-000000000003', 'Destino A', 'destino-a@reasig.test', '', 'asesor_equipo', 'Asesor', 'DA', 'Activo'),
  ('reasig-inactivo-a', 'reasig-a', null, 'Inactivo A', 'inactivo-a@reasig.test', '', 'asesor_equipo', 'Asesor', 'IA', 'Inactivo'),
  ('reasig-broker-b', 'reasig-b', '62000000-0000-4000-8000-000000000001', 'Broker B', 'broker-b@reasig.test', '', 'broker', 'Broker', 'BB', 'Activo'),
  ('reasig-destino-b', 'reasig-b', '62000000-0000-4000-8000-000000000002', 'Destino B', 'destino-b@reasig.test', '', 'asesor_equipo', 'Asesor', 'DB', 'Activo');

insert into public.leads (id, agencia_id, nombre, telefono, etapa, origen, asesor_id)
values ('reasig-lead-a', 'reasig-a', 'Cliente A', '', 'Nuevo', 'Directo', 'reasig-origen-a');

insert into public.tareas (id, agencia_id, lead_id, asesor_id, titulo, estado, vence_en, completada_en)
values
  ('61000000-0000-4000-8000-000000000010', 'reasig-a', 'reasig-lead-a', 'reasig-origen-a', 'Pendiente', 'pendiente', now() + interval '1 day', null),
  ('61000000-0000-4000-8000-000000000011', 'reasig-a', 'reasig-lead-a', 'reasig-origen-a', 'Completada', 'completada', now() - interval '1 day', now() - interval '1 day');

insert into public.citas (id, agencia_id, asesor_id, lead_id, titulo, tipo, inicio, fin, estado)
values
  ('reasig-cita-futura', 'reasig-a', 'reasig-origen-a', 'reasig-lead-a', 'Futura', 'visita', now() + interval '1 day', now() + interval '1 day 1 hour', 'Agendada'),
  ('reasig-cita-pasada', 'reasig-a', 'reasig-origen-a', 'reasig-lead-a', 'Pasada', 'visita', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'Realizada');

create temp table reasig_state (endpoint_id uuid);
-- La tabla temporal la crea el rol de la sesión; las pruebas luego cambian a
-- authenticated/service_role. Sin este grant, pgTAP aborta con
-- "permission denied" y el plan queda incompleto (no es un fallo del producto).
grant select, insert, update, delete on reasig_state to anon, authenticated, service_role;
grant insert, select on reasig_state to service_role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into reasig_state
select (public.provision_webhook_endpoint(
  'reasig-a', 'Endpoint de prueba', 'https://example.invalid/reasignacion',
  array['lead.assigned', 'appointment.updated']
)->>'id')::uuid;
reset role;
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.reasignar_lead('reasig-lead-a', 'reasig-destino-a', 'Redistribución de carga', 1)$$,
  'el broker reasigna el cliente'
);
select results_eq($$select asesor_id from public.leads where id='reasig-lead-a'$$, array['reasig-destino-a']::text[], 'cambia el responsable');
select results_eq($$select captado_por_id from public.leads where id='reasig-lead-a'$$, array['reasig-origen-a']::text[], 'conserva el asesor de origen');
select results_eq($$select asesor_id from public.tareas where id='61000000-0000-4000-8000-000000000010'$$, array['reasig-destino-a']::text[], 'transfiere la tarea pendiente');
select results_eq($$select asesor_id from public.tareas where id='61000000-0000-4000-8000-000000000011'$$, array['reasig-origen-a']::text[], 'preserva la tarea completada');
select results_eq($$select asesor_id from public.citas where id='reasig-cita-futura'$$, array['reasig-destino-a']::text[], 'transfiere la cita futura');
select results_eq($$select asesor_id from public.citas where id='reasig-cita-pasada'$$, array['reasig-origen-a']::text[], 'preserva la cita pasada');
select results_eq($$select motivo from public.lead_asignaciones where lead_id='reasig-lead-a'$$, array['Redistribución de carga']::text[], 'registra el motivo interno');
select results_eq($$select reasignado_por_id from public.lead_asignaciones where lead_id='reasig-lead-a'$$, array['reasig-broker-a']::text[], 'registra al broker responsable');
select results_eq(
  $$select count(*)::int from public.webhook_deliveries where endpoint_id=(select endpoint_id from reasig_state)$$,
  array[0],
  'la reasignación interna no crea entregas externas'
);

select throws_ok(
  $$select public.reasignar_lead('reasig-lead-a', 'reasig-destino-b', 'Cruce', 2)$$,
  'P0002', 'El asesor destino no está activo en tu oficina.', 'impide destinos de otra inmobiliaria'
);
select throws_ok(
  $$select public.reasignar_lead('reasig-lead-a', 'reasig-inactivo-a', 'Inactivo', 2)$$,
  'P0002', 'El asesor destino no está activo en tu oficina.', 'impide destinos inactivos'
);
select throws_ok(
  $$select public.reasignar_lead('reasig-lead-a', 'reasig-origen-a', 'Versión vieja', 1)$$,
  '40001', 'El cliente cambió en otra sesión. Recarga antes de reasignar.', 'evita sobrescribir una ficha desactualizada'
);

select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.reasignar_lead('reasig-lead-a', 'reasig-origen-a', 'Sin permiso', 2)$$,
  '42501', 'Solo un broker puede reasignar clientes.', 'un asesor no puede reasignar'
);

select * from finish();
rollback;
