-- =============================================================================
-- MIGRACIÓN 14 — Parte A (no destructiva)   [APLICADA 21 ago 2026]
--
-- 1) Sello de reconciliación contra EasyBroker. Hasta hoy el sync era de una
--    sola dirección: un contacto borrado en el CRM se quedaba para siempre en
--    la plataforma y los conteos no cuadraban con lo que ve el broker en
--    EasyBroker. Con `eb_visto_en` + `fuera_de_crm` la app puede decir
--    exactamente qué sigue vivo en el CRM y qué no, sin borrar historia.
--
-- 2) La cuenta de la oficina en EasyBroker (agente 868048) pasa a broker.
--    Reemplaza a la cuenta personal de pruebas que se elimina en la parte B.
-- =============================================================================

alter table public.leads
  add column if not exists eb_visto_en   timestamptz,
  add column if not exists fuera_de_crm  boolean not null default false;

comment on column public.leads.eb_visto_en is
  'Última corrida de sync-contactos en la que EasyBroker devolvió este contacto.';
comment on column public.leads.fuera_de_crm is
  'true = EasyBroker ya no devuelve este contacto. La app lo conserva como historia pero lo saca de los conteos que deben cuadrar con el CRM.';

create index if not exists leads_fuera_de_crm_idx
  on public.leads (agencia_id, fuera_de_crm);

update public.usuarios
   set rol = 'broker',
       puesto = 'Broker / Administrador'
 where id = 'eb-agent-868048'
   and agencia_id = 'default';
