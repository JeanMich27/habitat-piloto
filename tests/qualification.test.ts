import { describe, expect, it } from "vitest";
import {
  evaluarBant,
  puedeAvanzarAEtapa,
  preguntasBantPendientes,
} from "../src/domain/leads/qualification";
import { nivelDeLead } from "../src/lib/cartera";
import { totalesProyeccion } from "../src/lib/proyeccion";
import type { CalificacionBANT } from "../src/types";
import { bantHot, lead, propiedad } from "./fixtures";

const parcial: CalificacionBANT = {
  ...bantHot,
  autoridad: "",
  necesidad: "",
  plazo: "",
};

describe("fuente única de calificación BANT", () => {
  it("distingue vacío, solo presupuesto, parcial y completo", () => {
    expect(evaluarBant().estado).toBe("vacio");
    expect(evaluarBant({ ...parcial, presupuesto: "" }).estado).toBe("vacio");
    expect(evaluarBant(parcial)).toMatchObject({
      estado: "parcial",
      calificado: false,
      puntaje: null,
      clasificacion: null,
    });
    expect(preguntasBantPendientes(parcial)).toEqual(["autoridad", "necesidad", "plazo"]);
    expect(evaluarBant({ ...parcial, autoridad: "decide" }).estado).toBe("parcial");
    expect(evaluarBant(bantHot)).toMatchObject({
      estado: "completo",
      calificado: true,
      puntaje: 100,
      clasificacion: "Hot",
    });
  });

  it("rechaza opciones fuera de catálogo en vez de convertirlas en cero puntos", () => {
    expect(evaluarBant({ ...bantHot, presupuesto: "valor_inventado" })).toMatchObject({
      estado: "invalido",
      invalidos: ["presupuesto"],
      calificado: false,
      puntaje: null,
    });
  });

  it("perder una respuesta quita nivel y bloquea las etapas avanzadas", () => {
    expect(puedeAvanzarAEtapa(bantHot, "Cierre")).toBe(true);
    const degradado = { ...bantHot, plazo: "" };
    expect(evaluarBant(degradado).estado).toBe("parcial");
    expect(puedeAvanzarAEtapa(degradado, "Visitado")).toBe(false);
    expect(puedeAvanzarAEtapa(degradado, "Negociacion")).toBe(false);
    expect(puedeAvanzarAEtapa(degradado, "Cierre")).toBe(false);
    expect(puedeAvanzarAEtapa(degradado, "Contactado")).toBe(true);
  });

  it("pipeline, cartera y proyección aplican la misma definición", () => {
    const p = propiedad({ id: "p-1", precio: 1_000_000, comisionTipo: "porcentaje", comisionValor: 5 });
    const completo = lead({ id: "completo", bant: bantHot, interesPropiedadId: p.id });
    const incompleto = lead({ id: "parcial", bant: parcial, interesPropiedadId: p.id });

    expect(nivelDeLead(completo)).toBe("Hot");
    expect(nivelDeLead(incompleto)).toBe("sin");
    const totales = totalesProyeccion([completo, incompleto], [p]);
    expect(totales).toMatchObject({ calificados: 1, sinCalificar: 1, brutoTotal: 100_000 });
    expect(totales.ponderadoTotal).toBe(50_000);
  });
});
