// Totales de la proyección de cierres y comisiones.
//
// ÚNICA fuente de estos números para la tarjeta del dashboard y la sección
// de Análisis: si el cálculo cambia, cambia en un solo lugar y las dos
// pantallas siempre muestran lo mismo.
//
// Misma regla que ProyeccionComisiones: NO SE INVENTA NINGÚN NÚMERO.
//   · Valor de la operación → monto de oferta, o precio real de la propiedad
//     de interés. Sin ninguno de los dos, el prospecto no entra.
//   · Comisión bruta → fórmula compartida de lib/comisiones (la tarifa
//     pactada en el CRM manda sobre los defaults).
//   · Ponderada → bruta × (puntaje BANT / 100). Sin calificar aporta 0.
import type { Lead, Propiedad } from "../types";
import { evaluarBant } from "../domain/leads/qualification";
import {
  MESES_RENTA_DEFAULT,
  PCT_VENTA_DEFAULT,
  comisionBase,
  redondearDinero,
  tarifaDePropiedad,
  valorOperacionDeLead,
} from "./comisiones";

export interface TotalesProyeccion {
  /** Suma del valor real de las operaciones (ofertas o precios de lista). */
  valorCartera: number;
  /** Comisión si el 100% de la cartera cerrara. */
  brutoTotal: number;
  /** Comisión pesada por el puntaje BANT capturado. */
  ponderadoTotal: number;
  /** Prospectos que sí entran al cálculo (tienen valor asociado). */
  prospectosConValor: number;
  calificados: number;
  sinCalificar: number;
  /** Prospectos fuera del cálculo por no tener propiedad/oferta. */
  sinValor: number;
}

export function totalesProyeccion(
  leads: Lead[],
  propiedades: Propiedad[],
  pctVenta = PCT_VENTA_DEFAULT,
  mesesRenta = MESES_RENTA_DEFAULT,
): TotalesProyeccion {
  let valorCartera = 0;
  let brutoTotal = 0;
  let ponderadoTotal = 0;
  let prospectosConValor = 0;
  let calificados = 0;

  leads.forEach((l) => {
    const prop = propiedades.find((p) => p.id === l.interesPropiedadId);
    const valor = valorOperacionDeLead(l, prop);
    if (valor <= 0) return;

    const tarifa = tarifaDePropiedad(prop);
    const comision = comisionBase({
      valor,
      tipoOperacion: prop?.tipoOperacion ?? "Venta",
      pctVenta: tarifa.delCrm ? tarifa.pctVenta : pctVenta,
      mesesRenta: tarifa.delCrm ? tarifa.mesesRenta : mesesRenta,
    });

    const puntaje = evaluarBant(l.bant).puntaje;
    prospectosConValor += 1;
    valorCartera += valor;
    brutoTotal += comision;
    if (puntaje !== null) {
      calificados += 1;
      ponderadoTotal += (comision * puntaje) / 100;
    }
  });

  return {
    valorCartera: redondearDinero(valorCartera),
    brutoTotal: redondearDinero(brutoTotal),
    ponderadoTotal: redondearDinero(ponderadoTotal),
    prospectosConValor,
    calificados,
    sinCalificar: prospectosConValor - calificados,
    sinValor: leads.length - prospectosConValor,
  };
}
