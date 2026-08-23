import type { Lead } from "../types";
import { leadToRow, rowToLead } from "../lib/rowMappers";
import { supabase } from "../lib/supabaseClient";
import { fail, missingAgency, ok, type OperationResult } from "./repositoryResult";

export async function upsertLead(lead: Lead): Promise<OperationResult> {
  if (!supabase) return fail("upsertLead", "Sin conexión a la nube.");
  if (missingAgency("upsertLead")) return fail("upsertLead", "Esta sesión no tiene oficina asociada.");
  const query = lead.version == null
    ? supabase.from("leads").upsert(leadToRow(lead)).select("version").maybeSingle()
    : supabase.from("leads").update(leadToRow(lead)).eq("id", lead.id).eq("version", lead.version).select("version").maybeSingle();
  const { data, error } = await query;
  if (error) return fail("upsertLead", "No se pudo guardar el lead.", error);
  if (!data) return fail("upsertLead", "El lead cambió en otra sesión. Recarga antes de guardar.", undefined, "CONFLICT");
  lead.version = Number(data.version);
  return ok();
}

export async function bulkUpsertLeads(items: Lead[]): Promise<OperationResult> {
  if (items.length === 0) return ok();
  if (!supabase) return fail("bulkUpsertLeads", "Sin conexión a la nube.");
  if (missingAgency("bulkUpsertLeads")) return fail("bulkUpsertLeads", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("leads").upsert(items.map(leadToRow));
  return error ? fail("bulkUpsertLeads", "No se pudieron guardar los leads.", error) : ok();
}

export interface CrearLeadInput { name: string; phone?: string; email?: string; source: string; origin: Lead["origen"]; property_id?: string; message?: string; assigned_agent_id?: string; occupation?: string }
export async function crearOEnlazarLead(input: CrearLeadInput): Promise<OperationResult<{ lead: Lead; created: boolean }>> {
  if (!supabase) return fail("crearOEnlazarLead", "Sin conexión a la nube.");
  if (missingAgency("crearOEnlazarLead")) return fail("crearOEnlazarLead", "Esta sesión no tiene oficina asociada.");
  const { data, error } = await supabase.rpc("crear_o_relacionar_lead", { p_input: input });
  if (error) return fail("crearOEnlazarLead", "No se pudo crear el lead.", error);
  const result = data as { lead_id?: string; created?: boolean } | null;
  if (!result?.lead_id) return fail("crearOEnlazarLead", "La base no confirmó el lead creado.");
  const { data: row, error: readError } = await supabase.from("leads").select("*").eq("id", result.lead_id).single();
  if (readError || !row) return fail("crearOEnlazarLead", "El lead se creó, pero no pudo recuperarse.", readError);
  return ok({ lead: rowToLead(row), created: result.created === true });
}
