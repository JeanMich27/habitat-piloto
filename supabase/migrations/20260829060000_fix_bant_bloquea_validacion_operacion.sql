-- =============================================================================
-- FIX: exigir_bant_para_avanzar bloqueaba la validación de operaciones
-- =============================================================================
--
-- Encontrado revisando la rama codex/operaciones-cierre-c1 contra datos reales
-- de producción (transacción de prueba, revertida, sin efecto en la base).
--
-- resolver_operacion() mueve el lead a etapa='Cierre' cuando el broker valida
-- una operación. El trigger exigir_bant_para_avanzar (20260701000000 o previo)
-- ya exige las 4 respuestas de BANT completas para permitir esa etapa en
-- cualquier lead. Ningún lead de prueba las tenía, y resolver_operacion()
-- fallaba con: "No se puede mantener el prospecto en "Cierre" sin las 4
-- respuestas de calificación." — bloqueando CUALQUIER cierre validado de un
-- lead sin BANT completo. No fue detectado por las 212 pruebas unitarias ni
-- las 14 E2E de la rama (mockean Supabase, no ejecutan triggers reales) ni por
-- las pruebas pgTAP (nunca se corrieron — sin Docker en esta máquina).
--
-- Fix: el mismo patrón que ya usa proteger_ganado_por_operacion — ceder
-- cuando resolver_operacion() ya está validando (app.validando_operacion=1).
-- Una operación validada por el broker es evidencia suficiente del cierre;
-- exigir BANT en ese momento no aporta nada y solo rompe el flujo.
-- =============================================================================

begin;

create or replace function public.exigir_bant_para_avanzar()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.etapa in ('Visitado','Negociacion','Cierre')
     and not public.bant_completo(new.bant)
     and (tg_op = 'INSERT' or new.etapa is distinct from old.etapa or new.bant is distinct from old.bant)
     and coalesce(current_setting('app.validando_operacion', true), '') <> '1' then
    raise exception 'No se puede mantener el prospecto en "%" sin las 4 respuestas de calificación.', new.etapa
      using errcode = '22023';
  end if;
  return new;
end;
$$;

commit;
