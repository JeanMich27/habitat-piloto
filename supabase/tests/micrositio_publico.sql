begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.agencias (id, nombre, direccion, slug, estado, plan, codigo_invitacion)
values
  ('micro-a', 'Oficina Micrositio A', '', 'micro-a', 'activa', 'prueba', 'INV-MICRO-A'),
  ('micro-b', 'Oficina Micrositio B', '', 'micro-b', 'activa', 'prueba', 'INV-MICRO-B');

insert into public.configuracion (id, agencia_id)
values ('micro-a', 'micro-a'), ('micro-b', 'micro-b');

insert into public.usuarios
  (id, agencia_id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta, slug_publico)
values
  ('micro-asesor-a', 'micro-a', '81000000-0000-4000-8000-000000000001', 'Asesor Micrositio A', 'a@micro.test', '5511111111', 'asesor_equipo', 'Asesor', 'AA', 'Activo', 'asesor-micro-a'),
  ('micro-asesor-b', 'micro-b', '82000000-0000-4000-8000-000000000001', 'Asesor Micrositio B', 'b@micro.test', '5522222222', 'asesor_equipo', 'Asesor', 'AB', 'Activo', 'asesor-micro-b');

insert into public.propiedades
  (id, agencia_id, titulo, tipo_inmueble, tipo_operacion, asesor_id, propietario, estatus, publicada_el, slug_publico)
values
  ('micro-prop-a', 'micro-a', 'Propiedad pública A', 'Casa', 'Venta', 'micro-asesor-a', '{}', 'Publicada', now(), 'propiedad-publica-a-1234567890'),
  ('micro-prop-b', 'micro-b', 'Propiedad pública B', 'Casa', 'Venta', 'micro-asesor-b', '{}', 'Publicada', now(), 'propiedad-publica-b-1234567890');

-- Fuerza dentro de esta transacción el caso que el trigger normalmente impide:
-- una propiedad de B asignada al asesor A. La RPC debe excluirla por agencia.
alter table public.propiedades disable trigger propiedades_coherencia_agencia;
insert into public.propiedades
  (id, agencia_id, titulo, tipo_inmueble, tipo_operacion, asesor_id, propietario, estatus, publicada_el, slug_publico)
values
  ('micro-prop-cruzada', 'micro-b', 'No debe salir', 'Casa', 'Venta', 'micro-asesor-a', '{}', 'Publicada', now() + interval '1 minute', 'propiedad-cruzada-1234567890');
alter table public.propiedades enable trigger propiedades_coherencia_agencia;

select ok(
  not has_function_privilege('anon', 'public.perfil_publico_por_slug(text)', 'execute'),
  'anon no invoca directamente la RPC pública'
);
select ok(
  not has_function_privilege('authenticated', 'public.perfil_publico_por_slug(text)', 'execute'),
  'authenticated no invoca directamente la RPC pública'
);
select is(
  jsonb_array_length(public.perfil_publico_por_slug('asesor-micro-a') -> 'propiedades'),
  1,
  'el perfil A contiene una sola propiedad de su agencia'
);
select is(
  public.perfil_publico_por_slug('asesor-micro-a') -> 'propiedades' -> 0 ->> 'slug',
  'propiedad-publica-a-1234567890',
  'la propiedad cruzada queda excluida aunque el trigger se haya omitido'
);
select ok(
  not (public.perfil_publico_por_slug('asesor-micro-a') ? 'correo')
  and not (public.perfil_publico_por_slug('asesor-micro-a') ? 'id')
  and not (public.perfil_publico_por_slug('asesor-micro-a') -> 'propiedades' -> 0 ? 'id')
  and not (public.perfil_publico_por_slug('asesor-micro-a') -> 'propiedades' -> 0 ? 'eb_public_url'),
  'el perfil no expone correo, ids internos ni enlaces de EasyBroker'
);
select is(
  public.perfil_publico_por_slug('slug-inexistente'),
  null::jsonb,
  'un slug inexistente devuelve null'
);
select is(
  public.perfil_publico_por_slug('asesor-micro-b') -> 'propiedades' -> 0 ->> 'slug',
  'propiedad-publica-b-1234567890',
  'el perfil B no mezcla inventario de la agencia A'
);
select has_function(
  'public',
  'perfil_publico_por_slug',
  array['text'],
  'la RPC pública conserva su firma canónica'
);
select is(
  public.perfil_publico_por_slug('asesor-micro-a') -> 'propiedades' -> 0 ->> 'tipo_operacion',
  'Venta',
  'la RPC expone el tipo de operación real de la propiedad'
);
select is(
  public.perfil_publico_por_slug('asesor-micro-a') -> 'propiedades' -> 0 ->> 'tipo_inmueble',
  'Casa',
  'la RPC expone el tipo de inmueble real de la propiedad'
);

select * from finish();
rollback;
