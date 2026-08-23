import type { PropertyStatus } from "../types";
import { agenciaActualONull } from "../lib/agenciaActual";
import { supabase } from "../lib/supabaseClient";
import { missingAgency } from "./repositoryResult";

export async function crearSolicitudEstado(request: { id: string; propiedadId: string; solicitanteId: string; estadoActual: string; estadoSolicitado: PropertyStatus; motivo?: string }): Promise<string | null> {
  if (!supabase || missingAgency("crearSolicitudEstado")) return null;
  const { error } = await supabase.from("solicitudes_estado").insert({
    id: request.id, agencia_id: agenciaActualONull(), propiedad_id: request.propiedadId,
    solicitante_id: request.solicitanteId, estado_actual: request.estadoActual,
    estado_solicitado: request.estadoSolicitado, motivo: request.motivo ?? null,
  });
  if (!error) return null;
  console.error("[Supabase] crearSolicitudEstado", error);
  return /pendiente_unica|duplicate/i.test(error.message) ? "Esta propiedad ya tiene una solicitud en revisión." : "No se pudo enviar la solicitud. Intenta de nuevo.";
}
export async function resolverSolicitudEstado(id: string, result: "aprobada" | "rechazada"): Promise<string | null> {
  if (!supabase || missingAgency("resolverSolicitudEstado")) return null;
  const { error } = await supabase.from("solicitudes_estado").update({ estatus: result }).eq("id", id);
  if (!error) return null;
  console.error("[Supabase] resolverSolicitudEstado", error);
  return "No se pudo resolver la solicitud. Intenta de nuevo.";
}
