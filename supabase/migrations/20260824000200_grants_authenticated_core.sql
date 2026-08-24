-- Las tablas centrales del CRM (agencias, usuarios, propiedades, leads,
-- configuracion, citas, agenda_feeds, solicitudes_estado, notificaciones)
-- tienen políticas RLS "to authenticated" desde el inicio del proyecto, pero
-- nunca recibieron el GRANT de tabla subyacente en ninguna migración: RLS
-- solo filtra FILAS, no sustituye el privilegio de tabla que Postgres exige
-- para siquiera intentar el SELECT/INSERT/UPDATE/DELETE.
--
-- En producción esto nunca se notó porque Supabase Cloud otorga privilegios
-- por defecto a `authenticated`/`anon` al aprovisionar el proyecto (fuera del
-- historial de migraciones, igual que la fila 'default' de agencias — ver
-- 20260813000100_multitenant_modelo_datos.sql). Un `db reset` desde cero
-- (CI, o un HABITAT DEV nuevo) no hereda ese aprovisionamiento y falla con
-- "permission denied for table ...".
--
-- Confirmado por dos fallas reales en el pgTAP de este mismo CI:
--   - permission denied for table usuarios (p1_reasignacion_atomica.sql)
--   - permission denied for table leads, vía la política RLS de
--     generated_documents/shared_links que hace join a leads/propiedades
--     (p41_cross_tenant_roles.sql)
--
-- GRANT es idempotente: volver a otorgar un privilegio que production ya
-- tiene por su aprovisionamiento no cambia nada allí. Los GRANT aquí solo
-- cubren las operaciones que cada tabla ya expone vía sus propias políticas
-- RLS (ver 20260702000000_auth_rls.sql, 20260813000200_multitenant_rls.sql,
-- 20260814000700_agenda_citas.sql, 20260814000800_solicitudes_estado.sql).
--
-- Deliberadamente fuera de esta migración: sync_estado, ingesta_log,
-- wa_conversaciones, wa_mensajes — son tablas de sincronización/broker que
-- ninguna prueba pgTAP ejercita hoy; se auditan por separado si hace falta.
begin;

grant select, update
  on public.agencias
  to authenticated;

grant select, insert, update, delete
  on public.usuarios, public.propiedades, public.leads, public.citas, public.agenda_feeds
  to authenticated;

grant select, insert, update, delete
  on public.configuracion
  to authenticated;

grant select, insert, update
  on public.solicitudes_estado
  to authenticated;

grant select, update
  on public.notificaciones
  to authenticated;

commit;
