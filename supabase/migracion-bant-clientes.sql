-- ============================================================
--  MIGRACIÓN: Calificación objetiva BANT + historial de clientes
-- ============================================================
--
-- Ejecutar completa en Supabase: Dashboard > SQL Editor > New query > Run.
-- Es idempotente: si la corres dos veces no rompe nada.
--
-- QUÉ GARANTIZA ESTA MIGRACIÓN (y por qué está en la base y no solo en la app)
--
-- La app puede tener errores, alguien puede escribir por la API, o mañana
-- puede haber otro cliente (n8n, un importador, una automatización). Si la
-- regla de calificación vive solo en el frontend, la objetividad es una
-- promesa. Aquí se vuelve una restricción:
--
--   1. `bant` solo acepta las opciones del catálogo. No se puede inventar
--      una respuesta intermedia ni escribir texto libre en los criterios.
--   2. `puntaje_bant` es una COLUMNA GENERADA: la base la calcula sola a
--      partir de las respuestas. Nadie puede mandar un puntaje inflado —
--      literalmente no es un campo escribible.
--   3. `clasificacion_lead` (Hot/Warm/Cold) también es generada.
--   4. Un prospecto NO puede estar en Visitado, Negociación o Cierre sin
--      calificación. La base rechaza el update.
--
-- Pesos: Presupuesto 30 / Autoridad 20 / Necesidad 30 / Plazo 20 = 100.

-- ------------------------------------------------------------
-- 1. Columnas nuevas
-- ------------------------------------------------------------
alter table public.leads add column if not exists ocupacion text not null default '';
alter table public.leads add column if not exists bant jsonb;
alter table public.leads add column if not exists historial jsonb not null default '[]'::jsonb;

-- ------------------------------------------------------------
-- 2. Solo se aceptan respuestas del catálogo
-- ------------------------------------------------------------
-- Si `bant` existe, sus 4 criterios deben venir del catálogo cerrado.
-- Esto es lo que impide que dos asesores "interpreten" distinto.
--
-- El bloque de dinero depende del perfil: a un inquilino no se le mide por
-- crédito hipotecario sino por solvencia y respaldo. Ambos catálogos suman
-- igual (30/15/5/0), así que el puntaje sigue siendo comparable.
alter table public.leads drop constraint if exists leads_bant_valido;
alter table public.leads add constraint leads_bant_valido check (
  bant is null
  or (
        coalesce(bant->>'perfil','Comprador') in ('Comprador','Inquilino')
    and (
      case coalesce(bant->>'perfil','Comprador')
        when 'Inquilino' then bant->>'presupuesto' in
          ('solvente_aval','solvente_sin_aval','ingresos_dificiles','sin_solvencia')
        else bant->>'presupuesto' in
          ('aprobado','tramite','depende_venta','sin_definir')
      end
    )
    and bant->>'autoridad' in ('decide','filtro','sin_poder')
    and bant->>'necesidad' in ('clara','flexible','explorando')
    and bant->>'plazo'     in ('inmediato','corto','medio','largo')
    and coalesce(bant->>'calificadoPor','') <> ''
    and coalesce(bant->>'calificadoEl','')  <> ''
  )
);

-- ------------------------------------------------------------
-- 3. El puntaje lo calcula la base, no la app
-- ------------------------------------------------------------
-- OJO: estos puntos deben coincidir con los catálogos de src/types.ts
-- (BANT_PRESUPUESTO, BANT_AUTORIDAD, BANT_NECESIDAD, BANT_PLAZO).
-- Si algún día cambias un peso, cámbialo en los dos lados.
alter table public.leads drop column if exists puntaje_bant;
alter table public.leads add column puntaje_bant integer generated always as (
  case when bant is null then null else
      case bant->>'presupuesto'
        when 'aprobado'           then 30
        when 'solvente_aval'      then 30
        when 'tramite'            then 15
        when 'solvente_sin_aval'  then 15
        when 'depende_venta'      then 5
        when 'ingresos_dificiles' then 5
        else 0 end
    + case bant->>'autoridad'
        when 'decide'   then 20
        when 'filtro'   then 10
        else 0 end
    + case bant->>'necesidad'
        when 'clara'      then 30
        when 'flexible'   then 15
        when 'explorando' then 5
        else 0 end
    + case bant->>'plazo'
        when 'inmediato' then 20
        when 'corto'     then 15
        when 'medio'     then 5
        else 0 end
  end
) stored;

alter table public.leads drop column if exists clasificacion_lead;
alter table public.leads add column clasificacion_lead text generated always as (
  case
    when bant is null then null
    when (
        case bant->>'presupuesto'
          when 'aprobado' then 30 when 'solvente_aval' then 30
          when 'tramite' then 15 when 'solvente_sin_aval' then 15
          when 'depende_venta' then 5 when 'ingresos_dificiles' then 5 else 0 end
      + case bant->>'autoridad'   when 'decide' then 20 when 'filtro' then 10 else 0 end
      + case bant->>'necesidad'   when 'clara' then 30 when 'flexible' then 15 when 'explorando' then 5 else 0 end
      + case bant->>'plazo'       when 'inmediato' then 20 when 'corto' then 15 when 'medio' then 5 else 0 end
    ) >= 80 then 'Hot'
    when (
        case bant->>'presupuesto'
          when 'aprobado' then 30 when 'solvente_aval' then 30
          when 'tramite' then 15 when 'solvente_sin_aval' then 15
          when 'depende_venta' then 5 when 'ingresos_dificiles' then 5 else 0 end
      + case bant->>'autoridad'   when 'decide' then 20 when 'filtro' then 10 else 0 end
      + case bant->>'necesidad'   when 'clara' then 30 when 'flexible' then 15 when 'explorando' then 5 else 0 end
      + case bant->>'plazo'       when 'inmediato' then 20 when 'corto' then 15 when 'medio' then 5 else 0 end
    ) >= 50 then 'Warm'
    else 'Cold'
  end
) stored;

-- ------------------------------------------------------------
-- 4. No se avanza en el embudo sin calificar
-- ------------------------------------------------------------
-- Se implementa como TRIGGER y no como CHECK a propósito:
--
--   Un CHECK se evalúa en CADA escritura. Eso rompería cualquier update de
--   un prospecto histórico que ya está en Negociación sin calificar —
--   incluso si solo le estás agregando una nota. El asesor quedaría
--   atrapado sin poder tocar el registro.
--
--   El trigger solo se dispara cuando la etapa REALMENTE cambia hacia una
--   etapa exigente. Los registros viejos siguen editables; lo que se
--   bloquea es avanzar en el embudo a ciegas, que es la conducta que
--   queremos corregir.
create or replace function public.exigir_bant_para_avanzar()
returns trigger
language plpgsql
as $$
begin
  if new.etapa is distinct from old.etapa
     and new.etapa in ('Visitado','Negociacion','Cierre')
     and new.bant is null then
    raise exception 'No se puede mover el prospecto a "%" sin calificarlo primero. Responde las 4 preguntas de calificación en la sección Clientes.', new.etapa;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_exigir_bant on public.leads;
create trigger leads_exigir_bant
  before update on public.leads
  for each row execute function public.exigir_bant_para_avanzar();

-- ------------------------------------------------------------
-- 5. Bitácora: el historial solo crece, no se reescribe
-- ------------------------------------------------------------
-- Un asesor no debería poder "limpiar" el historial de un prospecto para
-- ocultar que lo dejó frío tres semanas. El trigger rechaza cualquier
-- update que reduzca el número de eventos.
create or replace function public.historial_solo_crece()
returns trigger
language plpgsql
as $$
begin
  if jsonb_array_length(coalesce(new.historial, '[]'::jsonb))
     < jsonb_array_length(coalesce(old.historial, '[]'::jsonb)) then
    raise exception 'El historial de un prospecto no se puede borrar ni reducir (tenía % eventos, se intentó dejar en %).',
      jsonb_array_length(old.historial), jsonb_array_length(coalesce(new.historial, '[]'::jsonb));
  end if;
  return new;
end;
$$;

drop trigger if exists leads_historial_solo_crece on public.leads;
create trigger leads_historial_solo_crece
  before update on public.leads
  for each row execute function public.historial_solo_crece();

-- ------------------------------------------------------------
-- 6. Índices para la vista de Clientes
-- ------------------------------------------------------------
create index if not exists leads_clasificacion_idx on public.leads (clasificacion_lead);
create index if not exists leads_puntaje_idx on public.leads (puntaje_bant desc nulls last);
create index if not exists leads_asesor_idx on public.leads (asesor_id);

-- ------------------------------------------------------------
-- 7. Comprobación rápida
-- ------------------------------------------------------------
-- Descomenta y corre para ver cómo quedó tu cartera:
--
-- select clasificacion_lead, count(*), round(avg(puntaje_bant)) as promedio
-- from public.leads
-- group by clasificacion_lead
-- order by 1;
