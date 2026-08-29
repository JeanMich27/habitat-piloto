import { tareaToRow } from "../lib/rowMappers";
import { supabase } from "../lib/supabaseClient";
import type { Tarea } from "../types";
import { fail, missingAgency, ok, type OperationResult } from "./repositoryResult";

export async function guardarTarea(tarea: Tarea): Promise<OperationResult<Tarea>> {
  if (!supabase) return fail("guardarTarea", "Sin conexión a la nube.");
  if (missingAgency("guardarTarea")) {
    return fail("guardarTarea", "Esta sesión no tiene oficina asociada.");
  }
  const { data, error } = await supabase
    .from("tareas")
    .upsert(tareaToRow(tarea))
    .select("*")
    .maybeSingle();
  if (error) return fail("guardarTarea", "No se pudo programar el seguimiento.", error);
  if (!data) return fail("guardarTarea", "La base no confirmó el seguimiento.");
  return ok({
    id: data.id,
    leadId: data.lead_id ?? undefined,
    asesorId: data.asesor_id ?? undefined,
    titulo: data.titulo,
    estado: data.estado,
    venceEn: data.vence_en,
    creadaEn: data.creada_en,
    completadaEn: data.completada_en ?? undefined,
    metadata: data.metadata ?? {},
  });
}

export async function completarTarea(tarea: Tarea): Promise<OperationResult<Tarea>> {
  if (!supabase) return fail("completarTarea", "Sin conexión a la nube.");
  if (missingAgency("completarTarea")) {
    return fail("completarTarea", "Esta sesión no tiene oficina asociada.");
  }
  const completadaEn = new Date().toISOString();
  const { data, error } = await supabase
    .from("tareas")
    .update({ estado: "completada", completada_en: completadaEn })
    .eq("id", tarea.id)
    .eq("estado", "pendiente")
    .select("*")
    .maybeSingle();
  if (error) return fail("completarTarea", "No se pudo completar el seguimiento.", error);
  if (!data) return fail("completarTarea", "El seguimiento ya cambió en otra sesión.", undefined, "CONFLICT");
  return ok({ ...tarea, estado: "completada", completadaEn });
}
