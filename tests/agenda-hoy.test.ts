// Consultas de agenda que comparten el badge del menú y la franja "tu día"
// del dashboard. Un solo cálculo: si se separan, el badge dice 3 y el
// dashboard 2, y el asesor deja de confiar en el número.
import { describe, expect, it } from "vitest";
import { citasDeHoy, esCitaAbierta, proximaCita } from "../src/lib/agenda";
import { cita } from "./fixtures";

/** Hora local fija del "ahora" simulado, para no depender del reloj real. */
const ahora = new Date(2026, 7, 18, 12, 0, 0); // 18 ago 2026, 12:00 local
const aLasHoras = (h: number, dia = 18) =>
  new Date(2026, 7, dia, h, 0, 0).toISOString();

describe("esCitaAbierta", () => {
  it("solo cuentan las que todavía pueden pasar", () => {
    expect(esCitaAbierta(cita({ id: "a", estado: "Agendada" }))).toBe(true);
    expect(esCitaAbierta(cita({ id: "b", estado: "Confirmada" }))).toBe(true);
    expect(esCitaAbierta(cita({ id: "c", estado: "Cancelada" }))).toBe(false);
    expect(esCitaAbierta(cita({ id: "d", estado: "Realizada" }))).toBe(false);
    expect(esCitaAbierta(cita({ id: "e", estado: "No asistió" }))).toBe(false);
  });
});

describe("citasDeHoy", () => {
  const citas = [
    cita({ id: "manana-temprano", inicio: aLasHoras(9), fin: aLasHoras(10) }),
    cita({ id: "tarde", inicio: aLasHoras(19), fin: aLasHoras(20) }),
    cita({ id: "ayer", inicio: aLasHoras(11, 17), fin: aLasHoras(12, 17) }),
    cita({ id: "manana", inicio: aLasHoras(11, 19), fin: aLasHoras(12, 19) }),
    cita({ id: "cancelada-hoy", inicio: aLasHoras(15), estado: "Cancelada" }),
    cita({ id: "de-otro", inicio: aLasHoras(16), asesorId: "u-otro" }),
  ];

  it("devuelve solo las abiertas del día local del asesor, ordenadas", () => {
    const hoy = citasDeHoy(citas, "u-asesor", ahora);
    expect(hoy.map((c) => c.id)).toEqual(["manana-temprano", "tarde"]);
  });

  it("una cita nocturna cuenta HOY aunque en UTC caiga mañana", () => {
    // 7 p.m. en México (UTC-6) es la 1 a.m. del día siguiente en UTC:
    // comparar el prefijo del ISO la mandaba a mañana. Esta es la regresión.
    const nocturna = citas.find((c) => c.id === "tarde")!;
    expect(nocturna.inicio.slice(0, 10)).not.toBe("2026-08-18"); // ya es 19 en UTC
    expect(citasDeHoy([nocturna], "u-asesor", ahora)).toHaveLength(1);
  });

  it("sin asesorId devuelve las de toda la oficina (vista del broker)", () => {
    expect(citasDeHoy(citas, undefined, ahora).map((c) => c.id)).toEqual([
      "manana-temprano",
      "de-otro",
      "tarde",
    ]);
  });
});

describe("proximaCita", () => {
  it("es la más cercana que todavía no empieza", () => {
    const citas = [
      cita({ id: "ya-paso", inicio: aLasHoras(9), fin: aLasHoras(10) }),
      cita({ id: "hoy-tarde", inicio: aLasHoras(17), fin: aLasHoras(18) }),
      cita({ id: "manana", inicio: aLasHoras(9, 19), fin: aLasHoras(10, 19) }),
    ];
    expect(proximaCita(citas, "u-asesor", ahora)?.id).toBe("hoy-tarde");
  });

  it("puede ser de otro día si hoy ya no queda nada", () => {
    const citas = [
      cita({ id: "ya-paso", inicio: aLasHoras(9), fin: aLasHoras(10) }),
      cita({ id: "manana", inicio: aLasHoras(9, 19), fin: aLasHoras(10, 19) }),
    ];
    expect(proximaCita(citas, "u-asesor", ahora)?.id).toBe("manana");
  });

  it("devuelve null cuando no hay nada por delante", () => {
    const citas = [cita({ id: "ya-paso", inicio: aLasHoras(9), fin: aLasHoras(10) })];
    expect(proximaCita(citas, "u-asesor", ahora)).toBeNull();
  });

  it("ignora canceladas y las de otros asesores", () => {
    const citas = [
      cita({ id: "cancelada", inicio: aLasHoras(14), estado: "Cancelada" }),
      cita({ id: "ajena", inicio: aLasHoras(15), asesorId: "u-otro" }),
      cita({ id: "mia", inicio: aLasHoras(16) }),
    ];
    expect(proximaCita(citas, "u-asesor", ahora)?.id).toBe("mia");
  });
});
