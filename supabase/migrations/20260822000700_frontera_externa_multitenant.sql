-- Identidad externa explícita: tenant + proveedor + id de solicitud.
begin;

alter table public.leads add column if not exists proveedor_externo text;

update public.leads
   set proveedor_externo = 'easybroker'
 where proveedor_externo is null
   and (eb_contact_request_id is not null or eb_contact_id is not null);

alter table public.leads
  add constraint leads_proveedor_externo_valido
  check (proveedor_externo is null or proveedor_externo ~ '^[a-z0-9_-]{1,40}$') not valid;
alter table public.leads validate constraint leads_proveedor_externo_valido;

create unique index if not exists leads_agencia_proveedor_solicitud_key
  on public.leads (agencia_id, proveedor_externo, eb_contact_request_id)
  where proveedor_externo is not null and eb_contact_request_id is not null;

comment on column public.leads.proveedor_externo is
  'Proveedor del identificador externo; se interpreta siempre junto con agencia_id.';

commit;
