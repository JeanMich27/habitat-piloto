-- Versionado simple para impedir "última escritura gana" silenciosa.
begin;

alter table public.propiedades add column if not exists version integer not null default 1 check (version > 0);
alter table public.leads add column if not exists version integer not null default 1 check (version > 0);
alter table public.citas add column if not exists version integer not null default 1 check (version > 0);

create or replace function public.incrementar_version_registro()
returns trigger language plpgsql set search_path = public as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists propiedades_incrementar_version on public.propiedades;
create trigger propiedades_incrementar_version before update on public.propiedades
for each row execute function public.incrementar_version_registro();
drop trigger if exists leads_incrementar_version on public.leads;
create trigger leads_incrementar_version before update on public.leads
for each row execute function public.incrementar_version_registro();
drop trigger if exists citas_incrementar_version on public.citas;
create trigger citas_incrementar_version before update on public.citas
for each row execute function public.incrementar_version_registro();

revoke execute on function public.incrementar_version_registro() from public, anon, authenticated;

commit;
