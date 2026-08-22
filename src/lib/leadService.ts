import type { Lead } from "../types";
import { crearOEnlazarLead, type OperationResult } from "./dataStore";

/**
 * Servicio de aplicación para crear leads. React no conoce la RPC ni futuras
 * integraciones; solo entrega el modelo capturado por la interfaz.
 */
export async function crearLead(
  lead: Lead,
): Promise<OperationResult<{ lead: Lead; created: boolean }>> {
  return crearOEnlazarLead({
    name: lead.nombre,
    phone: lead.telefono || undefined,
    email: lead.correo || undefined,
    source: "manual",
    origin: lead.origen,
    property_id: lead.interesPropiedadId || undefined,
    message: lead.nota || undefined,
    assigned_agent_id: lead.asesorId || undefined,
    occupation: lead.ocupacion || undefined,
  });
}
