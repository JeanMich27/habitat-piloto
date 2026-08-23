import type { Propiedad } from "../types";
import { propiedadToRow } from "../lib/rowMappers";
import { supabase } from "../lib/supabaseClient";
import { fail, missingAgency, ok, type OperationResult } from "./repositoryResult";

export async function upsertPropiedad(property: Propiedad): Promise<OperationResult> {
  if (!supabase) return fail("upsertPropiedad", "Sin conexión a la nube.");
  if (missingAgency("upsertPropiedad")) return fail("upsertPropiedad", "Esta sesión no tiene oficina asociada.");
  const query = property.version == null
    ? supabase.from("propiedades").upsert(propiedadToRow(property)).select("version").maybeSingle()
    : supabase.from("propiedades").update(propiedadToRow(property)).eq("id", property.id).eq("version", property.version).select("version").maybeSingle();
  const { data, error } = await query;
  if (error) return fail("upsertPropiedad", "No se pudo guardar la propiedad.", error);
  if (!data) return fail("upsertPropiedad", "La propiedad cambió en otra sesión. Recarga antes de guardar.", undefined, "CONFLICT");
  property.version = Number(data.version);
  return ok();
}

export async function bulkUpsertPropiedades(items: Propiedad[]): Promise<OperationResult> {
  if (items.length === 0) return ok();
  if (!supabase) return fail("bulkUpsertPropiedades", "Sin conexión a la nube.");
  if (missingAgency("bulkUpsertPropiedades")) return fail("bulkUpsertPropiedades", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("propiedades").upsert(items.map(propiedadToRow));
  return error ? fail("bulkUpsertPropiedades", "No se pudieron guardar las propiedades.", error) : ok();
}
