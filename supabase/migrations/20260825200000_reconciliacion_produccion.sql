-- =============================================================================
-- RECONCILIACIÓN REPO ↔ PRODUCCIÓN — 25/08/2026
--
-- Contexto: producción (habitat-piloto) se construyó incrementalmente desde el
-- panel de Supabase antes de que existiera este repositorio. Al comparar ambos
-- esquemas objeto por objeto, producción tenía 12 objetos que ninguna migración
-- versionada crea. Reconstruir desde el repo los habría perdido en silencio.
--
-- Tres de ellos son restricciones ÚNICAS que impiden que la sincronización de
-- EasyBroker duplique contactos, propiedades y asesores. Perderlas no rompe
-- nada de inmediato: simplemente empiezan a aparecer duplicados.
--
-- A partir de esta migración el repositorio es la única fuente de verdad y
-- reproduce producción exactamente. Todo aquí es idempotente.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Llaves anti-duplicado de la sincronización con el CRM
-- -----------------------------------------------------------------------------
-- Una solicitud de contacto de EasyBroker entra una sola vez. Sin esto, un
-- reintento del sync crea el mismo prospecto dos veces y dos asesores llaman.
create unique index if not exists leads_eb_contact_request_id_key
  on public.leads (eb_contact_request_id)
  where eb_contact_request_id is not null;

-- Una propiedad de EasyBroker es una sola fila en el catálogo.
create unique index if not exists propiedades_eb_public_id_key
  on public.propiedades (eb_public_id)
  where eb_public_id is not null;

-- Un agente de EasyBroker es una sola cuenta.
create unique index if not exists usuarios_eb_agent_id_key
  on public.usuarios (eb_agent_id)
  where eb_agent_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Índices de operación
-- -----------------------------------------------------------------------------
create index if not exists leads_telefono_norm_idx
  on public.leads (telefono_norm);

create index if not exists leads_requiere_revision_idx
  on public.leads (requiere_revision)
  where requiere_revision;

create index if not exists propiedades_crm_idx
  on public.propiedades (crm_origen, eb_public_id);

create index if not exists ingesta_log_corrida_idx
  on public.ingesta_log (corrida_en desc);

create index if not exists ingesta_log_resultado_idx
  on public.ingesta_log (resultado);

-- -----------------------------------------------------------------------------
-- 3. Vistas de monitoreo del sync
-- -----------------------------------------------------------------------------
-- Todas con security_invoker = on: la RLS de las tablas base decide qué filas
-- ve cada sesión. Sin esa opción una vista corre con permisos del dueño y se
-- convertiría en una fuga entre oficinas.

create or replace view public.v_ultima_corrida
with (security_invoker = on) as
  select proceso,
         ultima_corrida,
         ultimo_resultado,
         round(extract(epoch from now() - ultima_corrida) / 60::numeric)::integer as hace_minutos
    from public.sync_estado
   order by ultima_corrida desc nulls last;

create or replace view public.v_leads_para_revision
with (security_invoker = on) as
  select l.id,
         l.nombre,
         l.telefono,
         l.correo,
         l.creado,
         l.eb_property_id,
         l.motivo_revision,
         u.nombre as asesor_asignado
    from public.leads l
    left join public.usuarios u on u.id = l.asesor_id
   where l.requiere_revision
   order by l.creado desc;

create or replace view public.v_conciliacion_diaria
with (security_invoker = on) as
  select (creado at time zone 'America/Mexico_City')::date as dia,
         coalesce(nullif(split_part(ltrim(nota, '['), ']', 1), ''), 'sin fuente') as fuente,
         count(*) as leads,
         count(*) filter (where requiere_revision) as requieren_revision,
         count(*) filter (where primer_contacto_en is not null) as ya_contactados
    from public.leads
   where eb_contact_request_id is not null
   group by 1, 2
   order by 1 desc, 3 desc;

create or replace view public.v_semaforo
with (security_invoker = on) as
  with s as (
    select max(case when proceso = 'leads_easybroker' then ultima_corrida end) as leads_corrida,
           max(case when proceso = 'propiedades_easybroker' then ultima_corrida end) as props_corrida
      from public.sync_estado
  ), l as (
    select count(*) filter (where (creado at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date) as leads_hoy,
           count(*) filter (where creado >= now() - interval '7 days') as leads_7d,
           count(*) filter (where requiere_revision) as requieren_revision,
           count(*) filter (where primer_contacto_en is null and etapa = 'Nuevo'
                              and creado >= now() - interval '7 days'
                              and creado <= now() - interval '24 hours') as sin_contactar_24h
      from public.leads
  ), p as (
    select count(*) filter (where eb_public_id is not null) as propiedades_sincronizadas,
           count(*) filter (where eb_public_id is not null and asesor_id is null) as propiedades_sin_asesor
      from public.propiedades
  )
  select s.leads_corrida,
         round(extract(epoch from now() - s.leads_corrida) / 60::numeric)::integer as minutos_desde_ultimo_sync,
         l.leads_hoy,
         l.leads_7d,
         l.requieren_revision,
         l.sin_contactar_24h,
         p.propiedades_sincronizadas,
         p.propiedades_sin_asesor,
         case
           when s.leads_corrida is null then 'ALERTA: el sync nunca ha corrido'
           when s.leads_corrida < now() - interval '2 hours' then 'ALERTA: el sync lleva mas de 2 h sin correr'
           when s.props_corrida < now() - interval '48 hours' then 'ALERTA: el catalogo lleva mas de 48 h sin actualizarse'
           when p.propiedades_sincronizadas = 0 then 'ALERTA: no hay propiedades sincronizadas'
           when p.propiedades_sin_asesor > 0 then 'REVISAR: hay propiedades sin asesor asignado'
           when l.requieren_revision > 0 then 'REVISAR: hay leads que el sistema no pudo rutear'
           when l.sin_contactar_24h > 0 then 'REVISAR: hay leads sin contactar por mas de 24 h'
           else 'OK'
         end as estado
    from s, l, p;

revoke all on public.v_ultima_corrida, public.v_leads_para_revision,
               public.v_conciliacion_diaria, public.v_semaforo
  from anon;

grant select on public.v_ultima_corrida, public.v_leads_para_revision,
                public.v_conciliacion_diaria, public.v_semaforo
  to authenticated;

commit;
