-- =============================================================================
-- VERIFICACIÓN 03 — Prueba de aislamiento entre oficinas
-- Ejecutar DESPUÉS de 01 y 02.
--
-- Qué hace: crea una segunda oficina con datos de prueba, simula la sesión de
-- un broker de cada oficina y comprueba que ninguno ve nada de la otra.
-- Todo ocurre dentro de una transacción que termina en ROLLBACK: no deja basura.
--
-- Si algún bloque lanza excepción, el aislamiento está roto. NO vender hasta
-- que este script corra limpio de principio a fin.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Preparación (como postgres / service_role: ignora RLS a propósito)
-- -----------------------------------------------------------------------------
insert into public.agencias (id, nombre, slug, direccion, estado, plan, codigo_invitacion)
values ('demo-b', 'Inmobiliaria Demo B', 'demo-b', 'Calle Falsa 123', 'activa', 'prueba', 'INV-DEMOB01');

insert into public.configuracion (id, agencia_id, permiso_equipo_ver_todas)
values ('demo-b', 'demo-b', false);

insert into public.usuarios (id, agencia_id, auth_id, nombre, correo, rol, estado_cuenta)
values ('user-demo-b-broker', 'demo-b', '00000000-0000-4000-8000-0000000000b1',
        'Broker B', 'broker.b@demo.mx', 'broker', 'Activo');

insert into public.propiedades (id, agencia_id, titulo, tipo_inmueble, tipo_operacion, precio, asesor_id)
values ('prop-demo-b-1', 'demo-b', 'Casa de prueba oficina B', 'Casa', 'Venta', 2500000, 'user-demo-b-broker');

insert into public.leads (id, agencia_id, nombre, telefono, correo, asesor_id, interes_propiedad_id)
values ('lead-demo-b-1', 'demo-b', 'Cliente B', '5555555555', 'cliente.b@demo.mx',
        'user-demo-b-broker', 'prop-demo-b-1');

-- Broker real de Hábitat, para la prueba en sentido contrario.
update public.usuarios
   set auth_id = '00000000-0000-4000-8000-0000000000a1', estado_cuenta = 'Activo'
 where id = 'user-broker-jean';

-- Credencial real de prueba: si alguna sesión logra leerla, el modelo falló.
select public.guardar_secreto_integracion(
  'default', 'easybroker', 'LLAVE-SECRETA-QUE-NADIE-DEBE-VER',
  '{"cuenta":"habitat"}'::jsonb);


-- =============================================================================
-- PRUEBA 1 — El broker de la oficina B solo ve la oficina B
-- =============================================================================
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-0000000000b1","email":"broker.b@demo.mx","role":"authenticated"}';
set local role authenticated;

do $$
declare n int; ag text;
begin
  select public.mi_agencia_id() into ag;
  if ag is distinct from 'demo-b' then
    raise exception 'FALLA 1.0 — mi_agencia_id() devolvió % (esperaba demo-b)', ag;
  end if;

  select count(*) into n from public.propiedades;
  if n <> 1 then raise exception 'FUGA 1.1 — el broker B ve % propiedades (esperaba 1)', n; end if;

  select count(*) into n from public.leads;
  if n <> 1 then raise exception 'FUGA 1.2 — el broker B ve % leads (esperaba 1)', n; end if;

  select count(*) into n from public.usuarios;
  if n <> 1 then raise exception 'FUGA 1.3 — el broker B ve % usuarios (esperaba 1)', n; end if;

  select count(*) into n from public.agencias;
  if n <> 1 then raise exception 'FUGA 1.4 — el broker B ve % agencias (esperaba 1)', n; end if;

  select count(*) into n from public.configuracion;
  if n <> 1 then raise exception 'FUGA 1.5 — el broker B ve % configuraciones (esperaba 1)', n; end if;

  raise notice 'OK 1 — La oficina B está aislada.';
end $$;

-- Las credenciales de integración no deben ser legibles por ninguna sesión.
-- (Existe una credencial sembrada arriba: este conteo debe fallar o dar 0.)
do $$
declare n int;
begin
  begin
    select count(*) into n from public.agencia_integraciones;
    if n > 0 then
      raise exception 'FUGA 1.6a — una sesión de navegador leyó % credenciales', n;
    end if;
  exception when insufficient_privilege then
    null;  -- resultado correcto: acceso denegado
  end;

  -- Tampoco puede invocar la función que descifra.
  begin
    perform public.leer_secreto_integracion('default','easybroker');
    raise exception 'FUGA 1.6b — una sesión de navegador descifró una credencial';
  exception when insufficient_privilege then
    null;  -- correcto
  end;

  raise notice 'OK 1.6 — Las credenciales no son legibles ni descifrables desde la app.';
end $$;

-- Escribir en la oficina ajena debe fallar.
do $$
begin
  begin
    insert into public.leads (id, agencia_id, nombre, telefono, asesor_id)
    values ('lead-intruso', 'default', 'Intruso', '5500000000', 'user-broker-jean');
    raise exception 'FUGA 1.7 — el broker B insertó un lead en la oficina "default"';
  exception
    when insufficient_privilege then raise notice 'OK 1.7 — Escritura cruzada bloqueada por RLS.';
    when others then
      if sqlerrm like 'FUGA%' then raise; end if;
      raise notice 'OK 1.7 — Escritura cruzada bloqueada (%).', sqlerrm;
  end;
end $$;

reset role;
reset "request.jwt.claims";


-- =============================================================================
-- PRUEBA 2 — El broker de Hábitat no ve la oficina B
-- =============================================================================
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-0000000000a1","email":"niper987@gmail.com","role":"authenticated"}';
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.propiedades where agencia_id <> 'default';
  if n <> 0 then raise exception 'FUGA 2.1 — el broker de Hábitat ve % propiedades ajenas', n; end if;

  select count(*) into n from public.leads where agencia_id <> 'default';
  if n <> 0 then raise exception 'FUGA 2.2 — el broker de Hábitat ve % leads ajenos', n; end if;

  select count(*) into n from public.usuarios where agencia_id <> 'default';
  if n <> 0 then raise exception 'FUGA 2.3 — el broker de Hábitat ve % usuarios ajenos', n; end if;

  raise notice 'OK 2 — Hábitat no ve la oficina B.';
end $$;

reset role;
reset "request.jwt.claims";


-- =============================================================================
-- PRUEBA 3 — Cuenta suspendida y cuenta pendiente no ven nada
-- =============================================================================
update public.agencias set estado = 'suspendida' where id = 'demo-b';

set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-0000000000b1","email":"broker.b@demo.mx","role":"authenticated"}';
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.propiedades;
  if n <> 0 then raise exception 'FALLA 3.1 — agencia suspendida sigue viendo % propiedades', n; end if;
  raise notice 'OK 3 — La suspensión corta el acceso sin borrar datos.';
end $$;

reset role;
reset "request.jwt.claims";

update public.agencias set estado = 'activa' where id = 'demo-b';


-- =============================================================================
-- PRUEBA 4 — Integridad cruzada: no se puede asignar un asesor de otra oficina
-- =============================================================================
do $$
begin
  begin
    insert into public.leads (id, agencia_id, nombre, telefono, asesor_id)
    values ('lead-cruzado', 'demo-b', 'Cruzado', '5511111111', 'user-broker-jean');
    raise exception 'FALLA 4.1 — se asignó un asesor de otra agencia';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
    raise notice 'OK 4 — Trigger de coherencia bloqueó la asignación cruzada.';
  end;
end $$;


-- =============================================================================
-- PRUEBA 5 — Cuenta autenticada sin perfil (el caso "alguien se registró solo")
-- =============================================================================
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-00000000ffff","email":"desconocido@gmail.com","role":"authenticated"}';
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.propiedades; if n <> 0 then raise exception 'FUGA 5.1 — sesión sin perfil ve % propiedades', n; end if;
  select count(*) into n from public.leads;       if n <> 0 then raise exception 'FUGA 5.2 — sesión sin perfil ve % leads', n; end if;
  select count(*) into n from public.usuarios;    if n <> 0 then raise exception 'FUGA 5.3 — sesión sin perfil ve % usuarios', n; end if;
  raise notice 'OK 5 — Una cuenta sin agencia no ve absolutamente nada.';
end $$;

reset role;
reset "request.jwt.claims";


-- =============================================================================
-- PRUEBA 6 — Rol anónimo (la anon key pública del frontend)
-- =============================================================================
set local role anon;

do $$
declare n int;
begin
  begin
    select count(*) into n from public.propiedades;
    raise exception 'FUGA 6.1 — el rol anon leyó % propiedades', n;
  exception when insufficient_privilege then
    raise notice 'OK 6 — El rol anónimo no tiene acceso a ninguna tabla.';
  end;
end $$;

reset role;


-- =============================================================================
rollback;   -- <<< no deja rastro. Cambiar a COMMIT solo si se quiere conservar
            --     la oficina de prueba para la demo.
-- =============================================================================
