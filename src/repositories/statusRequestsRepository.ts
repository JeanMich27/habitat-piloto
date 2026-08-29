import type { PropertyStatus } from "../types";
import { agenciaActualONull } from "../lib/agenciaActual";
import { supabase } from "../lib/supabaseClient";
import { fail, missingAgency, ok, type OperationResult } from "./repositoryResult";

export async function crearSolicitudEstado(request: { id: string; propiedadId: string; solicitanteId: string; estadoActual: string; estadoSolicitado: PropertyStatus; motivo?: string }): Promise<OperationResult> {
  if (!supabase) return fail("crearSolicitudEstado", "Sin conexión a la nube.");
  if (missingAgency("crearSolicitudEstado")) return fail("crearSolicitudEstado", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("solicitudes_estado").insert({
    id: request.id, agencia_id: agenciaActualONull(), propiedad_id: request.propiedadId,
    solicitante_id: request.solicitanteId, estado_actual: request.estadoActual,
    estado_solicitado: request.estadoSolicitado, motivo: request.motivo ?? null,
  });
  if (!error) return ok();
  return fail(
    "crearSolicitudEstado",
    /pendiente_unica|duplicate/i.test(error.message)
      ? "Esta propiedad ya tiene una solicitud en revisión."
      : "No se pudo enviar la solicitud. Intenta de nuevo.",
    error,
  );
}
export async function resolverSolicitudEstado(id: string, result: "aprobada" | "rechazada"): Promise<OperationResult> {
  if (!supabase) return fail("resolverSolicitudEstado", "Sin conexión a la nube.");
  if (missingAgency("resolverSolicitudEstado")) return fail("resolverSolicitudEstado", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("solicitudes_estado").update({ estatus: result }).eq("id", id);
  return error
    ? fail("resolverSolicitudEstado", "No se pudo resolver la solicitud. Intenta de nuevo.", error)
    : ok();
}
