-- =============================================================================
-- MIGRACIÓN 05 — Endurecer permisos de ejecución de funciones
-- Ejecutar DESPUÉS de 01, 02 y 04.
--
-- Hallazgo del linter de seguridad de Supabase, posterior a aplicar 01–04:
-- PostgreSQL concede EXECUTE a PUBLIC por defecto en toda función nueva.
-- `revoke ... from anon` NO lo quita, porque anon hereda de PUBLIC. Resultado:
-- cualquiera con la llave pública del frontend podía llamar estas funciones
-- por /rest/v1/rpc/.
--
-- El caso que de verdad importaba: `agencia_por_phone_number_id` permitía a un
-- anónimo mapear números de WhatsApp a oficinas. Ahora es solo de service_role.
-- =============================================================================

begin;

-- 1. Funciones de trigger: nadie debe poder llamarlas por RPC.
revoke execute on function public.validar_coherencia_agencia()  from public, anon, authenticated;
revoke execute on function public.set_telefono_norm()           from public, anon, authenticated;
revoke execute on function public.manejar_nuevo_registro()      from public, anon, authenticated;
revoke execute on function public.proteger_campos_usuario()     from public, anon, authenticated;

-- 2. Resolución de oficina por número de WhatsApp: solo el servidor.
revoke execute on function public.agencia_por_phone_number_id(text) from public, anon, authenticated;
grant  execute on function public.agencia_por_phone_number_id(text) to service_role;

-- 3. Credenciales: reforzar el revoke (PUBLIC seguía teniendo EXECUTE).
revoke execute on function public.guardar_secreto_integracion(text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.leer_secreto_integracion(text,text)               from public, anon, authenticated;

-- 4. Funciones que RLS necesita: `authenticated` sí las requiere para que las
--    políticas se evalúen; PUBLIC y anon no. Quitar el grant a authenticated
--    aquí rompería el acceso de todos los usuarios.
revoke execute on function public.mi_agencia_id()   from public, anon;
revoke execute on function public.mi_usuario_id()   from public, anon;
revoke execute on function public.mi_rol_activo()   from public, anon;
revoke execute on function public.mi_correo()       from public, anon;
revoke execute on function public.es_broker()       from public, anon;
revoke execute on function public.soy_asesor()      from public, anon;
revoke execute on function public.puedo_ver_todas() from public, anon;

grant execute on function public.mi_agencia_id()   to authenticated;
grant execute on function public.mi_usuario_id()   to authenticated;
grant execute on function public.mi_rol_activo()   to authenticated;
grant execute on function public.mi_correo()       to authenticated;
grant execute on function public.es_broker()       to authenticated;
grant execute on function public.soy_asesor()      to authenticated;
grant execute on function public.puedo_ver_todas() to authenticated;

-- 5. search_path fijo.
alter function public.mi_correo() set search_path = public, pg_catalog;

commit;

-- Pendientes que el linter marca y NO se tocaron aquí, a propósito:
--   * `historial_solo_crece` y `exigir_bant_para_avanzar` tienen search_path
--     mutable. Son funciones previas que no revisé; fijarles el search_path a
--     ciegas puede cambiar su comportamiento. Revisar y ajustar por separado.
--   * "Leaked password protection" está apagada. Se activa en el panel:
--     Authentication > Policies. No es SQL.
