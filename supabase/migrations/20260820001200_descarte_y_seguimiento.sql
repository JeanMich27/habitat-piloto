-- ============================================================
-- 12 · Descarte y seguimiento de leads  (20 ago 2026)
--
-- POR QUÉ:
-- De 1,292 registros en la plataforma, solo 3 tenían calificación BANT. La
-- causa no era pereza del asesor: el cuestionario exige las 4 respuestas o no
-- deja guardar nada. Cuando el cliente no contesta, o contesta que ya compró
-- con otra inmobiliaria, el asesor no tenía DÓNDE registrarlo — así que no
-- registraba nada y el lead se quedaba en "Nuevo" para siempre.
--
-- DECISIÓN: el desenlace vive en un campo APARTE de la etapa, no como una
-- etapa más del Kanban. Si "Descartado" fuera una etapa, al mover el lead ahí
-- se perdería en qué etapa murió — y ahí es exactamente donde está el
-- diagnóstico de dónde se cae el embudo. Con el campo aparte se puede decir
-- "se perdieron 40 leads en Contactado, 32 de ellos por fuera de presupuesto".
--
-- estado_lead:
--   Activo         · en juego (default de todo lo que entra por el sync)
--   Sin respuesta  · se intentó contactar y no hubo respuesta todavía
--   Descartado     · se cierra con motivo; sale del trabajo del día
--   Ganado         · cerró operación
--
-- intentos_contacto / ultimo_intento_en alimentan la sugerencia de descarte
-- (4 intentos en 10 días). La app SUGIERE; el asesor decide. Un descarte
-- automático perdería leads que sí contestaban al cuarto intento.
-- ============================================================
alter table public.leads
  add column if not exists estado_lead text not null default 'Activo',
  add column if not exists familia_perdida text,
  add column if not exists motivo_perdida text,
  add column if not exists detalle_perdida text,
  add column if not exists cerrado_en timestamptz,
  add column if not exists cerrado_por text,
  add column if not exists intentos_contacto integer not null default 0,
  add column if not exists ultimo_intento_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_estado_lead_valido') then
    alter table public.leads add constraint leads_estado_lead_valido
      check (estado_lead in ('Activo','Sin respuesta','Descartado','Ganado'));
  end if;
end $$;

create index if not exists idx_leads_agencia_estado on public.leads (agencia_id, estado_lead);

comment on column public.leads.estado_lead is
  'Desenlace del lead, independiente de la etapa del embudo. La etapa dice hasta dónde llegó; el estado dice si sigue en juego.';
comment on column public.leads.familia_perdida is
  'Agrupador del motivo de descarte: No se pudo contactar / Ya no está interesado / No calificaba / No era un lead real.';
comment on column public.leads.motivo_perdida is
  'Motivo específico dentro de la familia. Es el dato que le sirve a marketing para corregir la segmentación del anuncio.';
