-- Lector de credenciales de integración por oficina (Vault).
-- Complementa guardar_secreto_integracion() (escritura) y
-- agencia_por_phone_number_id() (ruteo por número), ya existentes.
-- Mismo endurecimiento que validar_secreto_sync(): SECURITY DEFINER,
-- search_path fijo, y EXECUTE revocado explícitamente a los 3 roles
-- (PostgreSQL concede a PUBLIC por defecto, y Supabase además concede
-- directo a anon/authenticated — revocar solo de PUBLIC no alcanza,
-- ver decision-agenda-calendario.md).
create or replace function public.obtener_secreto_integracion(p_agencia_id text, p_proveedor text)
returns text
language sql
stable
security definer
set search_path = 'public', 'vault'
as $$
  select ds.decrypted_secret
    from public.agencia_integraciones ai
    join vault.decrypted_secrets ds on ds.id = ai.secreto_id
   where ai.agencia_id = p_agencia_id
     and ai.proveedor = p_proveedor
     and ai.activo
   limit 1;
$$;

revoke execute on function public.obtener_secreto_integracion(text, text) from public;
revoke execute on function public.obtener_secreto_integracion(text, text) from anon;
revoke execute on function public.obtener_secreto_integracion(text, text) from authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.obtener_secreto_integracion(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.obtener_secreto_integracion(text,text)', 'execute') then
    raise exception 'obtener_secreto_integracion quedó invocable desde anon/authenticated';
  end if;
end $$;
