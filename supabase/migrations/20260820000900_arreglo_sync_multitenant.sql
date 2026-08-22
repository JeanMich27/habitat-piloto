-- ============================================================
-- 09 · Arreglo de la ruptura del sync por multi-tenant
-- Aplicado el 20 de agosto de 2026
--
-- QUÉ PASÓ
-- La migración 01 volvió `agencia_id` NOT NULL en todas las tablas. Los
-- procesos automáticos (Edge Functions con service_role) NO pasan por RLS,
-- así que no heredan la oficina del usuario y nunca mandaban la columna.
-- Resultado: desde el 13 de agosto, cada lead nuevo de EasyBroker se
-- rechazaba con "El asesor eb-agent-XXXXXX no pertenece a la agencia <NULL>".
-- 7 días sin guardar un solo contacto.
--
-- POR QUÉ NADIE SE ENTERÓ
-- La misma migración cambió la PK de `sync_estado` a (agencia_id, proceso).
-- Las funciones hacían upsert con onConflict:"proceso" — ya no existía esa
-- restricción única — y el error NUNCA se revisaba en el código. El semáforo
-- se congeló mostrando la última corrida buena mientras el sync moría cada
-- 30 minutos. Un sync roto que reporta "OK" es peor que uno que no reporta.
--
-- LAS FUNCIONES YA MANDAN agencia_id EXPLÍCITO (variable AGENCIA_ID).
-- Este default es la red de seguridad, no el arreglo principal.
-- ============================================================

alter table public.leads          alter column agencia_id set default 'default';
alter table public.propiedades    alter column agencia_id set default 'default';
alter table public.usuarios       alter column agencia_id set default 'default';
alter table public.sync_estado    alter column agencia_id set default 'default';
alter table public.ingesta_log    alter column agencia_id set default 'default';
alter table public.notificaciones alter column agencia_id set default 'default';
alter table public.citas          alter column agencia_id set default 'default';
