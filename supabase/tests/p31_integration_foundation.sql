begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

insert into public.agencias (id,nombre,direccion,slug,estado,plan,codigo_invitacion)
values ('p31-a','P31 A','','p31-a','prueba','prueba','P31A'),
       ('p31-b','P31 B','','p31-b','prueba','prueba','P31B');
insert into public.configuracion (id,agencia_id) values ('p31-a','p31-a'),('p31-b','p31-b');
insert into public.usuarios
  (id,agencia_id,auth_id,nombre,correo,telefono,rol,puesto,iniciales,estado_cuenta)
values ('p31-broker-a','p31-a','51000000-0000-4000-8000-000000000001','Broker A','p31-a@test','','broker','Broker','BA','Activo'),
       ('p31-broker-b','p31-b','52000000-0000-4000-8000-000000000001','Broker B','p31-b@test','','broker','Broker','BB','Activo');
insert into public.propiedades (id,agencia_id,titulo,tipo_inmueble,tipo_operacion,asesor_id,propietario)
values ('p31-prop-b','p31-b','Prop B','Casa','Venta','p31-broker-b','{}');

select ok(not has_table_privilege('anon','public.integration_credentials','select'),'anon no lee credenciales');
select ok(not has_table_privilege('authenticated','public.integration_credentials','select'),'usuarios no leen hashes');
select ok(not has_table_privilege('authenticated','public.webhook_endpoints','select'),'usuarios no leen referencias a secretos');
select ok(not has_function_privilege('authenticated','public.claim_webhook_deliveries(integer)','execute'),'cliente no reclama entregas');

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create temp table p31_state (name text primary key,value text);
insert into p31_state values ('key',(public.provision_integration_credential('p31-a','mock','Mock',array['leads.write'])->>'api_key'));

insert into p31_state values ('first',public.process_integration_lead_command(
  'mock',(select value from p31_state where name='key'),'external-1','53000000-0000-4000-8000-000000000001',
  '{"name":"Lead P31","phone":"5511119999","source":"mock"}'::jsonb)::text);
select is(((select value from p31_state where name='first')::jsonb->>'ok')::boolean,true,'command crea el lead');
select results_eq($$select count(*)::int from public.leads where agencia_id='p31-a' and telefono_norm='5511119999'$$,array[1],'alta única en tenant A');
select results_eq($$select count(*)::int from public.integration_events where agencia_id='p31-a' and event_type='lead.created' and event_version=1$$,array[1],'cambio y evento son transaccionales');

insert into p31_state values ('replay',public.process_integration_lead_command(
  'mock',(select value from p31_state where name='key'),'external-1','53000000-0000-4000-8000-000000000001',
  '{"name":"Duplicado","phone":"5511119999","source":"mock"}'::jsonb)::text);
select is(((select value from p31_state where name='replay')::jsonb->>'idempotent_replay')::boolean,true,'replay devuelve resultado almacenado');
select results_eq($$select count(*)::int from public.integration_idempotency where agencia_id='p31-a' and provider='mock' and external_event_id='external-1'$$,array[1],'idempotencia usa agencia proveedor e ID externo');

insert into p31_state values ('cross',public.process_integration_lead_command(
  'mock',(select value from p31_state where name='key'),'external-cross','53000000-0000-4000-8000-000000000002',
  '{"name":"Cruce","phone":"5522229999","source":"mock","property_id":"p31-prop-b"}'::jsonb)::text);
select is((select value::jsonb->>'error_code' from p31_state where name='cross'),'23503','credencial A no usa propiedad B');
select results_eq($$select count(*)::int from public.leads where telefono_norm='5522229999'$$,array[0],'rechazo cross-tenant no deja escritura parcial');

insert into p31_state values ('endpoint',(public.provision_webhook_endpoint(
  'p31-a','Mock endpoint','https://example.invalid/webhook',array['lead.updated'])->>'id'));
update public.webhook_endpoints set enabled=false where id=(select value::uuid from p31_state where name='endpoint');
update public.leads set nota='sin delivery' where agencia_id='p31-a' and telefono_norm='5511119999';
select results_eq($$select count(*)::int from public.webhook_deliveries$$,array[0],'endpoint deshabilitado no recibe delivery');

update public.webhook_endpoints set enabled=true where id=(select value::uuid from p31_state where name='endpoint');
update public.leads set nota='con delivery' where agencia_id='p31-a' and telefono_norm='5511119999';
select results_eq($$select count(*)::int from public.webhook_deliveries where status='pending'$$,array[1],'evento suscrito crea delivery');
insert into p31_state select 'delivery',delivery_id::text from public.claim_webhook_deliveries(1);
select results_eq($$select attempts from public.webhook_deliveries where id=(select value::uuid from p31_state where name='delivery')$$,array[1],'claim incrementa intento con lock');
select public.complete_webhook_delivery((select value::uuid from p31_state where name='delivery'),'retry',503,'HTTP 503',60,10);
select results_eq($$select status from public.webhook_deliveries where id=(select value::uuid from p31_state where name='delivery')$$,array['pending'],'5xx queda pendiente con backoff');
update public.webhook_deliveries set next_attempt_at=now() where id=(select value::uuid from p31_state where name='delivery');
select count(*) from public.claim_webhook_deliveries(1);
select public.complete_webhook_delivery((select value::uuid from p31_state where name='delivery'),'success',204,null,null,8);
select results_eq($$select status from public.webhook_deliveries where id=(select value::uuid from p31_state where name='delivery')$$,array['succeeded'],'2xx finaliza delivery');
select results_eq($$select status from public.integration_events where id=(select event_id from public.webhook_deliveries where id=(select value::uuid from p31_state where name='delivery'))$$,array['processed'],'outbox se marca procesada');
select results_eq($$select count(*)::int from public.integration_logs where direction='inbound' and agencia_id='p31-a'$$,array[1],'auditoría inbound no duplica replay');
select results_eq($$select count(*)::int from public.integration_logs where direction='outbound' and agencia_id='p31-a'$$,array[2],'auditoría registra retry y éxito');

select * from finish();
rollback;
