import { supabase } from "../lib/supabaseClient";
import type { AsignacionLead } from "../types";
import type { LeadAssignmentRow } from "../types/database";
import { fail, missingAgency, ok, type OperationResult } from "./repositoryResult";

export interface ReasignarLeadInput {
  leadId: string;
  nuevoAsesorId: string;
  motivo: string;
  version?: number;
}

export interface ReasignarLeadResult {
  leadId: string;
  asesorAnteriorId?: string;
  asesorNuevoId: string;
  version: number;
  tareasTransferidas: number;
  citasTransferidas: number;
  ocurridoEn: string;
}

const rowToAssignment = (row: LeadAssignmentRow): AsignacionLead => ({
  id: row.id,
  leadId: row.lead_id,
  asesorAnteriorId: row.asesor_anterior_id ?? undefined,
  asesorNuevoId: row.asesor_nuevo_id,
  reasignadoPorId: row.reasignado_por_id,
  motivo: row.motivo,
  creadoEn: row.creado_en,
});

export async function reasignarLead(
  input: ReasignarLeadInput,
): Promise<OperationResult<ReasignarLeadResult>> {
  if (!supabase) return fail("reasignarLead", "Sin conexión a la nube.");
  if (missingAgency("reasignarLead")) {
    return fail("reasignarLead", "Esta sesión no tiene oficina asociada.");
  }
  const { data, error } = await supabase.rpc("reasignar_lead", {
    p_lead_id: input.leadId,
    p_nuevo_asesor_id: input.nuevoAsesorId,
    p_motivo: input.motivo,
    p_version: input.version ?? null,
  });
  if (error) return fail("reasignarLead", "No se pudo reasignar el cliente.", error);
  const result = data as Record<string, unknown> | null;
  if (!result?.lead_id || !result.assigned_agent_id) {
    return fail("reasignarLead", "La base no confirmó la reasignación.");
  }
  return ok({
    leadId: String(result.lead_id),
    asesorAnteriorId: result.previous_agent_id ? String(result.previous_agent_id) : undefined,
    asesorNuevoId: String(result.assigned_agent_id),
    version: Number(result.version),
    tareasTransferidas: Number(result.pending_tasks_transferred) || 0,
    citasTransferidas: Number(result.future_appointments_transferred) || 0,
    ocurridoEn: String(result.occurred_at),
  });
}

export async function listarAsignacionesLead(
  leadId: string,
): Promise<OperationResult<AsignacionLead[]>> {
  if (!supabase) return ok([]);
  if (missingAgency("listarAsignacionesLead")) {
    return fail("listarAsignacionesLead", "Esta sesión no tiene oficina asociada.");
  }
  const { data, error } = await supabase
    .from("lead_asignaciones")
    .select("*")
    .eq("lead_id", leadId)
    .order("creado_en", { ascending: false });
  if (error) return fail("listarAsignacionesLead", "No se pudo cargar el historial de asignaciones.", error);
  return ok(((data ?? []) as LeadAssignmentRow[]).map(rowToAssignment));
}
