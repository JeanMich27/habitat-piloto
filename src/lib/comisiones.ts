// Única fuente de verdad para calcular la comisión de una operación.
//
// Venta y renta NO se calculan igual, y tratarlas igual subestima la renta
// por un factor enorme: una renta de $18,000 al 5% da $900, cuando la
// comisión real de mercado en México es típicamente un mes completo de
// renta ($18,000). Es una diferencia de 20x.
//
// Convención por defecto:
//   · Venta → un porcentaje sobre el precio del inmueble.
//   · Renta → un número de meses de renta (habitualmente 1; algunas
//     operaciones usan 0.5 en rentas cortas o 2 en corporativas).
//
// Ambos parámetros son editables por el usuario: no son supuestos ocultos.
import type { TipoOperacion } from "../types";

export const PCT_VENTA_DEFAULT = 5;
export const MESES_RENTA_DEFAULT = 1;

export interface ParametrosComision {
  /** Precio de venta, o renta MENSUAL si la operación es de renta. */
  valor: number;
  tipoOperacion: TipoOperacion;
  /** % sobre el precio. Solo aplica a venta. */
  pctVenta: number;
  /** Meses de renta que cobra la agencia. Solo aplica a renta. */
  mesesRenta: number;
}

/** Comisión bruta de la operación, antes de IVA y antes de repartir. */
export function comisionBase({
  valor,
  tipoOperacion,
  pctVenta,
  mesesRenta,
}: ParametrosComision): number {
  if (valor <= 0) return 0;
  return tipoOperacion === "Renta" ? valor * mesesRenta : (valor * pctVenta) / 100;
}

/**
 * Tarifa pactada de una propiedad concreta.
 *
 * Si el CRM la trae (EasyBroker la entrega por propiedad: `commission`), esa
 * manda — es el acuerdo real con el propietario, no un promedio. Solo cuando
 * no existe se cae a los valores por defecto.
 */
export function tarifaDePropiedad(p?: {
  tipoOperacion?: TipoOperacion;
  comisionTipo?: "porcentaje" | "meses";
  comisionValor?: number;
}): { pctVenta: number; mesesRenta: number; delCrm: boolean } {
  if (p?.comisionValor != null && p.comisionTipo) {
    return p.comisionTipo === "meses"
      ? { pctVenta: PCT_VENTA_DEFAULT, mesesRenta: p.comisionValor, delCrm: true }
      : { pctVenta: p.comisionValor, mesesRenta: MESES_RENTA_DEFAULT, delCrm: true };
  }
  return { pctVenta: PCT_VENTA_DEFAULT, mesesRenta: MESES_RENTA_DEFAULT, delCrm: false };
}

/** Cómo se le explica al usuario de dónde salió la cifra. */
export function explicacionComision(p: ParametrosComision): string {
  if (p.tipoOperacion === "Renta") {
    const m = p.mesesRenta;
    return `${m} ${m === 1 ? "mes" : "meses"} de renta`;
  }
  return `${p.pctVenta}% del precio`;
}
