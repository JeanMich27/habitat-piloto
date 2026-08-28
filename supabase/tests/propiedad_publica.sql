begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.agencias (id, nombre, direccion, slug, estado, plan, codigo_invitacion)
values
  ('ficha-a', 'Oficina Ficha A', '', 'ficha-a', 'activa', 'prueba', 'INV-FICHA-A'),
  ('ficha-b', 'Oficina Ficha B', '', 'ficha-b', 'activa', 'prueba', 'INV-FICHA-B');

insert into public.configuracion (id, agencia_id) values ('ficha-a', 'ficha-a'), ('ficha-b', 'ficha-b');

insert into public.usuarios
  (id, agencia_id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta, slug_publico)
values
  ('ficha-asesor-a', 'ficha-a', '83000000-0000-4000-8000-000000000001', 'Asesora A', 'a@ficha.test', '5511111111', 'asesor_equipo', 'Asesora', 'AA', 'Activo', 'asesora-ficha-a'),
  ('ficha-asesor-b', 'ficha-b', '84000000-0000-4000-8000-000000000001', 'Asesor B', 'b@ficha.test', '5522222222', 'asesor_equipo', 'Asesor', 'AB', 'Activo', 'asesor-ficha-b');

insert into public.propiedades
  (id, agencia_id, titulo, ubicacion, municipio, estado, colonia, descripcion, tipo_inmueble,
   tipo_operacion, asesor_id, propietario, estatus, publicada_el, slug_publico,
   comision_valor, calle, codigo_postal)
values
  ('ficha-prop-a', 'ficha-a', 'Casa pública A', 'Dirección exacta secreta', 'Monterrey', 'Nuevo León', 'Centro', 'Descripción comercial', 'Casa', 'Venta', 'ficha-asesor-a', '{"nombre":"Propietario secreto"}', 'Publicada', now(), 'casa-publica-a-1234567890', 5, 'Calle secreta 123', '64000'),
  ('ficha-prop-b', 'ficha-b', 'Casa pública B', 'Otra dirección', 'Saltillo', 'Coahuila', 'Norte', '', 'Casa', 'Venta', 'ficha-asesor-b', '{}', 'Publicada', now(), 'casa-publica-b-1234567890', 4, 'Otra calle', '25000'),
  ('ficha-borrador', 'ficha-a', 'Borrador', '', 'Monterrey', 'Nuevo León', '', '', 'Casa', 'Venta', 'ficha-asesor-a', '{}', 'No publicada', null, 'borrador-1234567890', null, '', '');

select ok(not has_function_privilege('anon', 'public.propiedad_publica_por_slug(text)', 'execute'), 'anon no invoca la RPC');
select ok(not has_function_privilege('authenticated', 'public.propiedad_publica_por_slug(text)', 'execute'), 'authenticated no invoca la RPC');
select ok(has_function_privilege('service_role', 'public.propiedad_publica_por_slug(text)', 'execute'), 'sólo la Edge Function puede invocar la RPC');
select is(public.propiedad_publica_por_slug('casa-publica-a-1234567890') ->> 'titulo', 'Casa pública A', 'devuelve la propiedad solicitada');
select is(public.propiedad_publica_por_slug('casa-publica-a-1234567890') -> 'asesor' ->> 'nombre', 'Asesora A', 'incluye al asesor del mismo tenant');
select is(public.propiedad_publica_por_slug('casa-publica-b-1234567890') -> 'oficina' ->> 'nombre', 'Oficina Ficha B', 'resuelve la oficina correcta');
select is(public.propiedad_publica_por_slug('borrador-1234567890'), null::jsonb, 'no publica borradores');
select is(public.propiedad_publica_por_slug('no-existe'), null::jsonb, 'un slug inexistente devuelve null');
select ok(
  not (public.propiedad_publica_por_slug('casa-publica-a-1234567890') ? 'propietario')
  and not (public.propiedad_publica_por_slug('casa-publica-a-1234567890') ? 'comision_valor')
  and not (public.propiedad_publica_por_slug('casa-publica-a-1234567890') ? 'calle')
  and not (public.propiedad_publica_por_slug('casa-publica-a-1234567890') ? 'codigo_postal')
  and not (public.propiedad_publica_por_slug('casa-publica-a-1234567890') ? 'id'),
  'no expone propietario, comisión, dirección exacta ni id interno'
);
select is(public.propiedad_publica_por_slug('casa-publica-a-1234567890') ->> 'colonia', 'Centro', 'sólo expone ubicación aproximada');

select * from finish();
rollback;
