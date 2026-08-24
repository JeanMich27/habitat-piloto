begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.agencias (id,nombre,direccion,slug,estado,plan,codigo_invitacion)
values ('p41x-a','P41X A','','p41x-a','prueba','prueba','P41XA'),
       ('p41x-b','P41X B','','p41x-b','prueba','prueba','P41XB');
insert into public.configuracion (id,agencia_id) values ('p41x-a','p41x-a'),('p41x-b','p41x-b');
insert into public.usuarios
  (id,agencia_id,auth_id,nombre,correo,telefono,rol,puesto,iniciales,estado_cuenta)
values
 ('p41x-broker-a','p41x-a','63000000-0000-4000-8000-000000000001','Broker A','broker-a@p41x.test','','broker','Broker','BA','Activo'),
 ('p41x-independent-a','p41x-a','63000000-0000-4000-8000-000000000002','Independent A','ind-a@p41x.test','','asesor_independiente','Asesor','IA','Activo'),
 ('p41x-team-a','p41x-a','63000000-0000-4000-8000-000000000003','Team A','team-a@p41x.test','','asesor_equipo','Asesor','TA','Activo'),
 ('p41x-owner-a','p41x-a','63000000-0000-4000-8000-000000000004','Owner A','owner-a@p41x.test','','propietario','Owner','OA','Activo'),
 ('p41x-client-a','p41x-a','63000000-0000-4000-8000-000000000005','Client A','client-a@p41x.test','','cliente','Client','CA','Activo'),
 ('p41x-advisor-b','p41x-b','64000000-0000-4000-8000-000000000001','Advisor B','advisor-b@p41x.test','','asesor_independiente','Asesor','AB','Activo');
insert into public.propiedades (id,agencia_id,titulo,tipo_inmueble,tipo_operacion,asesor_id,propietario)
values ('p41x-prop-a','p41x-a','Prop A','Casa','Venta','p41x-independent-a','{"correo":"owner-a@p41x.test"}'),
       ('p41x-prop-b','p41x-b','Prop B','Casa','Venta','p41x-advisor-b','{}');
insert into public.generated_documents
  (id,agencia_id,created_by,document_type,resource_type,resource_id,storage_path,file_size)
values
 ('73000000-0000-4000-8000-000000000001','p41x-a','p41x-independent-a','property_sheet','property','p41x-prop-a','p41x-a/property_sheet/73000000-0000-4000-8000-000000000001.pdf',100),
 ('74000000-0000-4000-8000-000000000001','p41x-b','p41x-advisor-b','property_sheet','property','p41x-prop-b','p41x-b/property_sheet/74000000-0000-4000-8000-000000000001.pdf',100);
insert into public.shared_links
  (id,agencia_id,created_by,resource_type,resource_id,document_id,token_hash,expires_at)
values
 ('83000000-0000-4000-8000-000000000001','p41x-a','p41x-independent-a','property','p41x-prop-a','73000000-0000-4000-8000-000000000001',repeat('c',64),now()+interval '7 days'),
 ('84000000-0000-4000-8000-000000000001','p41x-b','p41x-advisor-b','property','p41x-prop-b','74000000-0000-4000-8000-000000000001',repeat('d',64),now()+interval '7 days');

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"63000000-0000-4000-8000-000000000001","email":"broker-a@p41x.test"}',true);
select results_eq('select resource_id from public.generated_documents',array['p41x-prop-a']::text[],'broker A solo ve documento A');
select results_eq('select resource_id from public.shared_links',array['p41x-prop-a']::text[],'broker A solo ve enlace A');

select set_config('request.jwt.claims','{"sub":"63000000-0000-4000-8000-000000000002","email":"ind-a@p41x.test"}',true);
select results_eq('select resource_id from public.generated_documents',array['p41x-prop-a']::text[],'independiente A ve documento propio A');
select results_eq('select resource_id from public.shared_links',array['p41x-prop-a']::text[],'independiente A no ve enlace B');

select set_config('request.jwt.claims','{"sub":"63000000-0000-4000-8000-000000000003","email":"team-a@p41x.test"}',true);
select results_eq('select count(*)::int from public.generated_documents',array[0],'asesor de equipo sin asignación no ve documentos A ni B');
select results_eq('select count(*)::int from public.shared_links',array[0],'asesor de equipo sin asignación no ve enlaces A ni B');

select set_config('request.jwt.claims','{"sub":"63000000-0000-4000-8000-000000000004","email":"owner-a@p41x.test"}',true);
select results_eq('select count(*)::int from public.generated_documents',array[0],'propietario no ve documentos internos');
select results_eq('select count(*)::int from public.shared_links',array[0],'propietario no ve enlaces internos');

select set_config('request.jwt.claims','{"sub":"63000000-0000-4000-8000-000000000005","email":"client-a@p41x.test"}',true);
select results_eq('select count(*)::int from public.generated_documents',array[0],'cliente no ve documentos internos');
select results_eq('select count(*)::int from public.shared_links',array[0],'cliente no ve enlaces internos');

select * from finish();
rollback;
