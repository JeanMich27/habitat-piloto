import { describe, expect, it } from "vitest";
import {
  citasProximas,
  demandaDePropiedades,
  documentacionCompleta,
  mediana,
  operacionesGanadasEnPeriodo,
  tasaConversionDeCohorte,
} from "../src/lib/brokerMetrics";
import { cita, haceDias, lead, propiedad } from "./fixtures";
import { esLeadEnSeguimiento } from "../src/types";

describe("contrato de métricas del broker", () => {
  it("sólo cuenta como ganada una operación con desenlace y fecha real en el periodo", () => {
    const ahora = Date.now();
    const casos = [
      lead({ id: "etapa", etapa: "Cierre", creado: haceDias(2) }),
      lead({ id: "sin-fecha", etapa: "Cierre", estado: "Ganado", creado: haceDias(3) }),
      lead({ id: "vieja", etapa: "Cierre", estado: "Ganado", cerradoEn: haceDias(40) }),
      lead({ id: "real", etapa: "Cierre", estado: "Ganado", cerradoEn: haceDias(2) }),
    ];
    expect(operacionesGanadasEnPeriodo(casos, ahora, 31).map((item) => item.id)).toEqual([
      "real",
    ]);
  });

  it("calcula conversión sobre la cohorte completa, incluidos los descartados", () => {
    const cohorte = [
      lead({ id: "ganado", estado: "Ganado" }),
      lead({ id: "descartado", estado: "Descartado" }),
      lead({ id: "activo", estado: "Activo" }),
      lead({ id: "nuevo" }),
    ];
    expect(tasaConversionDeCohorte(cohorte)).toBe(25);
  });

  it("saca del trabajo diario tanto descartados como ganados", () => {
    expect(esLeadEnSeguimiento(lead({ id: "ganado", estado: "Ganado" }))).toBe(false);
    expect(esLeadEnSeguimiento(lead({ id: "descartado", estado: "Descartado" }))).toBe(false);
    expect(esLeadEnSeguimiento(lead({ id: "activo", estado: "Activo" }))).toBe(true);
  });

  it("usa mediana para que un caso extremo no distorsione la lectura", () => {
    expect(mediana([5, 10, 15, 1_000])).toBe(12.5);
    expect(mediana([])).toBeNull();
  });

  it("excluye de próximas citas las ya cerradas o canceladas", () => {
    const ahora = Date.now();
    const casos = [
      cita({ id: "proxima" }),
      cita({ id: "cancelada", estado: "Cancelada" }),
      cita({ id: "realizada", estado: "Realizada" }),
    ];
    expect(citasProximas(casos, ahora, 7).map((item) => item.id)).toEqual(["proxima"]);
  });

  it("separa documentación completa de un arreglo vacío", () => {
    expect(documentacionCompleta(propiedad({ id: "sin", documentos: [] }))).toBe(false);
    expect(
      documentacionCompleta(
        propiedad({ id: "lista", documentos: [{ nombre: "INE", aprobado: true }] }),
      ),
    ).toBe(true);
  });

  it("explica la demanda con señales trazables, sin fingir vistas web", () => {
    const p = propiedad({ id: "p1" });
    const demanda = demandaDePropiedades(
      [p],
      [lead({ id: "l1", interesPropiedadId: p.id, montoOferta: 3_900_000 })],
      [cita({ id: "c1", propiedadId: p.id, estado: "Realizada" })],
    )[0];
    expect(demanda).toMatchObject({ leads: 1, visitas: 1, ofertas: 1, senales: 3 });
  });
});
