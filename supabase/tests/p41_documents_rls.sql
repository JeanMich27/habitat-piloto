begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.agencias (id,nombre,direccion,slug,estado,plan,codigo_invitacion)
values ('p41-a','P41 A','','p41-a','prueba','prueba','P41A'),
       ('p41-b','P41 B','','p41-b','prueba','prueba','P41B');
insert into public.configuracion (id,agencia_id) values ('p41-a','p41-a'),('p41-b','p41-b');
insert into public.usuarios
  (id,agencia_id,auth_id,nombre,correo,telefono,rol,puesto,iniciales,estado_cuenta)
values
 ('p41-broker-a','p41-a','61000000-0000-4000-8000-000000000001','Broker A','broker-a@p41.test','','broker','Broker','BA','Activo'),
 ('p41-advisor-a','p41-a','61000000-0000-4000-8000-000000000002','Advisor A','advisor-a@p41.test','','asesor_equipo','Asesor','AA','Activo'),
 ('p41-owner-a','p41-a','61000000-0000-4000-8000-000000000003','Owner A','owner-a@p41.test','','propietario','Owner','OA','Activo'),
 ('p41-client-a','p41-a','61000000-0000-4000-8000-000000000004','Client A','client-a@p41.test','','cliente','Client','CA','Activo'),
 ('p41-broker-b','p41-b','62000000-0000-4000-8000-000000000001','Broker B','broker-b@p41.test','','broker','Broker','BB','Activo');
insert into public.propiedades (id,agencia_id,titulo,tipo_inmueble,tipo_operacion,asesor_id,propietario)
values ('p41-prop-a','p41-a','Prop A','Casa','Venta','p41-advisor-a','{"correo":"owner-a@p41.test"}'),
       ('p41-prop-b','p41-b','Prop B','Casa','Venta','p41-broker-b','{}');
insert into public.generated_documents
  (id,agencia_id,created_by,document_type,resource_type,resource_id,storage_path,file_size)
values
 ('71000000-0000-4000-8000-000000000001','p41-a','p41-advisor-a','property_sheet','property','p41-prop-a','p41-a/property_sheet/71000000-0000-4000-8000-000000000001.pdf',100),
 ('72000000-0000-4000-8000-000000000001','p41-b','p41-broker-b','property_sheet','property','p41-prop-b','p41-b/property_sheet/72000000-0000-4000-8000-000000000001.pdf',100);
insert into public.shared_links
  (id,agencia_id,created_by,resource_type,resource_id,document_id,token_hash,expires_at)
values
 ('81000000-0000-4000-8000-000000000001','p41-a','p41-advisor-a','property','p41-prop-a','71000000-0000-4000-8000-000000000001',repeat('a',64),now()+interval '7 days'),
 ('82000000-0000-4000-8000-000000000001','p41-b','p41-broker-b','property','p41-prop-b','72000000-0000-4000-8000-000000000001',repeat('b',64),now()+interval '7 days');

select hasnt_table_privilege('anon','public.generated_documents','select','anon no consulta documentos');
select hasnt_table_privilege('anon','public.shared_links','select','anon no consulta enlaces ni hashes');
select hasnt_table_privilege('authenticated','public.generated_documents','insert','browser no registra documentos');
select hasnt_table_privilege('authenticated','public.shared_links','insert','browser no crea enlaces');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000002","email":"advisor-a@p41.test"}',true);
select results_eq('select resource_id from public.generated_documents',array['p41-prop-a']::text[],'advisor ve documento permitido de su tenant');
select results_eq('select resource_id from public.shared_links',array['p41-prop-a']::text[],'advisor ve solo enlaces del tenant');
select hasnt_table_privilege('authenticated','public.shared_links','update','browser no altera ni mueve enlaces');
select ok(public.revoke_shared_link('81000000-0000-4000-8000-000000000001'),'creador revoca enlace');
select results_eq($$select count(*)::int from public.document_audit_events where event_type='share_link_revoked'$$,array[0],'advisor no puede leer auditoría');

select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000003","email":"owner-a@p41.test"}',true);
select results_eq('select count(*)::int from public.generated_documents',array[0],'owner no consulta documentos');
select results_eq('select count(*)::int from public.shared_links',array[0],'owner no consulta enlaces');

select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000004","email":"client-a@p41.test"}',true);
select results_eq('select count(*)::int from public.generated_documents',array[0],'client no consulta documentos');
select results_eq('select count(*)::int from public.shared_links',array[0],'client no consulta enlaces');

select set_config('request.jwt.claims','{"sub":"62000000-0000-4000-8000-000000000001","email":"broker-b@p41.test"}',true);
select results_eq('select resource_id from public.generated_documents',array['p41-prop-b']::text[],'broker B no ve documento A');
select results_eq('select resource_id from public.shared_links',array['p41-prop-b']::text[],'broker B no ve enlace A');

select * from finish();
rollback;
