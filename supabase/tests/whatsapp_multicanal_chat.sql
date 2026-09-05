begin;

create extension if not exists pgtap with schema extensions;
select plan(18);
create temp table wa_multi_state (name text primary key, value jsonb);
-- La tabla temporal la crea el rol de la sesión; las pruebas luego cambian a
-- authenticated/service_role. Sin este grant, pgTAP aborta con
-- "permission denied" y el plan queda incompleto (no es un fallo del producto).
grant select, insert, update, delete on wa_multi_state to anon, authenticated, service_role;

insert into public.agencias (id,nombre,direccion,slug,estado,plan,codigo_invitacion)
values ('wa-multi-a','WA Multi A','','wa-multi-a','prueba','prueba','WAMULTIA'),
       ('wa-multi-b','WA Multi B','','wa-multi-b','prueba','prueba','WAMULTIB');
insert into public.configuracion (id,agencia_id) values ('wa-multi-a','wa-multi-a'),('wa-multi-b','wa-multi-b');
insert into public.usuarios
  (id,agencia_id,auth_id,nombre,correo,telefono,rol,puesto,iniciales,estado_cuenta)
values
  ('wa-multi-broker','wa-multi-a','71000000-0000-4000-8000-000000000001','Broker','multi-b@test','','broker','Broker','BR','Activo'),
  ('wa-multi-advisor','wa-multi-a','71000000-0000-4000-8000-000000000002','Asesor','multi-a@test','','asesor_equipo','Asesor','AS','Activo'),
  ('wa-multi-other','wa-multi-a','71000000-0000-4000-8000-000000000003','Otro','multi-o@test','','asesor_equipo','Asesor','OT','Activo'),
  ('wa-multi-foreign','wa-multi-b','72000000-0000-4000-8000-000000000001','Foráneo','multi-f@test','','broker','Broker','FO','Activo');

insert into public.leads (id,agencia_id,nombre,telefono,telefono_norm,asesor_id,origen)
values ('wa-multi-lead','wa-multi-a','Cliente conocido','5215511111111','5511111111','wa-multi-advisor','Directo');
insert into public.wa_canales
  (id,agencia_id,usuario_id,phone_number_id,telefono_mostrado,modo,protege_personal)
values
  ('71000000-0000-4000-8000-000000000010','wa-multi-a','wa-multi-advisor','phone-multi-a','+52 55 0000 0000','coexistence',true);

select ok(
  not has_table_privilege('authenticated','public.wa_canal_credenciales','select'),
  'las credenciales por número no son legibles desde el navegador'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.registrar_canal_whatsapp(text,text,text,text,text,text,text)',
    'execute'
  ),
  'el navegador no puede registrar canales ni escribir tokens'
);

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into wa_multi_state values (
  'known', public.registrar_mensaje_whatsapp_entrante_v2(
    'phone-multi-a','wamid.multi.known','5215511111111','Cliente conocido','Quiero agendar una visita',null
  )
),(
  'unknown', public.registrar_mensaje_whatsapp_entrante_v2(
    'phone-multi-a','wamid.multi.unknown','5215522222222','Contacto desconocido','Hola, ¿estás ahí?',null
  )
);

select is((select value->>'visibility' from wa_multi_state where name='known'),'laboral','un cliente de la cartera entra como laboral');
select is((select value->>'should_respond' from wa_multi_state where name='known'),'true','el canal puede procesar al cliente conocido');
select is((select value->>'visibility' from wa_multi_state where name='unknown'),'pendiente','un número desconocido queda pendiente');
select is((select value->>'should_respond' from wa_multi_state where name='unknown'),'false','HomeID no responde a una conversación posiblemente personal');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001"}',true);
select results_eq(
  $$select count(*)::int from public.wa_conversaciones$$,
  array[1],
  'el broker solo puede leer conversaciones confirmadas como laborales'
);
select throws_ok(
  $$select public.preparar_envio_whatsapp(
    ((select value->>'conversation_id' from wa_multi_state where name='known'))::int,
    'Intento del broker','71000000-0000-4000-8000-000000000099'
  )$$,
  '42501', 'La cuenta no puede enviar mensajes de WhatsApp.',
  'el backend impide que el broker envíe mensajes'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002"}',true);
select results_eq(
  $$select count(*)::int from public.wa_conversaciones$$,
  array[2],
  'el asesor ve su conversación laboral y la pendiente privada'
);
insert into wa_multi_state values (
  'outbound', public.preparar_envio_whatsapp(
    ((select value->>'conversation_id' from wa_multi_state where name='known'))::int,
    'Mensaje desde HomeID','71000000-0000-4000-8000-000000000098'
  )
);
select is((select value->>'status' from wa_multi_state where name='outbound'),'pendiente','el asesor puede preparar un mensaje desde su canal');
select public.preparar_envio_whatsapp(
  ((select value->>'conversation_id' from wa_multi_state where name='known'))::int,
  'Mensaje desde HomeID','71000000-0000-4000-8000-000000000098'
);
select results_eq(
  $$select count(*)::int from public.wa_mensajes where client_request_id='71000000-0000-4000-8000-000000000098'$$,
  array[1],
  'reintentar el envío no duplica el mensaje'
);
select public.clasificar_conversacion_whatsapp(
  ((select value->>'conversation_id' from wa_multi_state where name='unknown'))::int,
  'personal', null
);
select results_eq(
  $$select count(*)::int from public.wa_mensajes where conversacion_id=((select value->>'conversation_id' from wa_multi_state where name='unknown'))::int$$,
  array[0],
  'marcar personal elimina el contenido temporal'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into wa_multi_state values (
  'ignored', public.registrar_mensaje_whatsapp_entrante_v2(
    'phone-multi-a','wamid.multi.personal-again','5215522222222','Contacto desconocido','Mensaje privado posterior',null
  )
);
select is((select value->>'ignored_personal' from wa_multi_state where name='ignored'),'true','mensajes posteriores de un contacto personal se ignoran');
select results_eq(
  $$select count(*)::int from public.wa_mensajes where wa_message_id='wamid.multi.personal-again'$$,
  array[0],
  'el mensaje personal posterior no se persiste'
);

update public.wa_mensajes set wa_message_id='wamid.multi.outbound'
 where client_request_id='71000000-0000-4000-8000-000000000098';
select public.registrar_estado_mensaje_whatsapp('wamid.multi.outbound','delivered');
select public.registrar_estado_mensaje_whatsapp('wamid.multi.outbound','sent');
select results_eq(
  $$select estado_entrega from public.wa_mensajes where wa_message_id='wamid.multi.outbound'$$,
  array['entregado'],
  'un estado tardío no degrada entregado a enviado'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000003"}',true);
select results_eq($$select count(*)::int from public.wa_conversaciones$$,array[0],'otro asesor no ve el canal');
select throws_ok(
  $$select public.clasificar_conversacion_whatsapp(
    ((select value->>'conversation_id' from wa_multi_state where name='known'))::int,
    'personal', null
  )$$,
  '42501', 'La conversación pertenece a otro canal.',
  'otro asesor no puede clasificar la conversación'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000001"}',true);
select results_eq($$select count(*)::int from public.wa_canales$$,array[0],'otra oficina no descubre números conectados');

select * from finish();
rollback;
