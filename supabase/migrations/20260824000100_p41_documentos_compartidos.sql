-- P4.1: documentos generados, enlaces temporales, auditoría y Storage privado.
-- Los archivos se escriben y leen únicamente desde Edge Functions autorizadas;
-- ninguna ruta de Storage ni token público se persiste o entrega al frontend.

begin;

create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id) on delete cascade,
  created_by text not null references public.usuarios(id),
  document_type text not null check (document_type in ('property_sheet', 'comparative_report')),
  resource_type text not null check (resource_type in ('property')),
  resource_id text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  file_size bigint not null check (file_size > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz,
  constraint generated_documents_expiration check (expires_at is null or expires_at > created_at)
);

-- Llaves compuestas aseguran que creador, propiedad, documento y enlace
-- pertenecen al mismo tenant incluso en escrituras privilegiadas.
alter table public.usuarios add constraint usuarios_id_agencia_documents_key unique (id, agencia_id);
alter table public.propiedades add constraint propiedades_id_agencia_documents_key unique (id, agencia_id);
alter table public.generated_documents
  add constraint generated_documents_creator_agency_fk foreign key (created_by, agencia_id)
    references public.usuarios(id, agencia_id),
  add constraint generated_documents_property_agency_fk foreign key (resource_id, agencia_id)
    references public.propiedades(id, agencia_id),
  add constraint generated_documents_identity_agency_resource_key unique (id, agencia_id, resource_type, resource_id);

create index generated_documents_resource_idx
  on public.generated_documents (agencia_id, resource_type, resource_id, document_type, created_at desc)
  where deleted_at is null;

create or replace function public.touch_generated_document_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger generated_documents_updated_at
  before update on public.generated_documents
  for each row execute function public.touch_generated_document_updated_at();
revoke execute on function public.touch_generated_document_updated_at() from public, anon, authenticated;

create table public.shared_links (
  id uuid primary key default gen_random_uuid(),
  agencia_id text not null references public.agencias(id) on delete cascade,
  created_by text not null references public.usuarios(id),
  resource_type text not null check (resource_type in ('property')),
  resource_id text not null,
  document_id uuid not null references public.generated_documents(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  access_count bigint not null default 0 check (access_count >= 0),
  constraint shared_links_expiration check (expires_at > created_at),
  constraint shared_links_creator_agency_fk foreign key (created_by, agencia_id)
    references public.usuarios(id, agencia_id),
  constraint shared_links_document_agency_resource_fk foreign key (document_id, agencia_id, resource_type, resource_id)
    references public.generated_documents(id, agencia_id, resource_type, resource_id)
);

create index shared_links_document_idx
  on public.shared_links (agencia_id, document_id, created_at desc);
create index shared_links_active_idx
  on public.shared_links (token_hash, expires_at)
  where revoked_at is null;

create table public.document_audit_events (
  id bigint generated always as identity primary key,
  agencia_id text not null references public.agencias(id) on delete cascade,
  actor_id text references public.usuarios(id) on delete set null,
  event_type text not null check (event_type in (
    'document_created', 'document_downloaded', 'share_link_created',
    'share_link_accessed', 'share_link_revoked', 'share_link_expired'
  )),
  document_id uuid references public.generated_documents(id) on delete set null,
  shared_link_id uuid references public.shared_links(id) on delete set null,
  correlation_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index document_audit_events_agency_idx
  on public.document_audit_events (agencia_id, created_at desc);

alter table public.generated_documents enable row level security;
alter table public.shared_links enable row level security;
alter table public.document_audit_events enable row level security;

-- Solo los roles operativos pueden administrar documentos. La propiedad debe
-- ser visible para la sesión conforme a su asignación/permisos actuales.
create policy generated_documents_select on public.generated_documents
for select to authenticated using (
  agencia_id = (select public.mi_agencia_id())
  and (select public.soy_asesor())
  and deleted_at is null
  and resource_type = 'property'
  and exists (
    select 1 from public.propiedades p
    where p.id = generated_documents.resource_id
      and p.agencia_id = generated_documents.agencia_id
  )
);

create policy shared_links_select on public.shared_links
for select to authenticated using (
  agencia_id = (select public.mi_agencia_id())
  and (select public.soy_asesor())
  and resource_type = 'property'
  and exists (
    select 1 from public.propiedades p
    where p.id = shared_links.resource_id
      and p.agencia_id = shared_links.agencia_id
  )
);

create policy document_audit_events_select on public.document_audit_events
for select to authenticated using (
  agencia_id = (select public.mi_agencia_id()) and (select public.es_broker())
);

-- El bucket se crea de forma reproducible y permanece privado. Las Edge
-- Functions usan service_role; no se concede acceso directo a storage.objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-documents', 'generated-documents', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Revocación estrecha: no permite renovar, cambiar recurso, documento, tenant
-- ni creador. Un nuevo vencimiento se obtiene creando un enlace nuevo.
create or replace function public.revoke_shared_link(p_link_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.shared_links%rowtype;
begin
  update public.shared_links
     set revoked_at = coalesce(revoked_at, now())
   where id = p_link_id
     and agencia_id = public.mi_agencia_id()
     and (created_by = public.mi_usuario_id() or public.es_broker())
     and revoked_at is null
  returning * into v_link;

  if not found then return false; end if;

  insert into public.document_audit_events
    (agencia_id, actor_id, event_type, document_id, shared_link_id)
  values
    (v_link.agencia_id, public.mi_usuario_id(), 'share_link_revoked', v_link.document_id, v_link.id);
  return true;
end;
$$;

revoke all on function public.revoke_shared_link(uuid) from public, anon;
grant execute on function public.revoke_shared_link(uuid) to authenticated;

create or replace function public.record_shared_link_access(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.shared_links%rowtype;
begin
  update public.shared_links
     set last_accessed_at = now(), access_count = access_count + 1
   where id = p_link_id and revoked_at is null and expires_at > now()
  returning * into v_link;
  if not found then return; end if;
  insert into public.document_audit_events
    (agencia_id, event_type, document_id, shared_link_id)
  values (v_link.agencia_id, 'share_link_accessed', v_link.document_id, v_link.id);
end;
$$;

revoke all on function public.record_shared_link_access(uuid) from public, anon, authenticated;
grant execute on function public.record_shared_link_access(uuid) to service_role;

-- Escrituras sensibles solo vía Edge Functions (service_role). Los grants de
-- tabla no sustituyen RLS, pero se restringen también como defensa adicional.
revoke all on public.generated_documents, public.shared_links, public.document_audit_events from anon;
grant select (id, agencia_id, created_by, document_type, resource_type, resource_id,
  mime_type, file_size, metadata, created_at, updated_at, expires_at, deleted_at)
  on public.generated_documents to authenticated;
grant select (id, agencia_id, created_by, resource_type, resource_id, document_id,
  expires_at, revoked_at, created_at, last_accessed_at, access_count)
  on public.shared_links to authenticated;
grant select on public.document_audit_events to authenticated;

commit;
