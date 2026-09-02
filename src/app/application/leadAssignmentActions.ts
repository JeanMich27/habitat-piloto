import type { AsignacionLead, CitaAgenda, Lead, Tarea, Usuario } from "../../types";
import {
  listarAsignacionesLead,
  reasignarLead as persistirReasignacion,
  type ReasignarLeadInput,
} from "../../repositories/leadAssignmentsRepository";
import type { ConfirmPersistence, StateSetter } from "./persistence";

interface LeadAssignmentActionsInput {
  leads: Lead[];
  setLeads: StateSetter<Lead[]>;
  setTasks: StateSetter<Tarea[]>;
  setAppointments: StateSetter<CitaAgenda[]>;
  currentUser: Usuario;
  confirmPersistence: ConfirmPersistence;
}

export function createLeadAssignmentActions(input: LeadAssignmentActionsInput) {
  const {
    leads, setLeads, setTasks, setAppointments,
    currentUser, confirmPersistence,
  } = input;

  const reassignClient = async (request: ReasignarLeadInput): Promise<boolean> => {
    if (currentUser.rol !== "broker") return false;
    const lead = leads.find((item) => item.id === request.leadId);
    if (!lead || lead.asesorId === request.nuevoAsesorId || !request.motivo.trim()) return false;

    let nextVersion = lead.version;
    const saved = await confirmPersistence(async () => {
      const result = await persistirReasignacion({ ...request, motivo: request.motivo.trim() });
      if (result.ok) nextVersion = result.data.version;
      return result;
    }, () => {
      setLeads((current) => current.map((item) => item.id === request.leadId
        ? { ...item, asesorId: request.nuevoAsesorId, version: nextVersion }
        : item));
      setTasks((current) => current.map((task) =>
        task.leadId === request.leadId && task.estado === "pendiente"
          ? { ...task, asesorId: request.nuevoAsesorId }
          : task));
      const now = Date.now();
      setAppointments((current) => current.map((appointment) =>
        appointment.leadId === request.leadId
        && Date.parse(appointment.inicio) >= now
        && (appointment.estado === "Agendada" || appointment.estado === "Confirmada")
          ? { ...appointment, asesorId: request.nuevoAsesorId }
          : appointment));
    });
    return saved;
  };

  const loadHistory = async (leadId: string): Promise<AsignacionLead[]> => {
    const result = await listarAsignacionesLead(leadId);
    return result.ok ? result.data : [];
  };

  return { reasignarCliente: reassignClient, cargarHistorialAsignaciones: loadHistory };
}
