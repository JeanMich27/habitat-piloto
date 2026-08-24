begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.agencias (id, nombre, direccion, slug, estado, plan, codigo_invitacion)
values
  ('p1-atom-a', 'P1 Atomic A', '', 'p1-atom-a', 'prueba', 'prueba', 'P1A'),
  ('p1-atom-b', 'P1 Atomic B', '', 'p1-atom-b', 'prueba', 'prueba', 'P1B');

insert into public.configuracion (id, agencia_id) values ('p1-atom-a', 'p1-atom-a'), ('p1-atom-b', 'p1-atom-b');

insert into public.usuarios
  (id, agencia_id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta)
values
  ('p1-broker-a', 'p1-atom-a', '51000000-0000-4000-8000-000000000001', 'Broker A', 'p1-ba@test.mx', '', 'broker', 'Broker', 'BA', 'Activo'),
  ('p1-asesor-a', 'p1-atom-a', '51000000-0000-4000-8000-000000000002', 'Asesor A', 'p1-aa@test.mx', '', 'asesor_equipo', 'Asesor', 'AA', 'Activo'),
  ('p1-destino-a', 'p1-atom-a', '51000000-0000-4000-8000-000000000003', 'Destino A', 'p1-da@test.mx', '', 'asesor_equipo', 'Asesor', 'DA', 'Activo'),
  ('p1-broker-b', 'p1-atom-b', '52000000-0000-4000-8000-000000000001', 'Broker B', 'p1-bb@test.mx', '', 'broker', 'Broker', 'BB', 'Activo'),
  ('p1-destino-b', 'p1-atom-b', '52000000-0000-4000-8000-000000000002', 'Destino B', 'p1-db@test.mx', '', 'asesor_equipo', 'Asesor', 'DB', 'Activo');

insert into public.propiedades (id, agencia_id, titulo, tipo_inmueble, tipo_operacion, asesor_id, propietario)
values ('p1-prop-a', 'p1-atom-a', 'Propiedad', 'Casa', 'Venta', 'p1-asesor-a', '{}');
insert into public.leads (id, agencia_id, nombre, telefono, etapa, origen, asesor_id)
values ('p1-lead-a', 'p1-atom-a', 'Lead', '', 'Nuevo', 'Directo', 'p1-asesor-a');
insert into public.citas (id, agencia_id, asesor_id, titulo, tipo, inicio, fin, ubicacion, notas, estado)
values ('51000000-0000-4000-8000-000000000010', 'p1-atom-a', 'p1-asesor-a', 'Visita', 'visita', now() + interval '1 day', now() + interval '1 day 1 hour', '', '', 'Agendada');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.desactivar_asesor_y_reasignar('p1-asesor-a', 'p1-destino-a')$$,
  'broker completa la operación'
);
select results_eq($$select estado_cuenta from public.usuarios where id='p1-asesor-a'$$, array['Inactivo']::text[], 'desactiva al origen');
select results_eq($$select asesor_id from public.propiedades where id='p1-prop-a'$$, array['p1-destino-a']::text[], 'reasigna propiedades');
select results_eq($$select asesor_id from public.leads where id='p1-lead-a'$$, array['p1-destino-a']::text[], 'reasigna leads');
select results_eq($$select asesor_id from public.citas where id='51000000-0000-4000-8000-000000000010'$$, array['p1-destino-a']::text[], 'reasigna citas abiertas');

select throws_ok(
  $$select public.desactivar_asesor_y_reasignar('p1-asesor-a', 'p1-destino-b')$$,
  'P0002', 'El asesor destino no existe en tu oficina.', 'impide destino cross-tenant'
);
select throws_ok(
  $$select public.desactivar_asesor_y_reasignar('no-existe', 'p1-destino-a')$$,
  'P0002', 'El asesor no existe en tu oficina.', 'rechaza recurso inexistente'
);
select throws_ok(
  $$select public.desactivar_asesor_y_reasignar('p1-destino-a', 'p1-destino-a')$$,
  '22023', 'La reasignación no es válida.', 'rechaza parámetros inválidos'
);

select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.desactivar_asesor_y_reasignar('p1-asesor-a', 'p1-destino-a')$$,
  '42501', 'Solo un broker puede desactivar asesores.', 'un asesor no tiene permiso'
);

reset role;
-- reset role no limpia request.jwt.claims (persiste dentro de la misma
-- transacción): sin esto, auth.uid()/auth.role() siguen devolviendo la
-- identidad simulada anterior y disparan triggers de seguridad con el rol
-- equivocado para estas escrituras directas.
select set_config('request.jwt.claims', '{}', true);
insert into public.usuarios
  (id, agencia_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta)
values ('p1-fallo-a', 'p1-atom-a', 'Fallo', 'p1-fallo@test.mx', '', 'asesor_equipo', 'Asesor', 'FA', 'Activo');
insert into public.propiedades (id, agencia_id, titulo, tipo_inmueble, tipo_operacion, asesor_id, propietario)
values ('p1-prop-rollback', 'p1-atom-a', 'Rollback', 'Casa', 'Venta', 'p1-fallo-a', '{}');
insert into public.leads (id, agencia_id, nombre, telefono, etapa, origen, asesor_id)
values ('p1-lead-rollback', 'p1-atom-a', 'Rollback', '', 'Nuevo', 'Directo', 'p1-fallo-a');

create function public.p1_forzar_fallo_reasignacion() returns trigger language plpgsql as $$
begin raise exception 'fallo intermedio p1'; end $$;
create trigger p1_forzar_fallo before update of asesor_id on public.leads
for each row when (old.id = 'p1-lead-rollback') execute function public.p1_forzar_fallo_reasignacion();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.desactivar_asesor_y_reasignar('p1-fallo-a', 'p1-destino-a')$$,
  'P0001', 'fallo intermedio p1', 'propaga el fallo intermedio'
);
select results_eq(
  $$select asesor_id from public.propiedades where id='p1-prop-rollback'$$,
  array['p1-fallo-a']::text[],
  'rollback conserva la propiedad en el origen'
);

select * from finish();
rollback;
