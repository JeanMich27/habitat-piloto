-- =============================================================================
-- FIX: proteger_propiedad_asesor_equipo() bloqueaba escrituras de sistema —
-- 29/08/2026
--
-- mi_rol_activo() devuelve NULL cuando quien escribe no es un usuario con
-- sesión (auth.uid() no coincide con ninguna fila en usuarios) — es el caso
-- del proceso de sync (service_role key). La condición original
-- "if mi_rol_activo() <> 'asesor_equipo' then return new" nunca es TRUE
-- cuando mi_rol_activo() es NULL (NULL <> texto = NULL, no TRUE), así que el
-- trigger caía al bloque que lanza la excepción y bloqueaba a sync-propiedades
-- (y a cualquier escritura sin sesión) cada vez que EasyBroker cambiaba un
-- campo protegido (título, precio, m2, recámaras, baños, comisión, asesor,
-- exclusiva, etc.), tratándolo como si fuera un asesor de equipo sin permiso.
--
-- Confirmado en producción el 29/08/2026: sync-propiedades falló 4 de 95
-- propiedades con "El asesor de equipo no puede editar la propiedad" tras
-- reactivar el sync (ver 20260829040000_ingesta_log_proveedor_externo.sql).
--
-- Fix: coalesce(mi_rol_activo(), '') — NULL ya no cuenta como 'asesor_equipo'.
-- Restaura la intención original del trigger (solo restringe asesor_equipo);
-- no cambia el comportamiento para broker, asesor_independiente ni
-- asesor_equipo real.
-- =============================================================================

begin;

create or replace function public.proteger_propiedad_asesor_equipo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(public.mi_rol_activo(), '') <> 'asesor_equipo' then
    return new;
  end if;
  if new.estatus is distinct from old.estatus
     or new.titulo is distinct from old.titulo
     or new.descripcion is distinct from old.descripcion
     or new.precio is distinct from old.precio
     or new.recamaras is distinct from old.recamaras
     or new.banos is distinct from old.banos
     or new.m2 is distinct from old.m2
     or new.tipo_inmueble is distinct from old.tipo_inmueble
     or new.tipo_operacion is distinct from old.tipo_operacion
     or new.asesor_id is distinct from old.asesor_id
     or new.propietario is distinct from old.propietario
     or new.documentos is distinct from old.documentos
     or coalesce(new.exclusiva, false) is distinct from coalesce(old.exclusiva, false)
     or new.comision_tipo is distinct from old.comision_tipo
     or new.comision_valor is distinct from old.comision_valor
     or new.publicada_el is distinct from old.publicada_el
     or coalesce(new.enlaces_promocion, '[]'::jsonb)
        is distinct from coalesce(old.enlaces_promocion, '[]'::jsonb)
  then
    raise exception
      'El asesor de equipo no puede editar la propiedad. Solicita el cambio de estado al broker.';
  end if;
  return new;
end;
$$;
revoke execute on function public.proteger_propiedad_asesor_equipo() from public, anon, authenticated;

commit;
