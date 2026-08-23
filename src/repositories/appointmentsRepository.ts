import type { CitaAgenda } from "../types";
import { citaToRow } from "../lib/rowMappers";
import { supabase } from "../lib/supabaseClient";
import { fail, missingAgency, ok, type OperationResult } from "./repositoryResult";

export async function upsertCita(appointment: CitaAgenda): Promise<OperationResult> {
  if (!supabase) return fail("upsertCita", "Sin conexión a la nube.");
  if (missingAgency("upsertCita")) return fail("upsertCita", "Esta sesión no tiene oficina asociada.");
  const query = appointment.version == null
    ? supabase.from("citas").upsert(citaToRow(appointment)).select("version").maybeSingle()
    : supabase.from("citas").update(citaToRow(appointment)).eq("id", appointment.id).eq("version", appointment.version).select("version").maybeSingle();
  const { data, error } = await query;
  if (error) return fail("upsertCita", "No se pudo guardar la cita.", error);
  if (!data) return fail("upsertCita", "La cita cambió en otra sesión. Recarga antes de guardar.", undefined, "CONFLICT");
  appointment.version = Number(data.version);
  return ok();
}
export async function eliminarCita(id: string): Promise<OperationResult> {
  if (!supabase) return fail("eliminarCita", "Sin conexión a la nube.");
  if (missingAgency("eliminarCita")) return fail("eliminarCita", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("citas").delete().eq("id", id);
  return error ? fail("eliminarCita", "No se pudo eliminar la cita.", error) : ok();
}
export async function confirmarCitaClienteEnNube(leadId: string, appointmentId: string): Promise<string | null> {
  if (!supabase) return "Sin conexión a la nube.";
  const { data, error } = await supabase.rpc("cliente_confirmar_cita", { p_lead_id: leadId, p_cita_id: appointmentId });
  if (error) { console.error("[Supabase] cliente_confirmar_cita", error); return "No se pudo confirmar la cita. Intenta de nuevo."; }
  return data === true ? null : "La cita ya no está disponible para confirmar.";
}
async function agendaToken(rpc: "mi_token_agenda" | "rotar_token_agenda"): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc(rpc);
  if (error) { console.error(`[Supabase] ${rpc}`, error); return null; }
  return (data as string) ?? null;
}
export const obtenerTokenAgenda = () => agendaToken("mi_token_agenda");
export const rotarTokenAgenda = () => agendaToken("rotar_token_agenda");
