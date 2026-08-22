begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

insert into public.agencias (id, nombre, direccion, slug, estado, plan, codigo_invitacion)
values
  ('evt-a', 'Agencia Eventos A', '', 'evt-a', 'prueba', 'prueba', 'INV-EVTA'),
  ('evt-b', 'Agencia Eventos B', '', 'evt-b', 'prueba', 'prueba', 'INV-EVTB');

insert into public.configuracion (id, agencia_id) values ('evt-a', 'evt-a'), ('evt-b', 'evt-b');

insert into public.usuarios
  (id, agencia_id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta)
values
  ('evt-broker-a',  'evt-a', '30000000-0000-4000-8000-000000000001', 'Broker A',  'broker@evt.test',  '', 'broker',         'Broker',  'BA', 'Activo'),
  ('evt-asesor-a',  'evt-a', '30000000-0000-4000-8000-000000000002', 'Asesor A',  'asesor-a@evt.test','', 'asesor_equipo', 'Asesor',  'AA', 'Activo'),
  ('evt-asesor-a2', 'evt-a', '30000000-0000-4000-8000-000000000003', 'Asesor A2', 'asesor-a2@evt.test','', 'asesor_equipo','Asesor', 'A2', 'Activo'),
  ('evt-cliente-a', 'evt-a', '30000000-0000-4000-8000-000000000004', 'Cliente A', 'cliente@evt.test', '', 'cliente',        'Cliente', 'CA', 'Activo'),
  ('evt-broker-b',  'evt-b', '40000000-0000-4000-8000-000000000001', 'Broker B',  'broker-b@evt.test','', 'broker',         'Broker',  'BB', 'Activo');

insert into public.propiedades
  (id, agencia_id, titulo, tipo_inmueble, tipo_operacion, asesor_id, propietario)
values
  ('evt-prop-a', 'evt-a', 'Propiedad A', 'Casa', 'Venta', 'evt-asesor-a', '{}'),
  ('evt-prop-b', 'evt-b', 'Propiedad B', 'Casa', 'Venta', 'evt-broker-b', '{}');

select is(public.norm_tel('+52 55 1234 5678'), '5512345678', 'normaliza teléfono a diez dígitos');
select hasnt_table_privilege('anon', 'public.integration_events', 'select', 'anon no puede leer el outbox');
select hasnt_function_privilege(
  'anon', 'public.crear_o_relacionar_lead(jsonb,text)', 'execute',
  'anon no puede ejecutar el alta de leads'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.crear_o_relacionar_lead(
    '{"name":"Lead Uno","phone":"+52 55 1111 2222","email":"uno@evt.test","source":"whatsapp","assigned_agent_id":"evt-asesor-a"}'::jsonb,
    'evt-a'
  ) ->> 'created',
  'true',
  'service_role crea un lead nuevo'
);
select results_eq(
  $$select count(*)::int from public.leads where agencia_id = 'evt-a' and correo = 'uno@evt.test'$$,
  array[1],
  'el alta persiste una sola fila'
);
select results_eq(
  $$select count(*)::int from public.tareas where agencia_id = 'evt-a' and asesor_id = 'evt-asesor-a'$$,
  array[1],
  'el alta asignada crea la tarea inicial'
);
select results_eq(
  $$select count(*)::int from public.integration_events where agencia_id = 'evt-a' and event_type = 'lead.created'$$,
  array[1],
  'el alta registra lead.created'
);
select results_eq(
  $$select count(*)::int from public.integration_events where agencia_id = 'evt-a' and event_type = 'task.created'$$,
  array[1],
  'la tarea inicial registra task.created'
);

select is(
  public.crear_o_relacionar_lead(
    '{"name":"Lead Uno repetido","phone":"5511112222","email":"uno@evt.test","source":"whatsapp"}'::jsonb,
    'evt-a'
  ) ->> 'created',
  'false',
  'un reintento con la misma identidad relaciona el lead existente'
);
select results_eq(
  $$select count(*)::int from public.leads where agencia_id = 'evt-a' and correo = 'uno@evt.test'$$,
  array[1],
  'el reintento no duplica la identidad'
);
select results_eq(
  $$select count(*)::int from public.integration_events where agencia_id = 'evt-a' and event_type = 'lead.updated'$$,
  array[1],
  'la identidad existente deja evento auditable'
);

select is(
  public.crear_o_relacionar_lead(
    '{"name":"Lead Dos","phone":"5533334444","email":"dos@evt.test","assigned_agent_id":"evt-asesor-a2"}'::jsonb,
    'evt-a'
  ) ->> 'created',
  'true',
  'puede crear una segunda identidad distinta'
);
select throws_ok(
  $$select public.crear_o_relacionar_lead('{"name":"Ambiguo","phone":"5511112222","email":"dos@evt.test"}'::jsonb, 'evt-a')$$,
  'P0001',
  'Teléfono y correo coinciden con contactos distintos; se requiere revisión manual.',
  'no fusiona automáticamente identidades ambiguas'
);

select is(
  public.crear_o_relacionar_lead(
    '{"name":"Lead Propiedad","phone":"5555556666","property_id":"evt-prop-a"}'::jsonb,
    'evt-a'
  ) ->> 'created',
  'true',
  'crea un lead usando el asesor responsable de la propiedad'
);
select results_eq(
  $$select asesor_id from public.leads where agencia_id = 'evt-a' and telefono_norm = '5555556666'$$,
  array['evt-asesor-a']::text[],
  'la propiedad determina la asignación cuando no llega asesor'
);
select throws_ok(
  $$select public.crear_o_relacionar_lead('{"name":"Cruce","phone":"5577778888","property_id":"evt-prop-b"}'::jsonb, 'evt-a')$$,
  '23503',
  'La propiedad no pertenece a la oficina.',
  'rechaza propiedades de otra oficina'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000002","email":"asesor-a@evt.test","role":"authenticated"}', true);
select results_eq(
  'select count(*)::int from public.tareas',
  array[2],
  'el asesor ve únicamente sus tareas'
);
select results_eq(
  'select count(*)::int from public.integration_events',
  array[0],
  'el asesor no puede leer el outbox'
);

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","email":"broker@evt.test","role":"authenticated"}', true);
select results_eq(
  'select count(*)::int from public.tareas',
  array[3],
  'el broker supervisa todas las tareas de su oficina'
);
select ok(
  (select count(*) from public.integration_events) >= 7,
  'el broker puede auditar los eventos de su oficina'
);

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000004","email":"cliente@evt.test","role":"authenticated"}', true);
select throws_ok(
  $$select public.crear_o_relacionar_lead('{"name":"No permitido"}'::jsonb, null)$$,
  '42501',
  'Tu cuenta no puede crear leads.',
  'un cliente no puede usar la RPC de alta'
);

select * from finish();
rollback;
