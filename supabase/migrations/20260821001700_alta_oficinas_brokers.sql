-- =============================================================================
-- MIGRACIÓN 17 — Alta de oficinas nuevas y rol de Broker en el registro
--                                                   [APLICADA 21 ago 2026]
--
-- Cierra el pendiente #8 de `estado-multitenant.md` ("flujo de alta de oficinas
-- nuevas, hoy solo por service_role").
--
-- CÓMO QUEDA EL REGISTRO. `manejar_nuevo_registro` tiene cuatro caminos, en
-- este orden:
--
--   (a) El correo YA existe en `usuarios` (lo dio de alta su broker, o lo creó
--       el sync desde el CRM). Se engancha a ESA oficina, con el rol que ya
--       traía, y pasa de "Invitado" a "Activo". El rol que haya pedido en el
--       formulario se ignora a propósito: la oficina ya decidió qué es esta
--       persona. Este camino va PRIMERO justamente para que nadie se ascienda
--       a sí mismo en el alta.
--
--   (b) Pide rol "broker" y trae un CÓDIGO DE ALTA de plataforma válido. Se le
--       crea su oficina con la ficha que capturó y él queda broker ACTIVO de
--       esa oficina (no hay a quién pedirle aprobación). El código se marca
--       usado dentro de la misma transacción.
--
--   (c) Trae el código de invitación de una oficina existente. Entra como
--       "Pendiente" en esa oficina; su broker lo aprueba. NUNCA como broker.
--
--   (d) Nada de lo anterior: se rechaza.
--
-- POR QUÉ CON CÓDIGO DE ALTA Y NO ABIERTO. La plataforma se vende agencia por
-- agencia. Un registro abierto no trae clientes mientras no haya prueba
-- gratuita ni cobro automático, y sí cuesta: cuota de la API del CRM, filas y
-- soporte de cuentas que nadie pidió. El código es la misma experiencia para
-- el broker y deja el control de a quién se le vende en la plataforma.
-- Abrirlo después es cambiar UN valor:
--   update plataforma_config set valor='abierta' where clave='alta_de_oficinas';
--
-- CÓMO SE GENERA UN CÓDIGO (desde el SQL editor de Supabase, con service_role):
--   select public.generar_codigo_alta('Inmobiliaria X - contrato 2026', 1, 90);
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La oficina guarda su ficha y de dónde sale su información
-- -----------------------------------------------------------------------------
alter table public.agencias
  add column if not exists telefono    text not null default '',
  add column if not exists correo      text not null default '',
  add column if not exists ciudad      text not null default '',
  add column if not exists sitio_web   text not null default '',
  -- 'ninguno' = la oficina usa esta plataforma COMO su CRM: captura a mano y
  -- nada le sobrescribe lo capturado. Otro valor = ese CRM manda y el sync trae.
  add column if not exists crm         text not null default 'ninguno',
  -- Cuántos administradores admite la oficina. Dos es lo sano: titular y socio
  -- o gerente. Se sube por oficina cuando un cliente grande lo pida.
  add column if not exists max_brokers integer not null default 2;

do $$ begin
  alter table public.agencias add constraint agencias_crm_valido
    check (crm in ('ninguno','easybroker'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.agencias add constraint agencias_max_brokers_valido
    check (max_brokers between 1 and 5);
exception when duplicate_object then null; end $$;

update public.agencias set crm = 'easybroker' where id = 'default';

-- -----------------------------------------------------------------------------
-- 2. Códigos de alta de plataforma
-- -----------------------------------------------------------------------------
create table if not exists public.codigos_alta (
  codigo         text primary key,
  descripcion    text not null default '',
  usos_max       integer not null default 1 check (usos_max between 1 and 100),
  usos           integer not null default 0,
  expira_en      timestamptz,
  creado         timestamptz not null default now(),
  ultima_agencia text
);

comment on table public.codigos_alta is
  'Códigos que habilitan crear una oficina nueva. Los genera la plataforma con generar_codigo_alta(); ningún rol de la app puede leerlos ni escribirlos.';

-- RLS activo y CERO políticas: ni anon ni authenticated tocan esta tabla. Solo
-- la llave de servicio y el trigger SECURITY DEFINER del alta.
alter table public.codigos_alta enable row level security;
revoke all on public.codigos_alta from anon, authenticated;

create or replace function public.generar_codigo_alta(
  p_descripcion   text default '',
  p_usos_max      integer default 1,
  p_dias_vigencia integer default 90
) returns text
language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  v_codigo := 'ALTA-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
  insert into public.codigos_alta (codigo, descripcion, usos_max, expira_en)
  values (v_codigo, coalesce(p_descripcion,''), greatest(1, p_usos_max),
          case when p_dias_vigencia is null then null
               else now() + make_interval(days => p_dias_vigencia) end);
  return v_codigo;
end $$;

revoke execute on function public.generar_codigo_alta(text,integer,integer) from public, anon, authenticated;
grant  execute on function public.generar_codigo_alta(text,integer,integer) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Interruptor de plataforma: con código o abierto
-- -----------------------------------------------------------------------------
create table if not exists public.plataforma_config (
  clave text primary key,
  valor text not null
);
alter table public.plataforma_config enable row level security;
revoke all on public.plataforma_config from anon, authenticated;

insert into public.plataforma_config (clave, valor)
values ('alta_de_oficinas', 'con_codigo')
on conflict (clave) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Slug de la oficina sin depender de la extensión `unaccent`
-- -----------------------------------------------------------------------------
create or replace function public.slug_de_texto(p_texto text)
returns text language sql immutable set search_path = public as $$
  select coalesce(
    nullif(
      trim(both '-' from
        regexp_replace(
          lower(translate(p_texto,
            'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
            'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')),
          '[^a-z0-9]+', '-', 'g')),
      ''),
    'oficina');
$$;

revoke execute on function public.slug_de_texto(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Tope de brokers por oficina
-- -----------------------------------------------------------------------------
create or replace function public.limitar_brokers_por_agencia()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_max    integer;
  v_actual integer;
begin
  if new.rol <> 'broker' then return new; end if;
  if tg_op = 'UPDATE' and old.rol = 'broker' then return new; end if;

  select max_brokers into v_max from public.agencias where id = new.agencia_id;
  if v_max is null then return new; end if;

  select count(*) into v_actual
    from public.usuarios
   where agencia_id = new.agencia_id
     and rol = 'broker'
     and id <> new.id;

  if v_actual >= v_max then
    raise exception 'La oficina ya tiene % broker(s), que es su máximo. Cambia el rol de uno antes de nombrar a otro.', v_max;
  end if;
  return new;
end $$;

drop trigger if exists usuarios_limitar_brokers on public.usuarios;
create trigger usuarios_limitar_brokers
  before insert or update of rol on public.usuarios
  for each row execute function public.limitar_brokers_por_agencia();

-- -----------------------------------------------------------------------------
-- 6. El alta de cuentas, con el camino nuevo del broker
--
-- OJO con los nombres de las variables: se prefijan con v_ porque `codigo`,
-- `usos` y `expira_en` son COLUMNAS de `codigos_alta`. Una variable llamada
-- `codigo` hace que PL/pgSQL aborte el registro entero con
-- "column reference codigo is ambiguous", y el error solo aparece cuando
-- alguien intenta registrarse — no al crear la función.
-- -----------------------------------------------------------------------------
create or replace function public.manejar_nuevo_registro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fila_existente  public.usuarios%rowtype;
  v_agencia_id    text;
  v_slug          text;
  v_modo_alta     text;
  v_hay_codigo    boolean;
  v_cod_oficina   text := nullif(trim(new.raw_user_meta_data ->> 'codigo_invitacion'), '');
  v_cod_alta      text := nullif(trim(upper(new.raw_user_meta_data ->> 'codigo_alta')), '');
  v_rol           text := coalesce(new.raw_user_meta_data ->> 'rol_solicitado', 'asesor_equipo');
  v_nombre        text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1));
  v_telefono      text := coalesce(new.raw_user_meta_data ->> 'telefono', '');
  ofi_nombre      text := nullif(trim(new.raw_user_meta_data ->> 'oficina_nombre'), '');
  ofi_telefono    text := coalesce(new.raw_user_meta_data ->> 'oficina_telefono', '');
  ofi_direccion   text := coalesce(new.raw_user_meta_data ->> 'oficina_direccion', '');
  ofi_ciudad      text := coalesce(new.raw_user_meta_data ->> 'oficina_ciudad', '');
  ofi_sitio       text := coalesce(new.raw_user_meta_data ->> 'oficina_sitio_web', '');
  ofi_crm         text := lower(coalesce(nullif(trim(new.raw_user_meta_data ->> 'oficina_crm'), ''), 'ninguno'));
begin
  if v_rol not in ('broker','asesor_equipo','asesor_independiente','propietario','cliente') then
    v_rol := 'asesor_equipo';
  end if;
  if ofi_crm not in ('ninguno','easybroker') then
    ofi_crm := 'ninguno';
  end if;

  -- ---- (a) El correo ya estaba dado de alta: manda su oficina ------------
  select * into fila_existente
    from public.usuarios
   where lower(correo) = lower(new.email)
   order by case when estado_cuenta = 'Invitado' then 0 else 1 end
   limit 1;

  if found then
    update public.usuarios
       set auth_id  = new.id,
           telefono = case when telefono = '' then v_telefono else telefono end,
           estado_cuenta = case when estado_cuenta = 'Invitado' then 'Activo' else estado_cuenta end
     where id = fila_existente.id;
    return new;
  end if;

  -- Pidió broker pero no viene a abrir oficina (ni ficha ni código de alta):
  -- se está uniendo a una oficina con el código de invitación y se equivocó de
  -- rol. Baja a asesor_equipo y sigue por (c). Responderle "hace falta el
  -- nombre de la inmobiliaria" no le dice nada a quien solo quería entrar.
  if v_rol = 'broker' and ofi_nombre is null and v_cod_alta is null then
    v_rol := 'asesor_equipo';
  end if;

  -- ---- (b) Broker que abre oficina nueva ---------------------------------
  if v_rol = 'broker' then
    if ofi_nombre is null then
      raise exception 'Para crear una oficina hace falta el nombre de la inmobiliaria.';
    end if;

    select valor into v_modo_alta from public.plataforma_config where clave = 'alta_de_oficinas';
    v_modo_alta := coalesce(v_modo_alta, 'con_codigo');

    if v_modo_alta <> 'abierta' then
      if v_cod_alta is null then
        raise exception 'Se requiere un código de alta para dar de alta una oficina nueva.';
      end if;

      -- `for update` sobre la fila del código: dos registros simultáneos con
      -- el mismo código de un solo uso no pueden crear dos oficinas.
      select true into v_hay_codigo
        from public.codigos_alta c
       where c.codigo = v_cod_alta
         and c.usos < c.usos_max
         and (c.expira_en is null or c.expira_en > now())
       for update;

      if not found then
        raise exception 'El código de alta no es válido, ya se usó o está vencido.';
      end if;
    end if;

    v_slug := public.slug_de_texto(ofi_nombre);
    if exists (select 1 from public.agencias a where a.slug = v_slug) then
      v_slug := v_slug || '-' || substr(md5(new.id::text), 1, 5);
    end if;

    v_agencia_id := 'ag-' || substr(md5(new.id::text || clock_timestamp()::text), 1, 10);

    insert into public.agencias (
      id, nombre, direccion, slug, estado, plan, codigo_invitacion,
      telefono, correo, ciudad, sitio_web, crm, max_brokers
    ) values (
      v_agencia_id, ofi_nombre, ofi_direccion, v_slug, 'activa', 'piloto',
      'INV-' || upper(substr(md5(v_agencia_id || random()::text), 1, 8)),
      ofi_telefono, lower(new.email), ofi_ciudad, ofi_sitio, ofi_crm, 2
    );

    insert into public.usuarios (
      id, agencia_id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta
    ) values (
      'user-' || substr(new.id::text, 1, 8),
      v_agencia_id, new.id, v_nombre, lower(new.email), v_telefono,
      'broker', 'Broker / Administrador',
      upper(left(split_part(v_nombre,' ',1),1) || left(split_part(v_nombre,' ',2),1)),
      'Activo'   -- quien abre la oficina no tiene a quién pedirle permiso
    );

    if v_modo_alta <> 'abierta' then
      update public.codigos_alta c
         set usos = c.usos + 1, ultima_agencia = v_agencia_id
       where c.codigo = v_cod_alta;
    end if;

    return new;
  end if;

  -- ---- (c) Se une a una oficina existente con su código -------------------
  -- Nunca como broker: a ese rol solo se llega creando la oficina (b) o
  -- porque un broker de esa oficina te dio de alta como tal (camino a).
  if v_cod_oficina is null then
    raise exception 'Se requiere un código de invitación de la oficina para crear la cuenta.';
  end if;

  select a.id into v_agencia_id
    from public.agencias a
   where a.codigo_invitacion = v_cod_oficina
     and a.estado <> 'suspendida';

  if v_agencia_id is null then
    raise exception 'Código de invitación inválido o inactivo.';
  end if;

  insert into public.usuarios (
    id, agencia_id, auth_id, nombre, correo, telefono, rol, puesto, iniciales, estado_cuenta
  ) values (
    'user-' || substr(new.id::text, 1, 8),
    v_agencia_id, new.id, v_nombre, lower(new.email), v_telefono, v_rol,
    case v_rol
      when 'propietario' then 'Propietario'
      when 'cliente'     then 'Cliente'
      else 'Asesor Inmobiliario'
    end,
    upper(left(split_part(v_nombre,' ',1),1) || left(split_part(v_nombre,' ',2),1)),
    'Pendiente'
  );

  return new;
end $$;

-- El trigger ya existe desde la migración 02; se deja explícito por si esta
-- migración corre sobre una base recién levantada.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.manejar_nuevo_registro();
