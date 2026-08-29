import { describe, expect, it } from "vitest";
import { construirBandejaClientes } from "../src/domain/clients/attention";
import type { Operacion, Tarea, Usuario } from "../src/types";
import { asesor, bantHot, lead } from "./fixtures";

const AHORA = Date.parse("2026-08-29T16:00:00Z"); // 10:00 en Ciudad de México

const broker: Usuario = {
  ...asesor,
  id: "u-broker",
  rol: "broker",
  nombre: "Broker",
};

const tarea = (over: Partial<Tarea> & { id: string; leadId: string; venceEn: string }): Tarea => ({
  asesorId: "u-asesor",
  titulo: "Llamar al cliente",
  estado: "pendiente",
  creadaEn: "2026-08-28T12:00:00Z",
  metadata: {},
  ...over,
});

const operacion = (over: Partial<Operacion> & { id: string; leadId: string }): Operacion => ({
  version: 1,
  estadoValidacion: "reportada",
  reportadoPor: "u-asesor",
  reportadoEn: "2026-08-29T15:00:00Z",
  moneda: "MXN",
  datosReportadosOriginales: {},
  historialRevisiones: [],
  ...over,
});

describe("construirBandejaClientes", () => {
  it("asigna cada cliente a una sola bandeja y los conteos cuadran", () => {
    const leads = [
      lead({ id: "nuevo", creado: "2026-08-29T15:30:00Z" }),
      lead({ id: "seguimiento", primerContactoEn: "2026-08-28T15:00:00Z", etapa: "Contactado" }),
      lead({ id: "ganado", estado: "Ganado", primerContactoEn: "2026-08-20T15:00:00Z" }),
      lead({ id: "contacto", esDirectorio: true }),
      lead({ id: "archivo", esHistorico: true }),
    ];
    const resultado = construirBandejaClientes({ leads, tareas: [], operaciones: [], usuario: asesor, ahora: AHORA });

    expect(resultado.clientes).toHaveLength(leads.length);
    expect(new Set(resultado.clientes.map((item) => item.lead.id)).size).toBe(leads.length);
    expect(
      resultado.conteos.porAtender + resultado.conteos.enSeguimiento +
      resultado.conteos.cerrados + resultado.conteos.contactos + resultado.conteos.archivo,
    ).toBe(leads.length);
  });

  it("un seguimiento vencido gana sobre En seguimiento", () => {
    const cliente = lead({ id: "vencido", primerContactoEn: "2026-08-28T15:00:00Z", etapa: "Contactado" });
    const resultado = construirBandejaClientes({
      leads: [cliente],
      tareas: [tarea({ id: "t-1", leadId: cliente.id, venceEn: "2026-08-29T14:00:00Z" })],
      operaciones: [],
      usuario: asesor,
      ahora: AHORA,
    });
    expect(resultado.clientes[0]).toMatchObject({ bandeja: "por_atender", motivo: "seguimiento_vencido" });
    expect(resultado.conteos.vencidos).toBe(1);
  });

  it("una tarea posterior a hoy queda En seguimiento", () => {
    const cliente = lead({ id: "futuro", primerContactoEn: "2026-08-28T15:00:00Z", etapa: "Contactado" });
    const resultado = construirBandejaClientes({
      leads: [cliente],
      tareas: [tarea({ id: "t-2", leadId: cliente.id, venceEn: "2026-08-31T16:00:00Z" })],
      operaciones: [],
      usuario: asesor,
      ahora: AHORA,
    });
    expect(resultado.clientes[0]).toMatchObject({ bandeja: "en_seguimiento", motivo: "seguimiento_programado" });
  });

  it("la operación reportada exige acción al broker pero no al asesor", () => {
    const cliente = lead({ id: "cierre", primerContactoEn: "2026-08-20T15:00:00Z", etapa: "Cierre" });
    const cierre = operacion({ id: "op-1", leadId: cliente.id });
    const paraBroker = construirBandejaClientes({ leads: [cliente], tareas: [], operaciones: [cierre], usuario: broker, ahora: AHORA });
    const paraAsesor = construirBandejaClientes({ leads: [cliente], tareas: [], operaciones: [cierre], usuario: asesor, ahora: AHORA });
    expect(paraBroker.clientes[0]).toMatchObject({ bandeja: "por_atender", motivo: "cierre_por_validar" });
    expect(paraBroker.conteos.cierresPorValidar).toBe(1);
    expect(paraAsesor.clientes[0]).toMatchObject({ bandeja: "en_seguimiento" });
  });

  it("Alta prioridad significa BANT completo Hot y no promete un cierre", () => {
    const hot = lead({ id: "hot", bant: bantHot, primerContactoEn: "2026-08-28T15:00:00Z" });
    const cerrado = lead({ id: "hot-cerrado", bant: bantHot, estado: "Ganado" });
    const resultado = construirBandejaClientes({ leads: [hot, cerrado], tareas: [], operaciones: [], usuario: asesor, ahora: AHORA });
    expect(resultado.conteos.altaPrioridad).toBe(1);
    expect(resultado.clientes.find((item) => item.lead.id === hot.id)?.altaPrioridad).toBe(true);
    expect(resultado.clientes.find((item) => item.lead.id === cerrado.id)?.altaPrioridad).toBe(false);
  });
});
