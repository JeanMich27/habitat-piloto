-- =============================================================================
-- MIGRACIÓN 18 — Un correo, una oficina            [APLICADA 21 ago 2026]
--
-- `usuarios_agencia_correo_key` es único por (agencia_id, correo): el mismo
-- correo PODÍA estar dado de alta en dos oficinas distintas. Suena inofensivo
-- hasta que esa persona crea su cuenta: Supabase Auth da UNA cuenta por correo,
-- así que el trigger de alta encuentra dos filas candidatas y se queda con la
-- primera. Resultado: alguien entra a la oficina equivocada y ve la cartera de
-- un cliente que no es el suyo. Es el peor fallo posible en multi-tenant, y
-- ocurriría en silencio.
--
-- Se bloquea en el momento del alta, con un mensaje que NO revela en qué otra
-- oficina está ese correo: el broker que da de alta no tiene por qué enterarse
-- de la existencia de otra agencia ni de su cartera.
--
-- No se usa un índice único global porque el error de Postgres
-- ("duplicate key value violates unique constraint") no le dice nada a quien
-- está capturando un nombre y un correo en una pantalla.
--
-- Verificado en transacción revertida: oficina 2 no puede dar de alta un correo
-- de Hábitat; sí puede dar de alta los suyos; editar un usuario sin tocar su
-- correo no se ve afectado.
-- =============================================================================

create or replace function public.correo_unico_en_la_plataforma()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.correo is null or trim(new.correo) = '' then
    return new;
  end if;
  -- Si el correo no cambió, no hay nada que revisar: así una edición de nombre
  -- o de teléfono no paga el costo de la consulta ni puede fallar por esto.
  if tg_op = 'UPDATE' and lower(new.correo) = lower(old.correo) then
    return new;
  end if;

  if exists (
    select 1 from public.usuarios u
     where lower(u.correo) = lower(new.correo)
       and u.agencia_id is distinct from new.agencia_id
  ) then
    raise exception 'Ese correo ya está registrado en la plataforma en otra oficina. Usa el correo de trabajo de esa persona en tu inmobiliaria.';
  end if;

  return new;
end $$;

drop trigger if exists usuarios_correo_unico on public.usuarios;
create trigger usuarios_correo_unico
  before insert or update of correo, agencia_id on public.usuarios
  for each row execute function public.correo_unico_en_la_plataforma();

revoke execute on function public.correo_unico_en_la_plataforma() from public, anon, authenticated;
