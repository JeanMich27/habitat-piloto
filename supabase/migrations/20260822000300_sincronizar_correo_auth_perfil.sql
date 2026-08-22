-- Sincroniza el correo canónico de Supabase Auth con el perfil público.
-- Auth solo cambia auth.users.email después del flujo de confirmación; por eso
-- el perfil y las relaciones legacy por correo nunca se adelantan a Auth.
begin;

create or replace function public.sincronizar_correo_auth_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or new.email is not distinct from old.email then
    return new;
  end if;

  update public.usuarios
     set correo = lower(trim(new.email))
   where auth_id = new.id;
  return new;
end;
$$;

drop trigger if exists sincronizar_correo_perfil on auth.users;
create trigger sincronizar_correo_perfil
  after update of email on auth.users
  for each row execute function public.sincronizar_correo_auth_perfil();

revoke execute on function public.sincronizar_correo_auth_perfil() from public, anon, authenticated;

comment on function public.sincronizar_correo_auth_perfil() is
  'Mantiene public.usuarios.correo alineado con Auth únicamente tras el cambio confirmado.';

commit;
