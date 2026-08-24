-- BANT parcial se conserva, pero nunca obtiene puntaje/clase ni habilita avance.
begin;

create or replace function public.bant_completo(p_bant jsonb)
returns boolean language sql immutable parallel safe as $$
  select p_bant is not null
     and coalesce(p_bant->>'presupuesto', '') <> ''
     and coalesce(p_bant->>'autoridad', '') <> ''
     and coalesce(p_bant->>'necesidad', '') <> ''
     and coalesce(p_bant->>'plazo', '') <> '';
$$;

alter table public.leads drop constraint if exists leads_bant_valido;
alter table public.leads add constraint leads_bant_valido check (
  bant is null or (
    coalesce(bant->>'perfil', 'Comprador') in ('Comprador', 'Inquilino')
    and (
      coalesce(bant->>'presupuesto', '') = '' or
      case coalesce(bant->>'perfil', 'Comprador')
        when 'Inquilino' then bant->>'presupuesto' in ('solvente_aval','solvente_sin_aval','ingresos_dificiles','sin_solvencia')
        else bant->>'presupuesto' in ('aprobado','tramite','depende_venta','sin_definir')
      end
    )
    and (coalesce(bant->>'autoridad','') = '' or bant->>'autoridad' in ('decide','filtro','sin_poder'))
    and (coalesce(bant->>'necesidad','') = '' or bant->>'necesidad' in ('clara','flexible','explorando'))
    and (coalesce(bant->>'plazo','') = '' or bant->>'plazo' in ('inmediato','corto','medio','largo'))
    and coalesce(bant->>'calificadoPor','') <> ''
    and coalesce(bant->>'calificadoEl','') <> ''
  )
);

alter table public.leads drop column if exists clasificacion_lead;
alter table public.leads drop column if exists puntaje_bant;
alter table public.leads add column puntaje_bant integer generated always as (
  case when not public.bant_completo(bant) then null else
      case bant->>'presupuesto'
        when 'aprobado' then 30 when 'solvente_aval' then 30
        when 'tramite' then 15 when 'solvente_sin_aval' then 15
        when 'depende_venta' then 5 when 'ingresos_dificiles' then 5 else 0 end
    + case bant->>'autoridad' when 'decide' then 20 when 'filtro' then 10 else 0 end
    + case bant->>'necesidad' when 'clara' then 30 when 'flexible' then 15 when 'explorando' then 5 else 0 end
    + case bant->>'plazo' when 'inmediato' then 20 when 'corto' then 15 when 'medio' then 5 else 0 end
  end
) stored;

alter table public.leads add column clasificacion_lead text generated always as (
  case
    when not public.bant_completo(bant) then null
    when (
      case bant->>'presupuesto' when 'aprobado' then 30 when 'solvente_aval' then 30 when 'tramite' then 15 when 'solvente_sin_aval' then 15 when 'depende_venta' then 5 when 'ingresos_dificiles' then 5 else 0 end
      + case bant->>'autoridad' when 'decide' then 20 when 'filtro' then 10 else 0 end
      + case bant->>'necesidad' when 'clara' then 30 when 'flexible' then 15 when 'explorando' then 5 else 0 end
      + case bant->>'plazo' when 'inmediato' then 20 when 'corto' then 15 when 'medio' then 5 else 0 end
    ) >= 80 then 'Hot'
    when (
      case bant->>'presupuesto' when 'aprobado' then 30 when 'solvente_aval' then 30 when 'tramite' then 15 when 'solvente_sin_aval' then 15 when 'depende_venta' then 5 when 'ingresos_dificiles' then 5 else 0 end
      + case bant->>'autoridad' when 'decide' then 20 when 'filtro' then 10 else 0 end
      + case bant->>'necesidad' when 'clara' then 30 when 'flexible' then 15 when 'explorando' then 5 else 0 end
      + case bant->>'plazo' when 'inmediato' then 20 when 'corto' then 15 when 'medio' then 5 else 0 end
    ) >= 50 then 'Warm'
    else 'Cold'
  end
) stored;

create or replace function public.exigir_bant_para_avanzar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.etapa in ('Visitado','Negociacion','Cierre')
     and not public.bant_completo(new.bant)
     and (tg_op = 'INSERT' or new.etapa is distinct from old.etapa or new.bant is distinct from old.bant) then
    raise exception 'No se puede mantener el prospecto en "%" sin las 4 respuestas de calificación.', new.etapa
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_exigir_bant on public.leads;
create trigger leads_exigir_bant before insert or update of etapa, bant on public.leads
for each row execute function public.exigir_bant_para_avanzar();

revoke execute on function public.bant_completo(jsonb) from public, anon;
grant execute on function public.bant_completo(jsonb) to authenticated;
-- service_role también la invoca (triggers/RPCs que corren bajo ese rol,
-- p.ej. crear_o_relacionar_lead vía process_integration_lead_command);
-- el revoke de arriba no la incluía y rompía con "permission denied".
grant execute on function public.bant_completo(jsonb) to service_role;
revoke execute on function public.exigir_bant_para_avanzar() from public, anon, authenticated;

create index if not exists leads_puntaje_idx on public.leads (puntaje_bant desc nulls last);

commit;
