-- =============================================================================
-- MIGRACIÓN 04 — telefono_norm siempre calculado en la base
--
-- Problema: `leads.telefono_norm` es la llave con la que la ingesta de
-- EasyBroker decide si un contacto ya existe. Hoy solo la llena ese proceso.
-- Un lead capturado a mano en la app —o creado por el bot de WhatsApp— entra
-- con `telefono_norm` en NULL, así que la ingesta no lo reconoce y lo vuelve a
-- crear. Resultado: el mismo prospecto duplicado y dos asesores llamándole.
--
-- Solución: que la base lo calcule siempre, con la misma función `norm_tel()`
-- que ya usa la ingesta. Así ningún cliente —frontend, Edge Function, n8n—
-- necesita conocer la regla de normalización, y no hay dos copias que se
-- separen con el tiempo.
--
-- Requiere la migración 01 (usa `agencia_id` en el índice de deduplicación).
-- =============================================================================

begin;

create or replace function public.set_telefono_norm()
returns trigger language plpgsql set search_path = public as $$
begin
  new.telefono_norm := public.norm_tel(new.telefono);
  return new;
end $$;

drop trigger if exists leads_set_telefono_norm on public.leads;
create trigger leads_set_telefono_norm
  before insert or update of telefono on public.leads
  for each row execute function public.set_telefono_norm();

-- Backfill de lo que quedó sin normalizar.
update public.leads
   set telefono_norm = public.norm_tel(telefono)
 where telefono_norm is distinct from public.norm_tel(telefono);

-- Índice de deduplicación por oficina. No es único a propósito: dos personas
-- distintas pueden compartir un teléfono (una pareja buscando casa), y un
-- índice único rechazaría el segundo lead en vez de avisar.
create index if not exists leads_dedup_tel_idx
  on public.leads (agencia_id, telefono_norm)
  where telefono_norm is not null;

commit;

-- Comprobación rápida:
--   select count(*) from public.leads where telefono <> '' and telefono_norm is null;
--   -- debe devolver 0
