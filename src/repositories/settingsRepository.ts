import type { AgenciaInfo } from "../types";
import { agenciaToRow, configuracionToRow } from "../lib/rowMappers";
import { supabase } from "../lib/supabaseClient";
import { fail, missingAgency, ok, type OperationResult } from "./repositoryResult";

export async function upsertAgencia(agency: AgenciaInfo): Promise<OperationResult> {
  if (!supabase) return fail("upsertAgencia", "Sin conexión a la nube.");
  if (missingAgency("upsertAgencia")) return fail("upsertAgencia", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("agencias").upsert(agenciaToRow(agency));
  return error ? fail("upsertAgencia", "No se pudo guardar la agencia.", error) : ok();
}
export async function upsertConfiguracion(teamCanSeeAll: boolean, notifications: Record<string, boolean>): Promise<OperationResult> {
  if (!supabase) return fail("upsertConfiguracion", "Sin conexión a la nube.");
  if (missingAgency("upsertConfiguracion")) return fail("upsertConfiguracion", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("configuracion").upsert(configuracionToRow(teamCanSeeAll, notifications));
  return error ? fail("upsertConfiguracion", "No se pudo guardar la configuración.", error) : ok();
}
