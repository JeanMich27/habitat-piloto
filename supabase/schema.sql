-- Esquema para el piloto de Hábitat (CRM inmobiliario) con 10 personas.
-- Ejecutar completo en Supabase: Dashboard > SQL Editor > New query > Run.
--
-- Diseño deliberadamente simple para el MVP: los campos anidados de cada
-- registro (propietario, documentos, eventos, comparables, cierre,
-- notificaciones) se guardan como JSONB con las mismas llaves que usa el
-- frontend (camelCase), así no hace falta transformarlos campo por campo.
--
-- Seguridad: RLS con políticas abiertas (cualquiera con la anon key puede
-- leer/escribir). Es intencional para esta prueba interna de 10 personas de
-- confianza. ANTES de usarlo con datos reales de clientes o abrirlo al
-- público, hay que reemplazar estas políticas por reglas basadas en
-- autenticación (Supabase Auth) y roles.

create table if not exists public.agencia (
  id text primary key default 'default',
  nombre text not null,
  direccion text not null default '',
  logo_url text
);

create table if not exists public.configuracion (
  id text primary key default 'default',
  permiso_equipo_ver_todas boolean not null default false,
  notificaciones jsonb not null default '{}'::jsonb
);

create table if not exists public.usuarios (
  id text primary key,
  nombre text not null,
  correo text not null,
  telefono text not null default '',
  rol text not null,
  puesto text not null default '',
  iniciales text not null default '',
  estado_cuenta text not null default 'Activo',
  puede_ver_otras_propiedades boolean default false
);

create table if not exists public.propiedades (
  id text primary key,
  titulo text not null,
  ubicacion text not null default '',
  municipio text not null default '',
  estado text not null default '',
  precio numeric not null default 0,
  recamaras integer not null default 0,
  banos integer not null default 0,
  m2 numeric not null default 0,
  descripcion text not null default '',
  estatus text not null default 'Intake',
  tipo_inmueble text not null,
  tipo_operacion text not null,
  asesor_id text references public.usuarios(id) on delete set null,
  propietario jsonb not null default '{}'::jsonb,
  documentos jsonb not null default '[]'::jsonb,
  capturada_el timestamptz not null default now(),
  publicada_el timestamptz,
  ultima_actividad timestamptz,
  eventos jsonb not null default '[]'::jsonb,
  comparables jsonb not null default '[]'::jsonb
);

create table if not exists public.leads (
  id text primary key,
  nombre text not null,
  telefono text not null default '',
  etapa text not null default 'Nuevo',
  origen text not null default 'Directo',
  interes_propiedad_id text references public.propiedades(id) on delete set null,
  asesor_id text references public.usuarios(id) on delete set null,
  creado timestamptz not null default now(),
  nota text not null default '',
  primer_contacto_en timestamptz,
  monto_oferta numeric,
  cierre jsonb
);

-- Realtime: para que los 10 testers vean cambios de los demás sin recargar.
alter publication supabase_realtime add table public.propiedades;
alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.usuarios;
alter publication supabase_realtime add table public.agencia;
alter publication supabase_realtime add table public.configuracion;

-- RLS abierta (solo para el piloto interno, ver nota arriba).
alter table public.agencia enable row level security;
alter table public.configuracion enable row level security;
alter table public.usuarios enable row level security;
alter table public.propiedades enable row level security;
alter table public.leads enable row level security;

drop policy if exists "piloto_todo_acceso" on public.agencia;
create policy "piloto_todo_acceso" on public.agencia for all using (true) with check (true);

drop policy if exists "piloto_todo_acceso" on public.configuracion;
create policy "piloto_todo_acceso" on public.configuracion for all using (true) with check (true);

drop policy if exists "piloto_todo_acceso" on public.usuarios;
create policy "piloto_todo_acceso" on public.usuarios for all using (true) with check (true);

drop policy if exists "piloto_todo_acceso" on public.propiedades;
create policy "piloto_todo_acceso" on public.propiedades for all using (true) with check (true);

drop policy if exists "piloto_todo_acceso" on public.leads;
create policy "piloto_todo_acceso" on public.leads for all using (true) with check (true);
