// Termómetro de antigüedad de una propiedad en el sistema.
//
// Regla de negocio (definida con Jean, ago 2026):
//   verde    → 1 a 2 meses publicada
//   amarillo → 3 a 4 meses
//   naranja  → 5 a 6 meses
//   rojo     → más de 6 meses
//
// Fecha base: publicadaEl (cuando pasó a Activa). Si aún no se publica,
// se usa capturadaEl como respaldo para que toda tarjeta tenga termómetro.
import type { Propiedad } from "../types";

export type NivelAntiguedad = "verde" | "amarillo" | "naranja" | "rojo";

export interface Antiguedad {
  dias: number;
  meses: number; // redondeado hacia arriba: 45 días = "2 meses"
  nivel: NivelAntiguedad;
  etiqueta: string;
  /** true si el cálculo usó capturadaEl porque no hay publicadaEl */
  estimada: boolean;
}

const MS_DIA = 1000 * 60 * 60 * 24;
const DIAS_MES = 30.44;

export function antiguedadDe(p: Propiedad, ahora = Date.now()): Antiguedad {
  const base = p.publicadaEl ?? p.capturadaEl;
  const dias = Math.max(0, Math.floor((ahora - new Date(base).getTime()) / MS_DIA));
  const meses = Math.max(1, Math.ceil(dias / DIAS_MES));
  const nivel: NivelAntiguedad =
    meses <= 2 ? "verde" : meses <= 4 ? "amarillo" : meses <= 6 ? "naranja" : "rojo";
  const etiqueta = dias < 31 ? `${dias} día${dias === 1 ? "" : "s"}` : `${meses} meses`;
  return { dias, meses, nivel, etiqueta, estimada: !p.publicadaEl };
}

/* Clases Tailwind por nivel. Centralizadas para que tarjeta, tabla y
   detalle usen exactamente los mismos colores. */
export const ANTIGUEDAD_ESTILOS: Record<
  NivelAntiguedad,
  { ring: string; pill: string; punto: string; barra: string }
> = {
  verde: {
    ring: "ring-emerald-400/70",
    pill: "bg-emerald-50/90 text-emerald-700",
    punto: "bg-emerald-500",
    barra: "bg-emerald-400",
  },
  amarillo: {
    ring: "ring-yellow-400/80",
    pill: "bg-yellow-50/90 text-yellow-700",
    punto: "bg-yellow-400",
    barra: "bg-yellow-400",
  },
  naranja: {
    ring: "ring-orange-400/80",
    pill: "bg-orange-50/90 text-orange-700",
    punto: "bg-orange-500",
    barra: "bg-orange-400",
  },
  rojo: {
    ring: "ring-rose-500/70",
    pill: "bg-rose-50/90 text-rose-700",
    punto: "bg-rose-500",
    barra: "bg-rose-500",
  },
};

export const ANTIGUEDAD_LEYENDA: { nivel: NivelAntiguedad; texto: string }[] = [
  { nivel: "verde", texto: "1–2 meses" },
  { nivel: "amarillo", texto: "3–4 meses" },
  { nivel: "naranja", texto: "5–6 meses" },
  { nivel: "rojo", texto: "+6 meses" },
];
