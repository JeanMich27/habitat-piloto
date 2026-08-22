-- =============================================================================
-- MIGRACIÓN 01 — Modelo de datos multi-tenant
-- Proyecto: habitat-piloto (zhtwvxarovfohhmrgqoy)
-- Objetivo: pasar de "una agencia" a "N oficinas en una sola base, aisladas".
--
-- ORDEN DE EJECUCIÓN:
--   1. 01-multitenant-modelo-datos.sql   <-- este archivo (estructura)
--   2. 02-multitenant-rls.sql            (funciones + políticas)
--   3. 03-verificacion-aislamiento.sql   (prueba: debe pasar antes de vender)
--
-- ANTES DE EJECUTAR: respaldo de la base. Esta migración altera PKs y
-- agrega NOT NULL sobre tablas con datos.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tabla de agencias (tenants)
-- -----------------------------------------------------------------------------
-- Nota de diseño: se conserva `id text` en lugar de uuid a propósito.
-- La fila existente tiene id='default' y el frontend consulta ese literal en
-- varios lugares. Cambiarlo ahora rompe la app sin ganar nada: un slug de texto
-- es legible en logs y estable. Las oficinas nuevas usarán slugs ('remax-plus').
-- Deuda técnica aceptada: 'default' realmente significa Hábitat.

do $$ begin
  if to_regclass('public.agencias') is null and to_regclass('public.agencia') is not null then
    alter table public.agencia rename to agencias;
  end if;
end $$;

alter table public.agencias
  add column if not exists slug              text,
  add column if not exists estado            text not null default 'activa',
  add column if not exists plan              text not null default 'piloto',
  add column if not exists codigo_invitacion text,
  add column if not exists creado            timestamptz not null default now();

update public.agencias
   set slug = coalesce(slug, id),
       codigo_invitacion = coalesce(codigo_invitacion, 'INV-' || upper(substr(md5(id || random()::text), 1, 8)));

alter table public.agencias
  alter column slug set not null,
  alter column codigo_invitacion set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agencias_estado_chk') then
    alter table public.agencias add constraint agencias_estado_chk check (estado in ('activa','suspendida','prueba'));
  end if;
end $$;

create unique index if not exists agencias_slug_key  on public.agencias (slug);
create unique index if not exists agencias_codinv_key on public.agencias (codigo_invitacion);

comment on table  public.agencias is 'Tenants. Una fila por oficina inmobiliaria cliente.';
comment on column public.agencias.estado is 'suspendida = deja de poder entrar sin borrar datos (impago, fin de contrato).';


-- -----------------------------------------------------------------------------
-- 2. Columna agencia_id en todas las tablas de negocio
-- -----------------------------------------------------------------------------
-- Se agrega con default 'default' para poblar las filas existentes,
-- y luego se quita el default: toda inserción futura debe declarar su agencia.

alter table public.usuarios      add column if not exists agencia_id text not null default 'default';
alter table public.propiedades   add column if not exists agencia_id text not null default 'default';
alter table public.leads         add column if not exists agencia_id text not null default 'default';
alter table public.configuracion add column if not exists agencia_id text not null default 'default';
alter table public.sync_estado   add column if not exists agencia_id text not null default 'default';
alter table public.ingesta_log   add column if not exists agencia_id text not null default 'default';

alter table public.usuarios      alter column agencia_id drop default;
alter table public.propiedades   alter column agencia_id drop default;
alter table public.leads         alter column agencia_id drop default;
alter table public.configuracion alter column agencia_id drop default;
alter table public.sync_estado   alter column agencia_id drop default;
alter table public.ingesta_log   alter column agencia_id drop default;

do $$
declare
  tabla text;
  accion text;
begin
  foreach tabla in array array['usuarios','propiedades','leads','configuracion','sync_estado','ingesta_log'] loop
    accion := case when tabla in ('usuarios','propiedades','leads') then 'restrict' else 'cascade' end;
    if not exists (select 1 from pg_constraint where conname = tabla || '_agencia_fk') then
      execute format(
        'alter table public.%I add constraint %I foreign key (agencia_id) references public.agencias(id) on delete %s',
        tabla, tabla || '_agencia_fk', accion);
    end if;
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- 3. Unicidad y llaves compuestas por agencia
-- -----------------------------------------------------------------------------
-- Sin esto, dos oficinas no pueden tener el mismo correo, el mismo proceso de
-- sync ni la misma propiedad de EasyBroker. Y peor: un asesor podría escribir
-- sobre la fila de otra oficina por colisión de id.

-- Un correo puede repetirse entre oficinas, pero no dentro de la misma.
create unique index if not exists usuarios_agencia_correo_key
  on public.usuarios (agencia_id, lower(correo));

-- El mismo inmueble de EasyBroker en dos oficinas es válido (co-comercialización).
create unique index if not exists propiedades_agencia_eb_key
  on public.propiedades (agencia_id, eb_public_id)
  where eb_public_id is not null;

-- sync_estado: el proceso 'leads-easybroker' corre por oficina, no globalmente.
do $$
begin
  if exists (
    select 1 from pg_constraint c join pg_class r on r.oid = c.conrelid
     where c.conname = 'sync_estado_pkey' and c.contype = 'p'
       and array_length(c.conkey, 1) = 1
  ) then
    alter table public.sync_estado drop constraint sync_estado_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sync_estado_pkey' and contype = 'p') then
    alter table public.sync_estado add primary key (agencia_id, proceso);
  end if;
end $$;

-- configuracion: una fila por agencia.
create unique index if not exists configuracion_agencia_key
  on public.configuracion (agencia_id);


-- -----------------------------------------------------------------------------
-- 4. Integridad referencial dentro de la misma agencia
-- -----------------------------------------------------------------------------
-- Las FK actuales (leads.asesor_id -> usuarios.id) NO impiden que un lead de la
-- oficina A quede asignado a un asesor de la oficina B. Se blinda con trigger.

create or replace function public.validar_coherencia_agencia()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ag_asesor    text;
  ag_propiedad text;
begin
  if new.asesor_id is not null then
    select agencia_id into ag_asesor from public.usuarios where id = new.asesor_id;
    if ag_asesor is distinct from new.agencia_id then
      raise exception 'El asesor % no pertenece a la agencia %', new.asesor_id, new.agencia_id;
    end if;
  end if;

  -- IF anidado a propósito: plpgsql compila la expresión completa aunque el
  -- primer operando sea falso, y `propiedades` no tiene interes_propiedad_id.
  if tg_table_name = 'leads' then
    if new.interes_propiedad_id is not null then
      select agencia_id into ag_propiedad from public.propiedades where id = new.interes_propiedad_id;
      if ag_propiedad is distinct from new.agencia_id then
        raise exception 'La propiedad % no pertenece a la agencia %', new.interes_propiedad_id, new.agencia_id;
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists leads_coherencia_agencia on public.leads;
create trigger leads_coherencia_agencia
  before insert or update on public.leads
  for each row execute function public.validar_coherencia_agencia();

drop trigger if exists propiedades_coherencia_agencia on public.propiedades;
create trigger propiedades_coherencia_agencia
  before insert or update on public.propiedades
  for each row execute function public.validar_coherencia_agencia();


-- -----------------------------------------------------------------------------
-- 5. Índices para RLS
-- -----------------------------------------------------------------------------
-- Toda política filtra primero por agencia_id. Sin índice, cada consulta hace
-- seq scan (ingesta_log ya tiene 77k filas y crece por corrida).

create index if not exists usuarios_agencia_idx      on public.usuarios (agencia_id);
create index if not exists propiedades_agencia_idx   on public.propiedades (agencia_id, asesor_id);
create index if not exists leads_agencia_idx         on public.leads (agencia_id, asesor_id);
create index if not exists leads_agencia_etapa_idx   on public.leads (agencia_id, etapa);
create index if not exists leads_agencia_tel_idx     on public.leads (agencia_id, telefono_norm);
create index if not exists ingesta_log_agencia_idx   on public.ingesta_log (agencia_id, corrida_en desc);


-- -----------------------------------------------------------------------------
-- 6. Credenciales por oficina (EasyBroker, WhatsApp, etc.)
-- -----------------------------------------------------------------------------
-- Regla dura: ninguna llave de API se guarda en texto plano ni es legible desde
-- el navegador. Se cifra en Supabase Vault; solo service_role (Edge Functions)
-- puede descifrarla. Esta tabla NO tendrá políticas para `authenticated`:
-- sin política = sin acceso.

create table if not exists public.agencia_integraciones (
  agencia_id   text        not null references public.agencias(id) on delete cascade,
  proveedor    text        not null check (proveedor in ('easybroker','whatsapp','gemini','otro')),
  activo       boolean     not null default true,
  config       jsonb       not null default '{}'::jsonb,
  secreto_id   uuid,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now(),
  primary key (agencia_id, proveedor)
);

comment on column public.agencia_integraciones.config is
  'Datos NO sensibles: phone_number_id, waba_id, url de webhook. Nunca tokens.';
comment on column public.agencia_integraciones.secreto_id is
  'Apunta a vault.secrets. El valor solo se descifra desde service_role.';

alter table public.agencia_integraciones enable row level security;
revoke all on public.agencia_integraciones from anon, authenticated;

-- Guardar/rotar un secreto (solo service_role).
create or replace function public.guardar_secreto_integracion(
  p_agencia_id text,
  p_proveedor  text,
  p_secreto    text,
  p_config     jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public, vault as $$
declare
  v_id uuid;
begin
  select secreto_id into v_id
    from public.agencia_integraciones
   where agencia_id = p_agencia_id and proveedor = p_proveedor;

  if v_id is null then
    v_id := vault.create_secret(p_secreto, p_agencia_id || ':' || p_proveedor, 'Credencial de integración');
  else
    perform vault.update_secret(v_id, p_secreto);
  end if;

  insert into public.agencia_integraciones (agencia_id, proveedor, secreto_id, config)
  values (p_agencia_id, p_proveedor, v_id, p_config)
  on conflict (agencia_id, proveedor)
  do update set secreto_id = excluded.secreto_id,
                config     = excluded.config,
                actualizado = now();
end $$;

-- Leer un secreto descifrado (solo service_role).
create or replace function public.leer_secreto_integracion(
  p_agencia_id text,
  p_proveedor  text
) returns text language sql security definer set search_path = public, vault as $$
  select s.decrypted_secret
    from public.agencia_integraciones i
    join vault.decrypted_secrets s on s.id = i.secreto_id
   where i.agencia_id = p_agencia_id
     and i.proveedor  = p_proveedor
     and i.activo;
$$;

revoke all on function public.guardar_secreto_integracion(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.leer_secreto_integracion(text,text)               from public, anon, authenticated;
grant execute on function public.guardar_secreto_integracion(text,text,text,jsonb) to service_role;
grant execute on function public.leer_secreto_integracion(text,text)               to service_role;


-- -----------------------------------------------------------------------------
-- 7. Conversaciones de WhatsApp (multi-tenant desde el día 1)
-- -----------------------------------------------------------------------------
-- El webhook llega con un phone_number_id; ese es el único dato confiable para
-- resolver a qué oficina pertenece el mensaje. Nunca inferirlo del contenido.

create table if not exists public.wa_conversaciones (
  id                serial      primary key,
  agencia_id        text        not null references public.agencias(id) on delete cascade,
  telefono_norm     text        not null,
  lead_id           text        references public.leads(id) on delete set null,
  estado            text        not null default 'bot' check (estado in ('bot','humano','cerrada')),
  ventana_expira_en timestamptz,
  creado            timestamptz not null default now(),
  actualizado       timestamptz not null default now(),
  unique (agencia_id, telefono_norm)
);

create table if not exists public.wa_mensajes (
  id           bigserial   primary key,
  agencia_id   text        not null references public.agencias(id) on delete cascade,
  conversacion_id integer  not null references public.wa_conversaciones(id) on delete cascade,
  direccion    text        not null check (direccion in ('entrante','saliente')),
  wa_message_id text,
  cuerpo       text        not null default '',
  autor        text        not null default 'usuario' check (autor in ('usuario','bot','asesor')),
  recibido_en  timestamptz not null default now()
);

create index if not exists wa_mensajes_conv_idx on public.wa_mensajes (agencia_id, conversacion_id, recibido_en desc);
create unique index if not exists wa_mensajes_wamid_key on public.wa_mensajes (wa_message_id) where wa_message_id is not null;

comment on column public.wa_conversaciones.estado is
  'bot = el agente responde. humano = handoff, el bot calla. Regla: intención de compra o precio => humano.';
comment on column public.wa_conversaciones.ventana_expira_en is
  'Fin de la ventana de servicio de 24 h. Fuera de ella solo se puede enviar plantilla (con costo).';

alter table public.wa_conversaciones enable row level security;
alter table public.wa_mensajes       enable row level security;
revoke all on public.wa_conversaciones, public.wa_mensajes from anon;

-- Resolver la agencia a partir del número de WhatsApp que recibió el mensaje.
create or replace function public.agencia_por_phone_number_id(p_phone_number_id text)
returns text language sql stable security definer set search_path = public as $$
  select agencia_id
    from public.agencia_integraciones
   where proveedor = 'whatsapp'
     and activo
     and config ->> 'phone_number_id' = p_phone_number_id
   limit 1;
$$;


-- -----------------------------------------------------------------------------
-- 8. Administración de plataforma
-- -----------------------------------------------------------------------------
-- Decisión de seguridad: NO existe un rol que cruce oficinas vía RLS.
-- El soporte se hace con service_role desde un panel del servidor, nunca desde
-- una sesión de navegador. Así la respuesta al broker es verificable:
-- "ninguna sesión de la app puede ver otra oficina, incluida la mía."
-- Esta tabla solo sirve para que ese panel valide quién puede entrar.

create table if not exists public.admin_plataforma (
  auth_id uuid        primary key,
  nombre  text        not null,
  creado  timestamptz not null default now()
);

alter table public.admin_plataforma enable row level security;
revoke all on public.admin_plataforma from anon, authenticated;

-- Bitácora de accesos cruzados. Todo lo que el panel de soporte haga queda aquí.
create table if not exists public.auditoria_admin (
  id          bigserial   primary key,
  auth_id     uuid        not null,
  agencia_id  text        not null,
  accion      text        not null,
  detalle     jsonb       not null default '{}'::jsonb,
  ocurrido_en timestamptz not null default now()
);

alter table public.auditoria_admin enable row level security;
revoke all on public.auditoria_admin from anon, authenticated;

commit;
