-- ============================================================
-- 11 · Sync incremental de contactos  (20 ago 2026)
--
-- POR QUÉ:
-- sync-contactos v1 era CREATE-ONLY: si un contacto ya existía en la
-- plataforma, se saltaba entero. Un teléfono corregido en EasyBroker jamás
-- llegaba a la app. Para poder actualizar sin reescribir 1,260 filas en cada
-- corrida, guardamos el updated_at que EasyBroker reporta por contacto y solo
-- tocamos las filas cuyo sello cambió.
--
-- El índice sobre (agencia_id, creado desc) es para la pantalla de Clientes:
-- la lista se pide paginada y ordenada por lead más nuevo primero.
-- ============================================================
alter table public.leads
  add column if not exists eb_actualizado_en timestamptz;

comment on column public.leads.eb_actualizado_en is
  'updated_at del contacto en EasyBroker en la última sincronización. Cursor incremental: si EB reporta uno más nuevo, se refrescan nombre, teléfono, correo y asesor. Nunca la etapa ni el BANT.';

create index if not exists idx_leads_agencia_creado
  on public.leads (agencia_id, creado desc);

create index if not exists idx_leads_agencia_eb_contact
  on public.leads (agencia_id, eb_contact_id);
