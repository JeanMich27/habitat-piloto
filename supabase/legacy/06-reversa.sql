-- LEGACY — NO USAR PARA PRODUCCIÓN NI COMO MIGRACIÓN.
-- Reversa histórica potencialmente destructiva. Ver supabase/legacy/README.md.

-- =============================================================================
-- REVERSA — deshace las migraciones 01, 02, 04 y 05
--
-- Úsalo solo si algo sale mal en producción y hay que volver al esquema de una
-- sola oficina mientras se corrige.
--
-- NO borra datos de negocio: solo quita las columnas, tablas, políticas y
-- triggers que agregó la migración multi-tenant, y restaura las políticas
-- anteriores. Si ya se dieron de alta oficinas nuevas, sus filas quedarían
-- mezcladas con las de Hábitat: en ese caso NO uses este script, corrige hacia
-- adelante.
--
-- Comprobación previa obligatoria:
--   select count(*) from public.agencias where id <> 'default';
--   -- debe devolver 0
-- =============================================================================

begin;

do $$
declare n int;
begin
  select count(*) into n from public.agencias where id <> 'default';
  if n > 0 then
    raise exception 'Hay % oficinas además de la original. Revertir mezclaría sus datos; corrige hacia adelante.', n;
  end if;
end $$;

-- 1. Políticas y objetos nuevos
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
     where schemaname = 'public'
       and tablename in ('agencias','usuarios','propiedades','leads','configuracion',
                         'sync_estado','ingesta_log','wa_conversaciones','wa_mensajes')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

drop trigger if exists leads_set_telefono_norm       on public.leads;
drop trigger if exists leads_coherencia_agencia      on public.leads;
drop trigger if exists propiedades_coherencia_agencia on public.propiedades;
drop function if exists public.set_telefono_norm();
drop function if exists public.validar_coherencia_agencia();
drop function if exists public.mi_agencia_id();
drop function if exists public.agencia_por_phone_number_id(text);
drop function if exists public.guardar_secreto_integracion(text,text,text,jsonb);
drop function if exists public.leer_secreto_integracion(text,text);

drop table if exists public.wa_mensajes;
drop table if exists public.wa_conversaciones;
drop table if exists public.agencia_integraciones;
drop table if exists public.auditoria_admin;
drop table if exists public.admin_plataforma;

-- 2. Índices y restricciones agregadas
drop index if exists public.usuarios_agencia_correo_key;
drop index if exists public.propiedades_agencia_eb_key;
drop index if exists public.configuracion_agencia_key;
drop index if exists public.usuarios_agencia_idx;
drop index if exists public.propiedades_agencia_idx;
drop index if exists public.leads_agencia_idx;
drop index if exists public.leads_agencia_etapa_idx;
drop index if exists public.leads_agencia_tel_idx;
drop index if exists public.ingesta_log_agencia_idx;
drop index if exists public.leads_dedup_tel_idx;

alter table public.sync_estado drop constraint if exists sync_estado_pkey;
alter table public.sync_estado add primary key (proceso);

-- 3. Columna agencia_id
alter table public.usuarios      drop column if exists agencia_id;
alter table public.propiedades   drop column if exists agencia_id;
alter table public.leads         drop column if exists agencia_id;
alter table public.configuracion drop column if exists agencia_id;
alter table public.sync_estado   drop column if exists agencia_id;
alter table public.ingesta_log   drop column if exists agencia_id;

-- 4. Tabla de tenants de vuelta a su forma anterior
do $$ begin
  if to_regclass('public.agencias') is not null then
    alter table public.agencias rename to agencia;
  end if;
end $$;
alter table public.agencia drop constraint if exists agencias_estado_chk;
drop index if exists public.agencias_slug_key;
drop index if exists public.agencias_codinv_key;
alter table public.agencia
  drop column if exists slug,
  drop column if exists estado,
  drop column if exists plan,
  drop column if exists codigo_invitacion,
  drop column if exists creado;

commit;

-- =============================================================================
-- Después de correr esto: volver a ejecutar `migracion-auth-rls.sql` para
-- restaurar las funciones y políticas de una sola oficina, y revertir el
-- frontend con `git checkout -- src/`.
-- =============================================================================
