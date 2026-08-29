import type { Operacion, TipoOperacion } from "../types";
import type { LeadRow, OperationRow, PropertyRow } from "../types/database";
import { rowToLead, rowToOperacion, rowToPropiedad } from "../lib/rowMappers";
import { supabase } from "../lib/supabaseClient";
import { fail, missingAgency, ok, type OperationResult } from "./repositoryResult";

export interface ReportarOperacionInput {
  leadId: string;
  propiedadId?: string;
  propiedadReferencia?: string;
  crmPropiedadId?: string;
  tipoOperacion?: TipoOperacion;
  fechaCierre?: string;
  montoFinal?: number;
  moneda?: string;
  comisionBrutaConfirmada?: number;
  comentario?: string;
}

export interface ResolverOperacionInput {
  operacionId: string;
  resultado: "validada" | "devuelta";
  observacion?: string;
  tipoOperacion?: TipoOperacion;
  fechaCierre?: string;
  montoFinal?: number;
  moneda?: string;
  comisionBrutaConfirmada?: number;
  propiedadId?: string;
  propiedadReferencia?: string;
  crmPropiedadId?: string;
}

export interface ResolverOperacionResult {
  operacion: Operacion;
  lead?: ReturnType<typeof rowToLead>;
  propiedad?: ReturnType<typeof rowToPropiedad>;
  autovalidada: boolean;
}

export async function reportarOperacion(
  input: ReportarOperacionInput,
): Promise<OperationResult<Operacion>> {
  if (!supabase) return fail("reportarOperacion", "Sin conexión a la nube.");
  if (missingAgency("reportarOperacion")) {
    return fail("reportarOperacion", "Esta sesión no tiene oficina asociada.");
  }
  const { data, error } = await supabase.rpc("reportar_operacion", {
    p_lead_id: input.leadId,
    p_propiedad_id: input.propiedadId ?? null,
    p_propiedad_referencia: input.propiedadReferencia ?? null,
    p_crm_propiedad_id: input.crmPropiedadId ?? null,
    p_tipo_operacion: input.tipoOperacion ?? null,
    p_fecha_cierre: input.fechaCierre ?? null,
    p_monto_final: input.montoFinal ?? null,
    p_moneda: input.moneda ?? "MXN",
    p_comision_bruta_confirmada: input.comisionBrutaConfirmada ?? null,
    p_comentario: input.comentario ?? null,
  });
  if (error) return fail("reportarOperacion", "No se pudo reportar la operación.", error);
  if (!data) return fail("reportarOperacion", "La base no confirmó el reporte.");
  return ok(rowToOperacion(data as OperationRow));
}

export async function resolverOperacion(
  input: ResolverOperacionInput,
): Promise<OperationResult<ResolverOperacionResult>> {
  if (!supabase) return fail("resolverOperacion", "Sin conexión a la nube.");
  if (missingAgency("resolverOperacion")) {
    return fail("resolverOperacion", "Esta sesión no tiene oficina asociada.");
  }
  const { data, error } = await supabase.rpc("resolver_operacion", {
    p_operacion_id: input.operacionId,
    p_resultado: input.resultado,
    p_observacion: input.observacion ?? null,
    p_tipo_operacion: input.tipoOperacion ?? null,
    p_fecha_cierre: input.fechaCierre ?? null,
    p_monto_final: input.montoFinal ?? null,
    p_moneda: input.moneda ?? null,
    p_comision_bruta_confirmada: input.comisionBrutaConfirmada ?? null,
    p_propiedad_id: input.propiedadId ?? null,
    p_propiedad_referencia: input.propiedadReferencia ?? null,
    p_crm_propiedad_id: input.crmPropiedadId ?? null,
  });
  if (error) return fail("resolverOperacion", "No se pudo resolver la operación.", error);
  const result = data as {
    operacion?: OperationRow;
    lead?: LeadRow | null;
    propiedad?: PropertyRow | null;
    autovalidada?: boolean;
  } | null;
  if (!result?.operacion) return fail("resolverOperacion", "La base no confirmó la resolución.");
  return ok({
    operacion: rowToOperacion(result.operacion),
    lead: result.lead ? rowToLead(result.lead) : undefined,
    propiedad: result.propiedad ? rowToPropiedad(result.propiedad) : undefined,
    autovalidada: result.autovalidada === true,
  });
}
