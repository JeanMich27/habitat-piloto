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

-- 1. Secreto en Vault (no se repite si esta migración ya corrió).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sync_edge_functions') then
    perform vault.create_secret(
      '__SYNC_SECRET_PLACEHOLDER__',
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

-- 3. Los 3 cron jobs mandan el secreto en X-Sync-Secret, leído de Vault en
--    cada corrida (rol `postgres`: no pasa por RLS ni por los grants de arriba).
--    El valor en texto plano no queda guardado en cron.job.command.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'sync-contactos-diario'),
  command := $cmd$
  select net.http_post(
    url     := 'https://zhtwvxarovfohhmrgqoy.supabase.co/functions/v1/sync-contactos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodHd2eGFyb3Zmb2hobXJncW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDgxNTMsImV4cCI6MjEwMDU4NDE1M30.2fEfpb4lg_N8V2g_lB-BNStoJzqenGg-Rnkv6SqHVgk',
      'X-Sync-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_edge_functions' limit 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 280000
  );
  $cmd$
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'sync-leads-30min'),
  command := $cmd$
  select net.http_post(
    url     := 'https://zhtwvxarovfohhmrgqoy.supabase.co/functions/v1/sync-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodHd2eGFyb3Zmb2hobXJncW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDgxNTMsImV4cCI6MjEwMDU4NDE1M30.2fEfpb4lg_N8V2g_lB-BNStoJzqenGg-Rnkv6SqHVgk',
      'X-Sync-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_edge_functions' limit 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cmd$
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'sync-propiedades-diario'),
  command := $cmd$
  select net.http_post(
    url     := 'https://zhtwvxarovfohhmrgqoy.supabase.co/functions/v1/sync-propiedades',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpodHd2eGFyb3Zmb2hobXJncW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDgxNTMsImV4cCI6MjEwMDU4NDE1M30.2fEfpb4lg_N8V2g_lB-BNStoJzqenGg-Rnkv6SqHVgk',
      'X-Sync-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_edge_functions' limit 1)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cmd$
);

-- 4. search_path fijo (hallazgo MEDIUM de la misma auditoría).
alter function public.historial_solo_crece()     set search_path = public;
alter function public.exigir_bant_para_avanzar() set search_path = public;

commit;

-- Nota: el valor real del secreto se generó en el momento de aplicar esta
-- migración y NO queda escrito en este archivo (se sustituye el placeholder
-- antes de correr). Está solo en Vault. Rotarlo no requiere tocar código: basta
-- con vault.update_secret() y las 3 funciones/cron jobs lo recogen solos en la
-- siguiente llamada.
