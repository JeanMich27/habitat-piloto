import { describe, expect, it } from "vitest";
import {
  MESES_RENTA_DEFAULT,
  PCT_VENTA_DEFAULT,
  comisionBase,
  finanzasDeLead,
  tarifaDePropiedad,
} from "../src/lib/comisiones";
import { totalesProyeccion } from "../src/lib/proyeccion";
import { bantHot, lead, propiedad } from "./fixtures";
import type { Operacion } from "../src/types";

describe("reglas monetarias únicas", () => {
  it("calcula venta por porcentaje y renta por meses", () => {
    expect(comisionBase({ valor: 1_000_000, tipoOperacion: "Venta", pctVenta: 5, mesesRenta: 1 })).toBe(50_000);
    expect(comisionBase({ valor: 18_000, tipoOperacion: "Renta", pctVenta: 5, mesesRenta: 1 })).toBe(18_000);
  });

  it("respeta tarifa personalizada, comisión cero y defaults cuando no está definida", () => {
    expect(tarifaDePropiedad({ comisionTipo: "porcentaje", comisionValor: 3.25 })).toEqual({
      pctVenta: 3.25,
      mesesRenta: MESES_RENTA_DEFAULT,
      delCrm: true,
    });
    expect(tarifaDePropiedad({ comisionTipo: "porcentaje", comisionValor: 0 }).pctVenta).toBe(0);
    expect(tarifaDePropiedad()).toEqual({
      pctVenta: PCT_VENTA_DEFAULT,
      mesesRenta: MESES_RENTA_DEFAULT,
      delCrm: false,
    });
  });

  it("redondea cantidades decimales a centavos y falla cerrado con límites inválidos", () => {
    expect(comisionBase({ valor: 999.99, tipoOperacion: "Venta", pctVenta: 3.333, mesesRenta: 1 })).toBe(33.33);
    expect(comisionBase({ valor: -1, tipoOperacion: "Venta", pctVenta: 5, mesesRenta: 1 })).toBe(0);
    expect(comisionBase({ valor: Number.NaN, tipoOperacion: "Venta", pctVenta: 5, mesesRenta: 1 })).toBe(0);
    expect(comisionBase({ valor: 100, tipoOperacion: "Venta", pctVenta: -5, mesesRenta: 1 })).toBe(0);
  });

  it("separa ingreso esperado de confirmado según el cierre", () => {
    const p = propiedad({ id: "p", precio: 2_000_000, comisionTipo: "porcentaje", comisionValor: 3 });
    const negociacion = finanzasDeLead(lead({ id: "n", etapa: "Negociacion", interesPropiedadId: p.id }), p);
    const procesoCierre = finanzasDeLead(lead({ id: "pc", etapa: "Cierre", interesPropiedadId: p.id }), p);
    const operacion: Operacion = {
      id: "op-c", version: 1, leadId: "c", propiedadId: p.id,
      estadoValidacion: "validada", reportadoPor: "asesor", reportadoEn: new Date().toISOString(),
      tipoOperacion: "Venta", fechaCierre: new Date().toISOString(), moneda: "MXN",
      comisionBrutaConfirmada: 55_000, datosReportadosOriginales: {}, historialRevisiones: [],
    };
    const cierre = finanzasDeLead(lead({ id: "c", etapa: "Cierre", estado: "Ganado", interesPropiedadId: p.id }), p, operacion);
    const ingresoPendiente = finanzasDeLead(
      lead({ id: "cp", etapa: "Cierre", estado: "Ganado", interesPropiedadId: p.id }),
      p,
      { ...operacion, id: "op-cp", leadId: "cp", comisionBrutaConfirmada: undefined },
    );
    expect(negociacion).toMatchObject({ cerrada: false, ingresoEsperado: 60_000, ingresoConfirmado: 0 });
    expect(procesoCierre).toMatchObject({ cerrada: false, ingresoEsperado: 60_000, ingresoConfirmado: 0 });
    expect(cierre).toMatchObject({ cerrada: true, ingresoEsperado: 60_000, ingresoConfirmado: 55_000, ingresoPendiente: false });
    expect(ingresoPendiente).toMatchObject({ cerrada: true, ingresoConfirmado: 0, ingresoPendiente: true });
  });

  it("proyección consume la misma tarifa real de cada propiedad", () => {
    const venta = propiedad({ id: "venta", precio: 1_000_000, comisionTipo: "porcentaje", comisionValor: 3 });
    const renta = propiedad({ id: "renta", precio: 20_000, tipoOperacion: "Renta", comisionTipo: "meses", comisionValor: 1.5 });
    const resultado = totalesProyeccion(
      [
        lead({ id: "v", interesPropiedadId: venta.id, bant: bantHot }),
        lead({ id: "r", interesPropiedadId: renta.id, bant: bantHot }),
      ],
      [venta, renta],
    );
    expect(resultado).toMatchObject({ brutoTotal: 60_000, ponderadoTotal: 60_000 });
  });
});
