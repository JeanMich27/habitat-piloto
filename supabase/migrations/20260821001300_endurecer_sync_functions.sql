-- =============================================================================
-- MIGRACIÓN 13 — Autenticación propia de las Edge Functions de sync + search_path
--
-- Hallazgo de auditoría de seguridad (21 ago 2026), severidad HIGH:
--
-- `verify_jwt` (activo en sync-contactos, sync-leads, sync-propiedades) solo
-- exige QUE HAYA un JWT válido — y la anon key pública (la misma que va en el
-- bundle del navegador y en VITE_SUPABASE_ANON_KEY) ES un JWT válido. Los tres
-- cron jobs la usaban para llamar a las funciones (ver cron.job antes de esta
-- migración), así que cualquiera que copiara esa llave del bundle podía
-- disparar los tres syncs en loop: gasta la cuota paga de la API de EasyBroker
-- y satura leads/propiedades/ingesta_log.
--
-- Fix: un secreto propio en Vault, verificado DENTRO de cada función antes de
-- hacer cualquier llamada externa o escritura. El secreto nunca vive en el
-- bundle del frontend ni en variable de entorno de la función — solo en Vault,
-- leído por `validar_secreto_sync` (solo service_role) y por los cron jobs
-- (rol `postgres`, que no pasa por RLS ni por grants de función).
--
-- De paso: search_path fijo en las 2 funciones que 05-endurecer-funciones.sql
-- dejó pendientes a propósito ("revisar y ajustar por separado"). Revisadas
-- ahora: ninguna referencia a objetos de esquema es ambigua (solo tocan
-- `new`/`old` del trigger), así que fijar el search_path no cambia su
-- comportamiento.
-- =============================================================================

begin;

-- 1. Secreto aleatorio en Vault (no se repite si esta migración ya corrió).
-- No se usa un placeholder conocido: una base nueva queda protegida desde el
-- primer momento. El valor solo se obtiene desde Vault para configurar cron.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sync_edge_functions') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'sync_edge_functions',
      'Secreto compartido para autenticar sync-contactos/sync-leads/sync-propiedades. Si se sospecha exposición, rotar con vault.update_secret(id, nuevo_valor) usando el id de vault.secrets donde name = ''sync_edge_functions''.'
    );
  end if;
end $$;

-- 2. Verificación: solo service_role la llama (desde las Edge Functions, con
--    el valor que reciben en el header X-Sync-Secret).
create or replace function public.validar_secreto_sync(p_secreto text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select p_secreto is not null
     and p_secreto <> ''
     and p_secreto = (
       select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_edge_functions'
        limit 1
     );
$$;

revoke execute on function public.validar_secreto_sync(text) from public, anon, authenticated;
grant  execute on function public.validar_secreto_sync(text) to service_role;

-- 3. Los cron jobs son configuración por entorno: su URL y Authorization no
-- pertenecen a una migración portable. Se configuran después del despliegue
-- siguiendo `supabase/README.md`; nunca con llaves hardcodeadas en Git.

-- 4. search_path fijo (hallazgo MEDIUM de la misma auditoría).
alter function public.historial_solo_crece()     set search_path = public;
alter function public.exigir_bant_para_avanzar() set search_path = public;

commit;

-- El valor se genera durante la migración y NO queda escrito en Git. Está solo
-- en Vault. Rotarlo no requiere tocar código: basta
-- con vault.update_secret() y las 3 funciones/cron jobs lo recogen solos en la
-- siguiente llamada.
