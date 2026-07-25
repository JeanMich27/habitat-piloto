import type { Lead, LeadStage } from "../types";

const ETIQUETAS_ETAPA: Record<LeadStage, string> = {
  Nuevo: "Nuevo",
  Contactado: "Contactado",
  Visitado: "Visitado",
  Negociacion: "Negociación",
  Cierre: "Cierre",
};

export const etiquetaEtapa = (etapa: LeadStage) => ETIQUETAS_ETAPA[etapa];

export const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

export const MS_DIA = 1000 * 60 * 60 * 24;

export const diasDesde = (fechaISO: string, ahora: number) =>
  (ahora - new Date(fechaISO).getTime()) / MS_DIA;

export function minutosRespuesta(lead: Lead): number | null {
  if (!lead.primerContactoEn) return null;
  return (
    (new Date(lead.primerContactoEn).getTime() - new Date(lead.creado).getTime()) / 60000
  );
}

export function formatMin(min: number | null) {
  if (min === null) return "Sin datos";
  if (min < 60) return `${Math.round(min)} min`;
  return `${(min / 60).toFixed(1)} h`;
}

export function promedio(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}
