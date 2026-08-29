import { describe, expect, it, vi } from "vitest";
import { createTaskActions } from "../src/app/application/taskActions";
import type { Tarea } from "../src/types";

const pendiente: Tarea = {
  id: "t-1",
  leadId: "l-1",
  asesorId: "u-1",
  titulo: "Contactar lead",
  estado: "pendiente",
  venceEn: "2026-08-29T16:00:00Z",
  creadaEn: "2026-08-28T16:00:00Z",
  metadata: {},
};

const coordinadorLocal = async (_operation: () => Promise<unknown>, apply: () => void) => {
  apply();
  return true;
};

describe("taskActions", () => {
  it("reprograma la tarea pendiente existente en vez de duplicarla", async () => {
    let tareas = [pendiente];
    const setTasks = vi.fn((updater: (items: Tarea[]) => Tarea[]) => { tareas = updater(tareas); });
    const actions = createTaskActions({ tasks: tareas, setTasks, confirmPersistence: coordinadorLocal });

    expect(await actions.programarSeguimiento({
      leadId: "l-1",
      asesorId: "u-1",
      titulo: "Enviar propiedades",
      venceEn: "2026-08-31T16:00:00Z",
    })).toBe(true);
    expect(tareas).toHaveLength(1);
    expect(tareas[0]).toMatchObject({ id: "t-1", titulo: "Enviar propiedades", venceEn: "2026-08-31T16:00:00Z" });
  });

  it("completa la próxima tarea del cliente", async () => {
    let tareas = [pendiente];
    const setTasks = vi.fn((updater: (items: Tarea[]) => Tarea[]) => { tareas = updater(tareas); });
    const actions = createTaskActions({ tasks: tareas, setTasks, confirmPersistence: coordinadorLocal });

    expect(await actions.completarProximaTarea("l-1")).toBe(true);
    expect(tareas[0].estado).toBe("completada");
    expect(tareas[0].completadaEn).toBeTruthy();
  });

  it("no altera tareas técnicas de entrega de WhatsApp", async () => {
    let tareas = [{ ...pendiente, metadata: { tipo: "whatsapp_handoff" } }];
    const setTasks = vi.fn((updater: (items: Tarea[]) => Tarea[]) => { tareas = updater(tareas); });
    const actions = createTaskActions({ tasks: tareas, setTasks, confirmPersistence: coordinadorLocal });

    expect(await actions.completarProximaTarea("l-1")).toBe(true);
    expect(tareas[0].estado).toBe("pendiente");
  });
});
