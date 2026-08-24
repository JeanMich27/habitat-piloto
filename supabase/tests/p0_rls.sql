begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

insert into public.agencias (id, nombre, direccion, slug, estado, plan, codigo_invitacion)
values
  ('p0-a', 'Agencia P0 A', '', 'p0-a', 'activa', 'prueba', 'INV-P0A'),
  ('p0-b', 'Agencia P0 B', '', 'p0-b', 'activa', 'prueba', 'INV-P0B');

insert into public.configuracion (id, agencia_id) values ('p0-a', 'p0-a'), ('p0-b', 'p0-b');

insert into public.usuarios
  (id, agencia_id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta)
values
  ('p0-broker-a',  'p0-a', '10000000-0000-4000-8000-000000000001', 'Broker A',  'broker-a@p0.test',  '111', 'broker',       'Broker',      'BA', 'Activo'),
  ('p0-asesor-a',  'p0-a', '10000000-0000-4000-8000-000000000002', 'Asesor A',  'asesor-a@p0.test',  '222', 'asesor_equipo','Asesor',      'AA', 'Activo'),
  ('p0-cliente-a', 'p0-a', '10000000-0000-4000-8000-000000000003', 'Cliente A', 'cliente-a@p0.test', '333', 'cliente',       'Cliente',     'CA', 'Activo'),
  ('p0-owner-a',   'p0-a', '10000000-0000-4000-8000-000000000004', 'Owner A',   'owner-a@p0.test',   '444', 'propietario',   'Propietario', 'OA', 'Activo'),
  ('p0-pending-a', 'p0-a', '10000000-0000-4000-8000-000000000005', 'Pending A', 'pending-a@p0.test', '555', 'asesor_equipo','Asesor',      'PA', 'Pendiente'),
  ('p0-broker-b',  'p0-b', '20000000-0000-4000-8000-000000000001', 'Broker B',  'broker-b@p0.test',  '666', 'broker',        'Broker',      'BB', 'Activo');

insert into public.propiedades
  (id, agencia_id, titulo, tipo_inmueble, tipo_operacion, asesor_id, propietario)
values
  ('p0-prop-a', 'p0-a', 'Propiedad A', 'Casa', 'Venta', 'p0-asesor-a', '{"correo":"owner-a@p0.test"}'),
  ('p0-prop-b', 'p0-b', 'Propiedad B', 'Casa', 'Venta', 'p0-broker-b', '{}');

insert into public.leads
  (id, agencia_id, nombre, correo, asesor_id, interes_propiedad_id, cierre)
values
  ('p0-lead-a', 'p0-a', 'Lead A', 'cliente-a@p0.test', 'p0-asesor-a', 'p0-prop-a',
   '{"citas":[{"id":"cita-a","estado":"Pendiente"}],"documentos":[],"etapaActual":0}'),
  ('p0-lead-b', 'p0-b', 'Lead B', 'lead-b@p0.test', 'p0-broker-b', 'p0-prop-b', null);

select ok(not has_table_privilege('anon', 'public.leads', 'select'), 'anon no puede leer leads');
select ok(not has_table_privilege('anon', 'public.usuarios', 'select'), 'anon no puede leer usuarios');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","email":"broker-a@p0.test"}', true);
select results_eq('select id from public.leads order by id', array['p0-lead-a']::text[], 'broker solo ve leads de su agencia');
select results_eq('select count(*)::int from public.directorio_visible()', array[5], 'broker recibe directorio completo de su agencia');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","email":"asesor-a@p0.test"}', true);
select results_eq('select id from public.leads order by id', array['p0-lead-a']::text[], 'asesor ve únicamente su cartera autorizada');
select results_eq('select count(*)::int from public.usuarios', array[1], 'asesor solo lee directamente su perfil');
select results_eq('select count(*)::int from public.directorio_visible()', array[2], 'asesor recibe identidad operativa del equipo activo');
select results_eq($$select correo from public.directorio_visible() where id = 'p0-broker-a'$$, array['']::text[], 'asesor no recibe correo de compañeros');
select results_eq($$select telefono from public.directorio_visible() where id = 'p0-broker-a'$$, array['']::text[], 'asesor no recibe teléfono de compañeros');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","email":"cliente-a@p0.test"}', true);
select results_eq('select id from public.leads order by id', array['p0-lead-a']::text[], 'cliente solo ve su lead');
select results_eq($$update public.leads set agencia_id = 'p0-b' where id = 'p0-lead-a' returning id$$, array[]::text[], 'cliente no cambia agencia ni ningún campo directamente');
select ok(public.cliente_confirmar_cita('p0-lead-a', 'cita-a'), 'cliente puede confirmar una cita propia mediante RPC estrecha');
select results_eq($$select cierre #>> '{citas,0,estado}' from public.leads where id = 'p0-lead-a'$$, array['Confirmada']::text[], 'la RPC solo aplica la confirmación esperada');
select is(public.cliente_confirmar_cita('p0-lead-b', 'cita-b'), false, 'cliente no opera recursos de otra agencia');
select results_eq('select count(*)::int from public.directorio_visible()', array[1], 'cliente no recibe el directorio de la agencia');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","email":"owner-a@p0.test"}', true);
select results_eq($$select id from public.directorio_visible() order by id$$, array['p0-asesor-a','p0-owner-a']::text[], 'propietario solo recibe su perfil y asesor asignado');
select results_eq($$select correo from public.directorio_visible() where id = 'p0-asesor-a'$$, array['asesor-a@p0.test']::text[], 'propietario recibe contacto del asesor asignado');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000005","email":"pending-a@p0.test"}', true);
select results_eq('select count(*)::int from public.leads', array[0], 'cuenta pendiente no accede datos');

reset role;
update public.usuarios set estado_cuenta = 'Inactivo' where id = 'p0-asesor-a';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","email":"asesor-a@p0.test"}', true);
select results_eq('select count(*)::int from public.leads', array[0], 'cuenta suspendida no accede datos');

select * from finish();
rollback;

