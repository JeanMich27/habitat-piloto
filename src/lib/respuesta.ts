// Rangos de velocidad de primer contacto.
//
// FUENTE ÚNICA de los cortes: la gráfica de "Tu velocidad de respuesta" y el
// filtro de la pantalla de Clientes tienen que partir la cartera EXACTAMENTE
// igual. Si la barra dice 7 y la lista filtrada muestra 5, el asesor deja de
// creerle a la plataforma — y con razón.
//
// Regla de negocio: el reloj corre desde que el prospecto entró (creado)
// hasta que se registró el primer contacto (primerContactoEn). Sin primer
// contacto registrado, el prospecto cae en "sin-contactar", que es el rango
// que más dinero cuesta.
import type { Lead } from "../types";
import { minutosRespuesta } from "./metrics";

export type RangoRespuesta = "primera-hora" | "mismo-dia" | "mas-de-un-dia" | "sin-contactar";

export interface DefinicionRangoRespuesta {
  clave: RangoRespuesta;
  etiqueta: string;
  /** Clase de fondo de la barra. */
  color: string;
  /** Clases del pill que se muestra como filtro activo en Clientes. */
  pill: string;
}

export const RANGOS_RESPUESTA: DefinicionRangoRespuesta[] = [
  {
    clave: "primera-hora",
    etiqueta: "En la primera hora",
    color: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700",
  },
  {
    clave: "mismo-dia",
    etiqueta: "Mismo día (1–24 h)",
    color: "bg-amber-400",
    pill: "bg-amber-50 text-amber-700",
  },
  {
    clave: "mas-de-un-dia",
    etiqueta: "Más de un día",
    color: "bg-orange-500",
    pill: "bg-orange-50 text-orange-700",
  },
  {
    clave: "sin-contactar",
    etiqueta: "Sin contactar aún",
    color: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700",
  },
];

export const etiquetaRango = (clave: RangoRespuesta) =>
  RANGOS_RESPUESTA.find((r) => r.clave === clave)?.etiqueta ?? "";

/** En qué rango cae un prospecto. */
export function rangoDeLead(lead: Lead): RangoRespuesta {
  const min = minutosRespuesta(lead);
  if (min === null) return "sin-contactar";
  if (min <= 60) return "primera-hora";
  if (min <= 1440) return "mismo-dia";
  return "mas-de-un-dia";
}

/** Conteo por rango, listo para pintar la gráfica. */
export function conteoPorRango(leads: Lead[]): Record<RangoRespuesta, number> {
  const base: Record<RangoRespuesta, number> = {
    "primera-hora": 0,
    "mismo-dia": 0,
    "mas-de-un-dia": 0,
    "sin-contactar": 0,
  };
  leads.forEach((l) => {
    base[rangoDeLead(l)] += 1;
  });
  return base;
}
