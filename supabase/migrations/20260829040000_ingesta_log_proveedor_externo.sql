-- =============================================================================
-- FIX: ingesta_log.proveedor_externo faltante — 29/08/2026
--
-- Contexto: sync-leads/index.ts y sync-contactos/index.ts escriben
-- `proveedor_externo: "easybroker"` en cada fila de ingesta_log desde que se
-- desplegaron, pero la tabla nunca tuvo esa columna en producción (el
-- bootstrap original en 20260701500000_sync_bootstrap.sql no la incluye y
-- ninguna migración posterior la agregó).
--
-- Efecto medido en producción el 29/08/2026 tras reactivar el sync (tenant
-- AGENCIA_ID había quedado sin configurar): sync-leads reporta el error
-- "Could not find the 'proveedor_externo' column of 'ingesta_log' in the
-- schema cache" en su respuesta; sync-contactos falla la misma escritura pero
-- SIN reportar error (0 filas en ingesta_log en la corrida, "errores": []) —
-- es el mismo patrón de escritura silenciosa marcado como bug C1 el
-- 21/08/2026, ahora confirmado también en el pipeline de sincronización, no
-- solo en la UI.
--
-- Esta migración solo agrega la columna faltante (nullable, sin default) para
-- que el código ya desplegado escriba sin error. No cambia datos existentes.
-- =============================================================================

begin;

alter table public.ingesta_log
  add column if not exists proveedor_externo text;

commit;
