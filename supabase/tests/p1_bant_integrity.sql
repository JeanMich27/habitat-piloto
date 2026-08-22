begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.agencias (id, nombre, direccion, slug, estado, plan, codigo_invitacion)
values ('p1-bant-a', 'P1 BANT', '', 'p1-bant-a', 'prueba', 'prueba', 'P1BANT');
insert into public.usuarios
  (id, agencia_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta)
values ('p1-bant-user', 'p1-bant-a', 'Asesor', 'p1-bant@test.mx', '', 'asesor_equipo', 'Asesor', 'AB', 'Activo');

insert into public.leads (id, agencia_id, nombre, telefono, etapa, origen, asesor_id, bant)
values (
  'p1-bant-lead', 'p1-bant-a', 'Lead', '', 'Contactado', 'Directo', 'p1-bant-user',
  '{"presupuesto":"aprobado","autoridad":"","necesidad":"","plazo":"","calificadoPor":"Asesor","calificadoEl":"2026-08-22T12:00:00Z"}'::jsonb
);

select is((select puntaje_bant from public.leads where id='p1-bant-lead'), null, 'BANT parcial no tiene puntaje');
select is((select clasificacion_lead from public.leads where id='p1-bant-lead'), null, 'BANT parcial no tiene clase');
select throws_ok(
  $$update public.leads set etapa='Visitado' where id='p1-bant-lead'$$,
  '22023', 'No se puede mantener el prospecto en "Visitado" sin las 4 respuestas de calificación.',
  'BANT parcial no avanza'
);

update public.leads set bant = bant || '{"autoridad":"decide","necesidad":"clara","plazo":"inmediato"}'::jsonb
where id='p1-bant-lead';
select is((select puntaje_bant from public.leads where id='p1-bant-lead'), 100, 'BANT completo obtiene puntaje');
select is((select clasificacion_lead from public.leads where id='p1-bant-lead'), 'Hot', 'BANT completo obtiene clase');
update public.leads set etapa='Visitado' where id='p1-bant-lead';
select throws_ok(
  $$update public.leads set bant=jsonb_set(bant, '{plazo}', '""') where id='p1-bant-lead'$$,
  '22023', 'No se puede mantener el prospecto en "Visitado" sin las 4 respuestas de calificación.',
  'no permite perder un dato completo en etapa avanzada'
);

select * from finish();
rollback;
