-- =============================================================================
-- Estado y operaciones originales del CRM por propiedad
-- =============================================================================

begin;

alter table public.propiedades
  add column if not exists crm_estatus text,
  add column if not exists crm_estatus_en timestamptz,
  add column if not exists crm_operaciones jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'propiedades_crm_operaciones_arreglo'
  ) then
    alter table public.propiedades
      add constraint propiedades_crm_operaciones_arreglo
      check (jsonb_typeof(crm_operaciones) = 'array');
  end if;
end $$;

comment on column public.propiedades.crm_estatus is
  'Estado literal que entregó el CRM. Se conserva para conciliación y no se traduce en el mapper.';
comment on column public.propiedades.crm_estatus_en is
  'Momento en que el sincronizador observó crm_estatus por última vez.';
comment on column public.propiedades.crm_operaciones is
  'Arreglo completo de modalidades y precios entregado por el CRM; tipo_operacion/precio conservan la modalidad principal compatible.';

create index if not exists propiedades_crm_estatus_idx
  on public.propiedades (agencia_id, crm_origen, crm_estatus);

commit;
