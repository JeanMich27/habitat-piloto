import type { Tarea } from "../../types";
import { completarTarea, guardarTarea } from "../../repositories/tasksRepository";
import type { ConfirmPersistence, StateSetter } from "./persistence";

interface TaskActionsInput {
  tasks: Tarea[];
  setTasks: StateSetter<Tarea[]>;
  confirmPersistence: ConfirmPersistence;
}

export interface ProgramarSeguimientoInput {
  leadId: string;
  asesorId: string;
  titulo: string;
  venceEn: string;
}

const reemplazar = (items: Tarea[], item: Tarea) =>
  items.some((actual) => actual.id === item.id)
    ? items.map((actual) => actual.id === item.id ? item : actual)
    : [...items, item];

const esTareaDeSeguimiento = (tarea: Tarea) =>
  tarea.estado === "pendiente" && tarea.metadata.tipo !== "whatsapp_handoff";

export function createTaskActions({ tasks, setTasks, confirmPersistence }: TaskActionsInput) {
  const programarSeguimiento = async (input: ProgramarSeguimientoInput): Promise<boolean> => {
    const existente = tasks
      .filter((tarea) => tarea.leadId === input.leadId && esTareaDeSeguimiento(tarea))
      .sort((a, b) => Date.parse(a.venceEn) - Date.parse(b.venceEn))[0];
    const tarea: Tarea = {
      id: existente?.id ?? crypto.randomUUID(),
      leadId: input.leadId,
      asesorId: input.asesorId,
      titulo: input.titulo,
      estado: "pendiente",
      venceEn: input.venceEn,
      creadaEn: existente?.creadaEn ?? new Date().toISOString(),
      metadata: { ...(existente?.metadata ?? {}), tipo: "seguimiento_manual" },
    };
    let guardada = tarea;
    return confirmPersistence(async () => {
      const result = await guardarTarea(tarea);
      if (result.ok) guardada = result.data;
      return result;
    }, () => setTasks((actuales) => reemplazar(actuales, guardada)));
  };

  const completarProximaTarea = async (leadId: string): Promise<boolean> => {
    const tarea = tasks
      .filter((item) => item.leadId === leadId && esTareaDeSeguimiento(item))
      .sort((a, b) => Date.parse(a.venceEn) - Date.parse(b.venceEn))[0];
    if (!tarea) return true;
    const actualizada: Tarea = { ...tarea, estado: "completada", completadaEn: new Date().toISOString() };
    let guardada = actualizada;
    return confirmPersistence(async () => {
      const result = await completarTarea(tarea);
      if (result.ok) guardada = result.data;
      return result;
    }, () => setTasks((actuales) => reemplazar(actuales, guardada)));
  };

  return { programarSeguimiento, completarProximaTarea };
}
