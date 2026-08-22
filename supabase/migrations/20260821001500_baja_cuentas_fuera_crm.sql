-- =============================================================================
-- MIGRACIÓN 15 — La plataforma se queda SOLO con lo que entrega el CRM
--                                                   [APLICADA 21 ago 2026]
--
-- Decisión de producto (21 ago 2026): la aplicación no es dueña de usuarios ni
-- de inventario. EasyBroker (y mañana el CRM que traiga cada agencia) es la
-- única fuente. Todo lo que no venga de ahí sale de la base:
--
--   a) `user-broker-jean` (niper987@gmail.com): cuenta personal de pruebas del
--      arranque del proyecto. Además era el "asesor de respaldo" del sync, así
--      que acumuló 120 leads que no trabajó nadie. Ya se reasignaron 106 al
--      agente que EasyBroker tiene en el contacto (sync-contactos v3); los 14
--      restantes son contactos que en EasyBroker NO tienen agente asignado y
--      quedan sin asesor y marcados para revisión — a la vista, no escondidos.
--   b) `user-001` .. `user-008`, `prop-001` .. `prop-006`, `lead-001` ..
--      `lead-008`: la semilla de demostración (db.json) que alguien subió a la
--      nube. Correos @realestate.mx y @example.com; ninguno existe en el CRM.
--   c) `user-f449a5e6` (nadiaizaguirre26@gmail.com): se registró con el código
--      de invitación sin existir en EasyBroker. Cero leads, cero propiedades.
--
-- El rol de broker pasó en la migración 14 a la cuenta de la oficina en
-- EasyBroker (`eb-agent-868048`, infobienesraiceshabitat@gmail.com). Está en
-- estado "Invitado": se activa sola en cuanto alguien inicie sesión con ese
-- correo (trigger `manejar_nuevo_registro`, camino (a)).
--
-- Las FK de `leads.asesor_id` y `propiedades.asesor_id` son ON DELETE SET NULL:
-- borrar un usuario nunca borra su trabajo, solo lo deja sin dueño.
-- =============================================================================

-- 1. Antes de que la FK los deje en null: dejarlos marcados para que el broker
--    los reparta. Un lead sin asesor y sin bandera es un lead invisible.
update public.leads
   set requiere_revision = true,
       motivo_revision   = coalesce(nullif(motivo_revision, '') || '; ', '')
                        || 'sin asesor: EasyBroker no tiene agente asignado en este contacto'
 where asesor_id = 'user-broker-jean';

-- 2. Datos de demostración (no existen en ningún CRM).
delete from public.leads       where id like 'lead-00%';
delete from public.propiedades where id like 'prop-00%';

-- 3. Cuentas fuera del CRM.
delete from public.usuarios
 where id = 'user-broker-jean'
    or id = 'user-f449a5e6'
    or id ~ '^user-00[1-8]$';

-- 4. Sus credenciales en Auth. Sin esto la persona sigue pudiendo iniciar
--    sesión: entraría sin perfil, sin agencia y sin ver una sola fila (RLS),
--    pero la sesión existiría. Se borran las de los perfiles recién
--    eliminados y ninguna otra.
delete from auth.users u
 where u.email in ('niper987@gmail.com', 'nadiaizaguirre26@gmail.com')
   and not exists (select 1 from public.usuarios x where x.auth_id = u.id);
