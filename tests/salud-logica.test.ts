// Lógica compartida entre las gráficas de Salud inmobiliaria y los filtros
// de las pantallas destino.
//
// Lo que se protege aquí: que la barra y la lista filtrada partan la cartera
// EXACTAMENTE igual. Si estos cortes se desincronizan, el asesor ve "7" en la
// gráfica y 5 registros en la lista, y deja de creerle a la plataforma.
import { describe, expect, it } from "vitest";
import { ANTIGUEDAD_LEYENDA, antiguedadDe } from "../src/lib/antiguedad";
import {
  NIVELES_CARTERA,
  claseParaFiltro,
  conteoPorNivel,
  estiloNivelCartera,
  nivelDeLead,
} from "../src/lib/cartera";
import { RANGOS_RESPUESTA, conteoPorRango, rangoDeLead } from "../src/lib/respuesta";
import { bantCold, bantHot, bantWarm, haceDias, haceMinutos, lead, propiedad } from "./fixtures";

describe("niveles de cartera (Hot / Warm / Cold / sin calificar)", () => {
  it("clasifica por puntaje BANT y trata la ausencia de BANT como 'sin'", () => {
    expect(nivelDeLead(lead({ id: "a", bant: bantHot }))).toBe("Hot");
    expect(nivelDeLead(lead({ id: "b", bant: bantWarm }))).toBe("Warm");
    expect(nivelDeLead(lead({ id: "c", bant: bantCold }))).toBe("Cold");
    expect(nivelDeLead(lead({ id: "d" }))).toBe("sin");
  });

  it("el conteo por nivel suma exactamente el total de la cartera", () => {
    const leads = [
      lead({ id: "a", bant: bantHot }),
      lead({ id: "b", bant: bantHot }),
      lead({ id: "c", bant: bantWarm }),
      lead({ id: "d", bant: bantCold }),
      lead({ id: "e" }),
    ];
    const conteo = conteoPorNivel(leads);
    expect(conteo).toEqual({ Hot: 2, Warm: 1, Cold: 1, sin: 1 });
    const suma = Object.values(conteo).reduce((a, b) => a + b, 0);
    expect(suma).toBe(leads.length);
  });

  it("cada nivel tiene icono y color propios (la leyenda no depende del texto)", () => {
    expect(NIVELES_CARTERA).toHaveLength(4);
    NIVELES_CARTERA.forEach((n) => {
      expect(n.Icono).toBeTruthy();
      expect(n.color).toMatch(/^#[0-9a-f]{6}$/i);
    });
    const iconos = new Set(NIVELES_CARTERA.map((n) => n.Icono));
    expect(iconos.size).toBe(4);
  });

  it("traduce el nivel al valor que espera el filtro de Clientes", () => {
    expect(claseParaFiltro("Hot")).toBe("Hot");
    expect(claseParaFiltro("sin")).toBe("Sin calificar");
  });

  it("estiloNivelCartera nunca revienta con una clave desconocida", () => {
    expect(estiloNivelCartera("Warm").etiqueta).toBe("Warm");
    // @ts-expect-error — se prueba a propósito una clave fuera del tipo.
    expect(estiloNivelCartera("otro").clave).toBe("sin");
  });
});

describe("rangos de velocidad de primer contacto", () => {
  it("respeta los cortes de 1 hora y 24 horas, con los bordes incluidos", () => {
    // Fechas fijas: los bordes (60 min y 1440 min exactos) no se pueden probar
    // con "hace N minutos" porque cada llamada lee el reloj otra vez y el
    // desfase de milisegundos cruzaría el corte de forma intermitente.
    const t0 = new Date("2026-08-01T10:00:00.000Z").toISOString();
    const conDesfase = (min: number) =>
      new Date(new Date(t0).getTime() + min * 60000).toISOString();

    const bordeUnaHora = lead({ id: "a", creado: t0, primerContactoEn: conDesfase(60) });
    const justoDespues = lead({ id: "a2", creado: t0, primerContactoEn: conDesfase(61) });
    const bordeUnDia = lead({ id: "b", creado: t0, primerContactoEn: conDesfase(1440) });
    const tarde = lead({ id: "c", creado: t0, primerContactoEn: conDesfase(1441) });
    const nunca = lead({ id: "d" });

    expect(rangoDeLead(bordeUnaHora)).toBe("primera-hora");
    expect(rangoDeLead(justoDespues)).toBe("mismo-dia");
    expect(rangoDeLead(bordeUnDia)).toBe("mismo-dia");

    expect(rangoDeLead(tarde)).toBe("mas-de-un-dia");
    expect(rangoDeLead(nunca)).toBe("sin-contactar");
  });

  it("el conteo por rango suma el total y no pierde a nadie", () => {
    const leads = [
      lead({ id: "a", creado: haceMinutos(90), primerContactoEn: haceMinutos(60) }),
      lead({ id: "b", creado: haceDias(3), primerContactoEn: haceDias(2.8) }),
      lead({ id: "c", creado: haceDias(9), primerContactoEn: haceDias(3) }),
      lead({ id: "d" }),
      lead({ id: "e" }),
    ];
    const conteo = conteoPorRango(leads);
    expect(conteo["sin-contactar"]).toBe(2);
    expect(Object.values(conteo).reduce((a, b) => a + b, 0)).toBe(leads.length);
  });

  it("los cuatro rangos de la gráfica son los mismos del filtro", () => {
    expect(RANGOS_RESPUESTA.map((r) => r.clave)).toEqual([
      "primera-hora",
      "mismo-dia",
      "mas-de-un-dia",
      "sin-contactar",
    ]);
  });
});

describe("antigüedad de inventario", () => {
  it("clasifica en los rangos que muestra la gráfica (1–2, 3–4, 5–6, +6 meses)", () => {
    expect(antiguedadDe(propiedad({ id: "p1", publicadaEl: haceDias(20) })).nivel).toBe("verde");
    expect(antiguedadDe(propiedad({ id: "p2", publicadaEl: haceDias(100) })).nivel).toBe("amarillo");
    expect(antiguedadDe(propiedad({ id: "p3", publicadaEl: haceDias(160) })).nivel).toBe("naranja");
    expect(antiguedadDe(propiedad({ id: "p4", publicadaEl: haceDias(400) })).nivel).toBe("rojo");
  });

  it("una propiedad sin publicar usa la fecha de captura y se marca como estimada", () => {
    const p = propiedad({ id: "p5", publicadaEl: undefined, capturadaEl: haceDias(20) });
    expect(antiguedadDe(p).estimada).toBe(true);
    expect(antiguedadDe(p).nivel).toBe("verde");
  });

  it("la leyenda cubre los cuatro niveles, sin huecos ni duplicados", () => {
    expect(ANTIGUEDAD_LEYENDA.map((l) => l.nivel)).toEqual([
      "verde",
      "amarillo",
      "naranja",
      "rojo",
    ]);
  });
});
