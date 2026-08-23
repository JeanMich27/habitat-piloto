import type { Usuario } from "../types";
import { usuarioToRow } from "../lib/rowMappers";
import { supabase } from "../lib/supabaseClient";
import { fail, missingAgency, ok, type OperationResult } from "./repositoryResult";

export async function upsertUsuario(user: Usuario): Promise<OperationResult> {
  if (!supabase) return fail("upsertUsuario", "Sin conexión a la nube.");
  if (missingAgency("upsertUsuario")) return fail("upsertUsuario", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("usuarios").upsert(usuarioToRow(user));
  return error ? fail("upsertUsuario", "No se pudo guardar el usuario.", error) : ok();
}
export async function desactivarAsesorAtomico(advisorId: string, reassignToId: string): Promise<OperationResult> {
  if (!supabase) return fail("desactivarAsesorAtomico", "Sin conexión a la nube.");
  const { error } = await supabase.rpc("desactivar_asesor_y_reasignar", { p_asesor_id: advisorId, p_reasignar_a_id: reassignToId });
  return error ? fail("desactivarAsesorAtomico", "No se pudo desactivar y reasignar al asesor.", error) : ok();
}
export async function upsertUsuarioConError(user: Usuario): Promise<string | null> {
  if (!supabase) return "Sin conexión a la nube.";
  if (missingAgency("upsertUsuarioConError")) return "Esta sesión no tiene oficina asociada. Vuelve a entrar.";
  const { error } = await supabase.from("usuarios").upsert(usuarioToRow(user));
  if (!error) return null;
  console.error("[Supabase] upsertUsuarioConError", error);
  const message = error.message.toLowerCase();
  if (message.includes("row-level security") || message.includes("violates row-level")) return "Tu cuenta no tiene permiso para dar de alta gente en esta oficina.";
  if (message.includes("duplicate key") && message.includes("correo")) return "Ya existe una cuenta con ese correo.";
  return error.message;
}
