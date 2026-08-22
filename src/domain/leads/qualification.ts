import {
  BANT_AUTORIDAD,
  BANT_NECESIDAD,
  BANT_PLAZO,
  catalogoPresupuesto,
  clasificarLead,
  totalBant,
  type CalificacionBANT,
  type ClasificacionLead,
  type LeadStage,
} from "../../types";

export const CAMPOS_BANT = ["presupuesto", "autoridad", "necesidad", "plazo"] as const;
export type CampoBant = (typeof CAMPOS_BANT)[number];
export type EstadoBant = "vacio" | "parcial" | "completo" | "invalido";

export interface EvaluacionBant {
  estado: EstadoBant;
  faltantes: CampoBant[];
  invalidos: CampoBant[];
  puntaje: number | null;
  clasificacion: ClasificacionLead | null;
  calificado: boolean;
}

const contiene = (catalogo: { valor: string }[], valor: string) =>
  catalogo.some((opcion) => opcion.valor === valor);

/** Fuente única de completitud, validez, puntaje y clasificación BANT. */
export function evaluarBant(bant?: CalificacionBANT): EvaluacionBant {
  if (!bant) {
    return {
      estado: "vacio",
      faltantes: [...CAMPOS_BANT],
      invalidos: [],
      puntaje: null,
      clasificacion: null,
      calificado: false,
    };
  }

  const faltantes = CAMPOS_BANT.filter((campo) => !bant[campo]);
  const invalidos = [
    bant.presupuesto && !contiene(catalogoPresupuesto(bant.perfil ?? "Comprador"), bant.presupuesto)
      ? "presupuesto"
      : null,
    bant.autoridad && !contiene(BANT_AUTORIDAD, bant.autoridad) ? "autoridad" : null,
    bant.necesidad && !contiene(BANT_NECESIDAD, bant.necesidad) ? "necesidad" : null,
    bant.plazo && !contiene(BANT_PLAZO, bant.plazo) ? "plazo" : null,
  ].filter((campo): campo is CampoBant => campo !== null);

  if (invalidos.length > 0) {
    return {
      estado: "invalido",
      faltantes,
      invalidos,
      puntaje: null,
      clasificacion: null,
      calificado: false,
    };
  }
  if (faltantes.length === CAMPOS_BANT.length) {
    return {
      estado: "vacio",
      faltantes,
      invalidos: [],
      puntaje: null,
      clasificacion: null,
      calificado: false,
    };
  }
  if (faltantes.length > 0) {
    return {
      estado: "parcial",
      faltantes,
      invalidos: [],
      puntaje: null,
      clasificacion: null,
      calificado: false,
    };
  }

  const puntaje = totalBant(bant);
  return {
    estado: "completo",
    faltantes: [],
    invalidos: [],
    puntaje,
    clasificacion: clasificarLead(puntaje),
    calificado: true,
  };
}

export const esBantCompleto = (bant?: CalificacionBANT) => evaluarBant(bant).calificado;
export const preguntasBantPendientes = (bant?: CalificacionBANT) => evaluarBant(bant).faltantes;

export function puedeAvanzarAEtapa(bant: CalificacionBANT | undefined, etapa: LeadStage): boolean {
  if (!(["Visitado", "Negociacion", "Cierre"] as LeadStage[]).includes(etapa)) return true;
  return evaluarBant(bant).calificado;
}
