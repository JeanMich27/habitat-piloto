import type { CitaAgenda, EstadoCitaAgenda, TipoInteraccion } from "../../types";
import { eliminarCita, upsertCita } from "../../repositories/appointmentsRepository";
import type { ConfirmPersistence, StateSetter } from "./persistence";

interface AppointmentActionsInput {
  appointments: CitaAgenda[];
  setAppointments: StateSetter<CitaAgenda[]>;
  confirmPersistence: ConfirmPersistence;
  registerInteraction: (leadId: string, type: TipoInteraccion, description: string) => Promise<boolean>;
}

const replaceById = (items: CitaAgenda[], item: CitaAgenda) =>
  items.some((current) => current.id === item.id)
    ? items.map((current) => current.id === item.id ? item : current)
    : [...items, item];

export function createAppointmentActions({ appointments, setAppointments, confirmPersistence, registerInteraction }: AppointmentActionsInput) {
  const saveAppointment = async (appointment: CitaAgenda): Promise<boolean> => {
    const existed = appointments.some((item) => item.id === appointment.id);
    const saved = await confirmPersistence(
      () => upsertCita(appointment), () => setAppointments((current) => replaceById(current, appointment)),
    );
    if (saved && !existed && appointment.leadId) {
      const when = new Date(appointment.inicio).toLocaleString("es-MX", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
      await registerInteraction(appointment.leadId, "Nota", `Cita agendada para el ${when}`);
    }
    return saved;
  };

  const changeAppointmentStatus = async (id: string, status: EstadoCitaAgenda): Promise<boolean> => {
    const appointment = appointments.find((item) => item.id === id);
    if (!appointment) return false;
    const updated = { ...appointment, estado: status };
    const saved = await confirmPersistence(
      () => upsertCita(updated), () => setAppointments((current) => replaceById(current, updated)),
    );
    if (saved && appointment.leadId && (status === "Realizada" || status === "No asistió")) {
      await registerInteraction(appointment.leadId, status === "Realizada" ? "Visita" : "Nota", status === "Realizada" ? "Visita realizada" : "El cliente no asistió a la cita");
    }
    return saved;
  };

  return {
    guardarCita: saveAppointment,
    cambiarEstadoCita: changeAppointmentStatus,
    borrarCita: (id: string) => confirmPersistence(
      () => eliminarCita(id), () => setAppointments((current) => current.filter((item) => item.id !== id)),
    ),
  };
}
