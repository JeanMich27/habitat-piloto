// Niveles de calificación de cartera (Hot / Warm / Cold / Sin calificar).
//
// FUENTE ÚNICA de cómo se ve un nivel en toda la app: color, pill, icono y
// etiqueta. Antes cada pantalla repetía sus propios colores y el usuario veía
// "Hot" en tres tonos distintos de verde. Si mañana cambia la escala, cambia
// aquí y se enteran todas las pantallas.
//
// Los iconos son metáfora de temperatura (llama / sol / copo / interrogación):
// el asesor entiende el nivel sin leer la palabra, que es justo el punto —
// en móvil la etiqueta de texto es lo primero que se pierde.
import { Flame, HelpCircle, Snowflake, Sun, type LucideIcon } from "lucide-react";
import type { ClasificacionLead, Lead } from "../types";
import { evaluarBant } from "../domain/leads/qualification";

/** "sin" = prospecto sin calificación BANT capturada. */
export type NivelCartera = ClasificacionLead | "sin";

export interface EstiloNivelCartera {
  clave: NivelCartera;
  /** Nombre corto que se muestra junto al icono. */
  etiqueta: string;
  /** Rango de puntaje, para el tooltip / leyenda larga. */
  rango: string;
  /** Qué hacer con estos clientes: la calificación sin acción no sirve. */
  accion: string;
  /** Color hexadecimal — lo consume el SVG del donut. */
  color: string;
  /** Clases del pill (fondo + texto). */
  pill: string;
  /** Clase de color del icono. */
  iconoColor: string;
  Icono: LucideIcon;
}

export const NIVELES_CARTERA: EstiloNivelCartera[] = [
  {
    clave: "Hot",
    etiqueta: "Hot",
    rango: "80–100 pts",
    accion: "Listos para cerrar: van en tu agenda de hoy.",
    color: "#10b981",
    pill: "bg-emerald-50 text-emerald-700",
    iconoColor: "text-emerald-600",
    Icono: Flame,
  },
  {
    clave: "Warm",
    etiqueta: "Warm",
    rango: "50–79 pts",
    accion: "Necesitan seguimiento constante para madurar.",
    color: "#f59e0b",
    pill: "bg-amber-50 text-amber-700",
    iconoColor: "text-amber-500",
    Icono: Sun,
  },
  {
    clave: "Cold",
    etiqueta: "Cold",
    rango: "0–49 pts",
    accion: "Aún lejos de comprar: nutrición, no llamadas diarias.",
    color: "#38bdf8",
    pill: "bg-sky-50 text-sky-700",
    iconoColor: "text-sky-500",
    Icono: Snowflake,
  },
  {
    clave: "sin",
    etiqueta: "Sin calificar",
    rango: "sin datos",
    accion: "No sabes nada de ellos: califícalos y tu proyección se vuelve confiable.",
    color: "#cbd5e1",
    pill: "bg-slate-100 text-slate-600",
    iconoColor: "text-slate-500",
    Icono: HelpCircle,
  },
];

export const estiloNivelCartera = (clave: NivelCartera): EstiloNivelCartera =>
  NIVELES_CARTERA.find((n) => n.clave === clave) ?? NIVELES_CARTERA[3];

/**
 * Traduce el nivel al valor que usa el filtro de la pantalla de Clientes.
 * Ese select ya existía con la etiqueta "Sin calificar"; en vez de cambiarlo
 * (y romper lo que el asesor ya conoce) se traduce aquí, en un solo lugar.
 */
export function claseParaFiltro(nivel: NivelCartera): ClasificacionLead | "Sin calificar" {
  return nivel === "sin" ? "Sin calificar" : nivel;
}

/** Nivel de un prospecto. Sin BANT capturado devuelve "sin". */
export function nivelDeLead(lead: Lead): NivelCartera {
  return evaluarBant(lead.bant).clasificacion ?? "sin";
}

/** Conteo por nivel, en el mismo orden de NIVELES_CARTERA. */
export function conteoPorNivel(leads: Lead[]): Record<NivelCartera, number> {
  const base: Record<NivelCartera, number> = { Hot: 0, Warm: 0, Cold: 0, sin: 0 };
  leads.forEach((l) => {
    base[nivelDeLead(l)] += 1;
  });
  return base;
}
