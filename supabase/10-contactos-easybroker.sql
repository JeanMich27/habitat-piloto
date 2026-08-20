-- ============================================================
-- 10 · El directorio de contactos de EasyBroker
-- Aplicado el 20 de agosto de 2026
--
-- EL HALLAZGO
-- La app vivía solo de /v1/contact_requests: el buzón de portales.
-- Medido contra la API real de la cuenta:
--     /v1/contacts          → 1,260   (el CRM completo)
--     /v1/contact_requests  →   524   (solo lo que llegó por portal)
--     leads en la app       →   164
-- Más de la mitad del activo comercial —los contactos que los asesores
-- capturan a mano— nunca había sido consultado. No era un bug de guardado:
-- la app jamás le preguntaba a EasyBroker por ellos.
--
-- LO QUE /v1/contacts SÍ DA:  id, full_name, email, phone, agent (nombre),
--   source, created_at, updated_at. En el detalle además: first/last_name,
--   title, company, private_description, tags[], probability, phones[],
--   emails[], addresses[], agent{id,name,email,mobile_phone}.
-- LO QUE NO DA:  propiedad de interés, etapa del pipeline, notas de
--   seguimiento, historial de actividad, ofertas.
--
-- EL PUENTE
-- contact_requests.contact_id es la ÚNICA llave que une un contacto del CRM
-- con la propiedad por la que preguntó. Por eso se guarda en leads.
-- ============================================================

alter table public.leads add column if not exists eb_contact_id bigint;
create index if not exists leads_eb_contact_id_idx
  on public.leads (eb_contact_id) where eb_contact_id is not null;

-- Dos banderas para no mezclar peras con manzanas dentro de la misma lista.
--
-- es_directorio: contactos del CRM que NUNCA generaron solicitud de portal.
--   No tienen propiedad ni etapa real: la API no los expone. Si entraran al
--   embudo como "Nuevo", la bandeja de pendientes pasaría de ~20 a ~800 y la
--   tasa de respuesta del equipo quedaría inservible.
--
-- es_historico: solicitudes de portal anteriores a la ventana móvil de 30
--   días del sync. Son leads reales, pero de hace meses: cuentan para el
--   histórico y la conciliación por fuente, no para "qué atiendo hoy".
alter table public.leads add column if not exists es_directorio boolean not null default false;
alter table public.leads add column if not exists es_historico  boolean not null default false;

create index if not exists leads_operativos_idx
  on public.leads (agencia_id, asesor_id)
  where not es_directorio and not es_historico;

comment on column public.leads.es_directorio is
  'Contacto del CRM sin solicitud de portal asociada. No cuenta como lead operativo.';
comment on column public.leads.es_historico is
  'Solicitud de portal anterior a la ventana móvil del sync. No cuenta como pendiente por atender.';

-- Marcado del histórico tras la corrida única de 400 días (sync-leads?dias=400).
-- Idempotente: se puede volver a correr.
update public.leads
set es_historico = true,
    etapa = case when etapa = 'Nuevo' then 'Contactado' else etapa end
where eb_contact_request_id is not null
  and creado < now() - interval '30 days'
  and not es_historico;

-- Job diario del directorio (7:30 AM CDMX). Sustituye TU_ANON_KEY si lo
-- vuelves a crear a mano.
-- select cron.schedule('sync-contactos-diario', '30 12 * * *', $$
--   select net.http_post(
--     url := 'https://zhtwvxarovfohhmrgqoy.supabase.co/functions/v1/sync-contactos',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer TU_ANON_KEY"}'::jsonb,
--     body := '{}'::jsonb, timeout_milliseconds := 280000);
-- $$);
