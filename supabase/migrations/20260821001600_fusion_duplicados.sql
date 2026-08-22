-- =============================================================================
-- MIGRACIÓN 16 — Una persona, una ficha            [APLICADA 21 ago 2026]
--
-- Cuatro contactos quedaron con DOS fichas: la del buzón de portales
-- (`eb-<solicitud>`, con propiedad de interés) y la del directorio del CRM
-- (`ebc-<contacto>`, creada al día siguiente por sync-contactos). Es el mismo
-- teléfono y el mismo correo en las dos. Contadas por separado, la app mostraba
-- más clientes que EasyBroker.
--
-- Causa: cuando llega la solicitud de portal, EasyBroker todavía no tiene el
-- contacto creado, así que `contact_id` viene vacío. Horas después el contacto
-- existe y sync-contactos no encontraba con qué emparejarlo.
-- Arreglado en sync-leads v6: si el contacto ya está como ficha de directorio,
-- la solicitud la ASCIENDE en vez de crear una segunda.
--
-- Aquí se limpia lo que ya estaba duplicado. Se conserva la ficha de portal
-- (tiene la propiedad de interés y la etapa real) y se le pega la nota de la
-- ficha de directorio antes de borrarla. Ninguna de las 4 fichas de directorio
-- tenía historial ni BANT capturado, así que no se perdió trabajo del asesor.
--
-- NOTA: un mismo contacto con DOS solicitudes por DOS propiedades distintas
-- sigue siendo dos leads a propósito (6 casos hoy). Son dos intereses, no un
-- duplicado; fusionarlos escondería una de las dos propiedades.
-- =============================================================================

with pares as (
  select p.id as id_portal, d.id as id_directorio, d.nota as nota_directorio
    from public.leads p
    join public.leads d
      on d.eb_contact_id = p.eb_contact_id
     and d.agencia_id    = p.agencia_id
     and d.es_directorio is true
     and p.es_directorio is false
   where p.eb_contact_request_id is not null
     and p.eb_contact_id is not null
)
update public.leads l
   set nota = left(coalesce(l.nota, '') || E'\n' || coalesce(pares.nota_directorio, ''), 8000)
  from pares
 where l.id = pares.id_portal;

delete from public.leads d
 where d.es_directorio is true
   and d.eb_contact_id is not null
   and exists (
     select 1 from public.leads p
      where p.eb_contact_id = d.eb_contact_id
        and p.agencia_id    = d.agencia_id
        and p.es_directorio is false
        and p.eb_contact_request_id is not null
   );
