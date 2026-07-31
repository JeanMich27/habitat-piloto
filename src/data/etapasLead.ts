import type { LeadStage } from "../types";

/**
 * Etapas del pipeline en orden. Fuente única para las columnas del Kanban y
 * para el selector de etapa de cada tarjeta: si mañana se agrega una etapa,
 * se agrega aquí y las dos pantallas se enteran solas.
 */
export const ETAPAS_LEAD: { etapa: LeadStage; titulo: string; acento: string }[] = [
  { etapa: "Nuevo", titulo: "Nuevo", acento: "bg-blue-500" },
  { etapa: "Contactado", titulo: "Contactado", acento: "bg-violet-500" },
  { etapa: "Visitado", titulo: "Visitado", acento: "bg-amber-500" },
  { etapa: "Negociacion", titulo: "Negociación", acento: "bg-orange-500" },
  { etapa: "Cierre", titulo: "Cierre", acento: "bg-emerald-500" },
];
