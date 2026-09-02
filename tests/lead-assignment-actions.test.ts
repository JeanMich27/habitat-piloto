import { describe, expect, it, vi } from "vitest";
import { createLeadAssignmentActions } from "../src/app/application/leadAssignmentActions";
import type { CitaAgenda, Lead, Tarea, Usuario } from "../src/types";
import { cita, enMinutosISO, lead } from "./fixtures";

const broker: Usuario = {
  id: "u-broker", nombre: "Broker", correo: "broker@test.mx", telefono: "",
  rol: "broker", puesto: "Broker", iniciales: "BR", estadoCuenta: "Activo",
};
const destino: Usuario = {
  id: "u-destino", nombre: "Destino", correo: "destino@test.mx", telefono: "",
  rol: "asesor_equipo", puesto: "Asesor", iniciales: "DE", estadoCuenta: "Activo",
};

const pendiente: Tarea = {
  id: "t-1", leadId: "l-1", asesorId: "u-asesor", titulo: "Seguimiento",
  estado: "pendiente", venceEn: enMinutosISO(60), creadaEn: enMinutosISO(-60), metadata: {},
};

function setup(currentUser = broker) {
  let leads: Lead[] = [lead({ id: "l-1", asesorId: "u-asesor", captadoPorId: "u-asesor" })];
  let tasks: Tarea[] = [pendiente, { ...pendiente, id: "t-2", estado: "completada" }];
  let appointments: CitaAgenda[] = [
    cita({ id: "c-futura", leadId: "l-1", asesorId: "u-asesor" }),
    cita({ id: "c-pasada", leadId: "l-1", asesorId: "u-asesor", inicio: enMinutosISO(-120), fin: enMinutosISO(-60) }),
  ];
  const setLeads = vi.fn((updater: (items: Lead[]) => Lead[]) => { leads = updater(leads); });
  const setTasks = vi.fn((updater: (items: Tarea[]) => Tarea[]) => { tasks = updater(tasks); });
  const setAppointments = vi.fn((updater: (items: CitaAgenda[]) => CitaAgenda[]) => { appointments = updater(appointments); });
  const confirmPersistence = vi.fn(async (_operation: () => Promise<unknown>, apply: () => void) => {
    apply();
    return true;
  });
  const actions = createLeadAssignmentActions({
    leads, setLeads, setTasks, setAppointments,
    currentUser, confirmPersistence,
  });
  return { actions, confirmPersistence, state: () => ({ leads, tasks, appointments }) };
}

describe("reasignación individual de clientes", () => {
  it("cambia responsable, conserva captador y transfiere sólo trabajo vigente", async () => {
    const context = setup();
    expect(await context.actions.reasignarCliente({
      leadId: "l-1", nuevoAsesorId: destino.id, motivo: "Redistribución de carga",
    })).toBe(true);

    const state = context.state();
    expect(state.leads[0]).toMatchObject({ asesorId: destino.id, captadoPorId: "u-asesor" });
    expect(state.tasks.find((item) => item.id === "t-1")?.asesorId).toBe(destino.id);
    expect(state.tasks.find((item) => item.id === "t-2")?.asesorId).toBe("u-asesor");
    expect(state.appointments.find((item) => item.id === "c-futura")?.asesorId).toBe(destino.id);
    expect(state.appointments.find((item) => item.id === "c-pasada")?.asesorId).toBe("u-asesor");
  });

  it("bloquea el caso de uso para quien no es broker", async () => {
    const context = setup({ ...broker, rol: "asesor_equipo" });
    expect(await context.actions.reasignarCliente({
      leadId: "l-1", nuevoAsesorId: destino.id, motivo: "Cambio",
    })).toBe(false);
    expect(context.confirmPersistence).not.toHaveBeenCalled();
  });
});
