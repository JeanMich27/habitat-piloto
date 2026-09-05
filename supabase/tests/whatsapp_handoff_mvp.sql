begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.agencias (id,nombre,direccion,slug,estado,plan,codigo_invitacion)
values ('wa-test-a','WA Test A','','wa-test-a','prueba','prueba','WATESTA'),
       ('wa-test-b','WA Test B','','wa-test-b','prueba','prueba','WATESTB');
insert into public.configuracion (id,agencia_id) values ('wa-test-a','wa-test-a'),('wa-test-b','wa-test-b');
insert into public.usuarios
  (id,agencia_id,auth_id,nombre,correo,telefono,rol,puesto,iniciales,estado_cuenta)
values
  ('wa-broker-a','wa-test-a','61000000-0000-4000-8000-000000000001','Broker A','wa-a@test','','broker','Broker','BA','Activo'),
  ('wa-advisor-a','wa-test-a','61000000-0000-4000-8000-000000000002','Asesor A','wa-as@test','','asesor_equipo','Asesor','AA','Activo'),
  ('wa-invitado-a','wa-test-a',null,'Invitado A','wa-i@test','','asesor_equipo','Asesor','IA','Activo'),
  ('wa-broker-b','wa-test-b','62000000-0000-4000-8000-000000000001','Broker B','wa-b@test','','broker','Broker','BB','Activo');
insert into public.propiedades (id,agencia_id,titulo,tipo_inmueble,tipo_operacion,asesor_id,propietario)
values ('wa-prop-a','wa-test-a','Prop WA','Casa','Venta','wa-advisor-a','{}');
insert into public.agencia_integraciones (agencia_id,proveedor,activo,config)
values ('wa-test-a','whatsapp',true,'{"phone_number_id":"phone-wa-test"}');
insert into public.wa_canales
  (agencia_id,usuario_id,phone_number_id,telefono_mostrado,modo,protege_personal)
values ('wa-test-a','wa-advisor-a','phone-wa-test','+52 55 0000 0000','coexistence',true);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.registrar_mensaje_whatsapp_entrante(text,text,text,text,text,text)',
    'execute'
  ),
  'el navegador no ejecuta la ingesta del webhook'
);
select ok(
  has_function_privilege('authenticated','public.tomar_conversacion_whatsapp(integer)','execute'),
  'authenticated puede usar el claim protegido'
);

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create temp table wa_state (name text primary key, value jsonb);
-- La tabla temporal la crea el rol de la sesión; las pruebas luego cambian a
-- authenticated/service_role. Sin este grant, pgTAP aborta con
-- "permission denied" y el plan queda incompleto (no es un fallo del producto).
grant select, insert, update, delete on wa_state to anon, authenticated, service_role;
insert into wa_state values (
  'intake',
  public.registrar_mensaje_whatsapp_entrante(
    'phone-wa-test','wamid.test.1','5215512345678','Prospecto WA',
    'Quiero conocer el precio','wa-prop-a'
  )
);

select is(
  (select value ->> 'assigned_agent_id' from wa_state where name='intake'),
  'wa-advisor-a',
  'una propiedad se relaciona con el asesor dueño del canal'
);
select results_eq(
  $$select count(*)::int from public.leads where agencia_id='wa-test-a' and telefono_norm='5512345678' and canal_entrada='whatsapp'$$,
  array[1],
  'la ingesta usa el lead canónico una sola vez'
);

insert into wa_state values (
  'replay',
  public.registrar_mensaje_whatsapp_entrante(
    'phone-wa-test','wamid.test.1','5215512345678','Duplicado',
    'Quiero conocer el precio','wa-prop-a'
  )
);
select is(
  ((select value ->> 'replay' from wa_state where name='replay'))::boolean,
  true,
  'Meta puede reintentar el wamid sin repetir el flujo'
);
select results_eq(
  $$select count(*)::int from public.wa_mensajes where wa_message_id='wamid.test.1'$$,
  array[1],
  'el mensaje entrante no se duplica'
);

select public.solicitar_handoff_whatsapp(
  ((select value ->> 'conversation_id' from wa_state where name='intake'))::integer,
  'pricing'
);
select results_eq(
  $$select estado from public.wa_conversaciones where agencia_id='wa-test-a'$$,
  array['pendiente_humano'],
  'la regla comercial abre un handoff pendiente'
);
select results_eq(
  $$select count(*)::int from public.tareas where agencia_id='wa-test-a' and estado='pendiente' and metadata->>'tipo'='whatsapp_handoff'$$,
  array[1],
  'el handoff deja una tarea operativa'
);
select results_eq(
  $$select count(*)::int from public.notificaciones where agencia_id='wa-test-a' and destinatario_id='wa-advisor-a' and tipo='whatsapp_handoff' and not leida$$,
  array[1],
  'el mismo handoff deja una notificación al responsable'
);
select public.solicitar_handoff_whatsapp(
  ((select value ->> 'conversation_id' from wa_state where name='intake'))::integer,
  'pricing'
);
select results_eq(
  $$select count(*)::int from public.tareas where agencia_id='wa-test-a' and metadata->>'tipo'='whatsapp_handoff'$$,
  array[1],
  'repetir el handoff no duplica la tarea'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000001"}',true);
select results_eq(
  $$select count(*)::int from public.wa_conversaciones$$,
  array[1],
  'el broker conserva supervisión de lectura sobre conversaciones laborales'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"61000000-0000-4000-8000-000000000002"}',true);
select public.tomar_conversacion_whatsapp(
  ((select value ->> 'conversation_id' from wa_state where name='intake'))::integer
);
select results_eq(
  $$select estado from public.wa_conversaciones where agencia_id='wa-test-a'$$,
  array['humano'],
  'el asesor propietario toma la conversación de forma atómica'
);

select public.cerrar_conversacion_whatsapp(
  ((select value ->> 'conversation_id' from wa_state where name='intake'))::integer,
  'Se contactó al prospecto y se acordó seguimiento.'
);
select results_eq(
  $$select estado from public.wa_conversaciones where agencia_id='wa-test-a'$$,
  array['cerrada'],
  'Cerrar termina el handoff'
);
select results_eq(
  $$select resumen_cierre from public.wa_conversaciones where agencia_id='wa-test-a'$$,
  array['Se contactó al prospecto y se acordó seguimiento.'],
  'el cierre exige y conserva resultado'
);
select results_eq(
  $$select estado from public.tareas where agencia_id='wa-test-a' and metadata->>'tipo'='whatsapp_handoff'$$,
  array['completada'],
  'cerrar completa la tarea asociada'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"62000000-0000-4000-8000-000000000001"}',true);
select results_eq(
  $$select count(*)::int from public.wa_conversaciones$$,
  array[0],
  'otra oficina no puede leer la conversación'
);

select * from finish();
rollback;
