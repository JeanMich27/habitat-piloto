-- Hallazgo del linter (get_advisors) tras la migración anterior: la función
-- de trigger usuarios_generar_slug() quedó invocable directo vía
-- /rest/v1/rpc/usuarios_generar_slug por ser SECURITY DEFINER sin revoke
-- explícito. No hace nada útil fuera del contexto de trigger (usa NEW), pero
-- el propio proyecto ya documentó que en Supabase hay que nombrar a los tres
-- roles siempre, no dejar ninguno por costumbre. Revocar no rompe el
-- trigger: el disparo de un trigger no depende de EXECUTE sobre la función,
-- depende del privilegio sobre la tabla.
revoke all on function public.usuarios_generar_slug() from public;
revoke all on function public.usuarios_generar_slug() from anon;
revoke all on function public.usuarios_generar_slug() from authenticated;
