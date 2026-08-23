import type { AgenciaInfo, CitaAgenda, Lead, Propiedad, UserRole, Usuario } from "../../types";
import { desactivarAsesorAtomico, upsertUsuario, upsertUsuarioConError } from "../../repositories/usersRepository";
import { upsertAgencia, upsertConfiguracion } from "../../repositories/settingsRepository";
import type { ConfirmPersistence, StateSetter } from "./persistence";

interface TeamSettingsActionsInput {
  users: Usuario[]; setUsers: StateSetter<Usuario[]>;
  properties: Propiedad[]; setProperties: StateSetter<Propiedad[]>;
  leads: Lead[]; setLeads: StateSetter<Lead[]>;
  appointments: CitaAgenda[]; setAppointments: StateSetter<CitaAgenda[]>;
  agency: AgenciaInfo; setAgency: StateSetter<AgenciaInfo>;
  teamCanSeeAll: boolean; setTeamCanSeeAll: StateSetter<boolean>;
  notifications: Record<string, boolean>; setNotifications: StateSetter<Record<string, boolean>>;
  confirmPersistence: ConfirmPersistence;
}

export function createTeamSettingsActions(input: TeamSettingsActionsInput) {
  const { users, setUsers, properties, setProperties, leads, setLeads, appointments, setAppointments,
    agency, setAgency, teamCanSeeAll, setTeamCanSeeAll, notifications, setNotifications, confirmPersistence } = input;

  const saveUser = (id: string, changes: Partial<Usuario>): Promise<boolean> => {
    const next = users.map((user) => user.id === id ? { ...user, ...changes } : user);
    const changed = next.find((user) => user.id === id);
    return changed ? confirmPersistence(() => upsertUsuario(changed), () => setUsers(next)) : Promise.resolve(false);
  };

  const createUser = (data: { nombre: string; correo: string; telefono: string; rol: UserRole }): Usuario => ({
    id: `user-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nombre: data.nombre.trim(), correo: data.correo.trim().toLowerCase(), telefono: data.telefono.trim(), rol: data.rol,
    puesto: data.rol === "broker" ? "Broker / Administrador" : data.rol === "propietario" ? "Propietario" : data.rol === "cliente" ? "Cliente" : "Asesor Inmobiliario",
    iniciales: data.nombre.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase(),
    estadoCuenta: "Invitado",
    puedeVerOtrasPropiedades: data.rol === "asesor_equipo" ? teamCanSeeAll : true,
    agenciaId: agency.id,
  });

  return {
    altaDeUsuario: async (data: { nombre: string; correo: string; telefono: string; rol: UserRole }): Promise<string | null> => {
      const user = createUser(data);
      const error = await upsertUsuarioConError(user);
      if (!error) setUsers((current) => [...current, user]);
      return error;
    },
    invitarAsesor: (nombre: string, correo: string) => {
      const user = createUser({ nombre, correo, telefono: "", rol: "asesor_equipo" });
      return confirmPersistence(() => upsertUsuario(user), () => setUsers((current) => [...current, user]));
    },
    guardarAgencia: (next: AgenciaInfo) => confirmPersistence(() => upsertAgencia(next), () => setAgency(next)),
    guardarPermisoEquipo: (value: boolean) => confirmPersistence(
      () => upsertConfiguracion(value, notifications), () => setTeamCanSeeAll(value),
    ),
    guardarNotificaciones: (value: Record<string, boolean>) => confirmPersistence(
      () => upsertConfiguracion(teamCanSeeAll, value), () => setNotifications(value),
    ),
    guardarPerfilPersonal: saveUser,
    resolverSolicitud: saveUser,
    desactivarAsesor: (advisorId: string, reassignToId: string) => {
      const nextUsers = users.map((user) => user.id === advisorId ? { ...user, estadoCuenta: "Inactivo" as const } : user);
      if (!nextUsers.some((user) => user.id === advisorId)) return Promise.resolve(false);
      return confirmPersistence(() => desactivarAsesorAtomico(advisorId, reassignToId), () => {
        setUsers(nextUsers);
        setProperties(properties.map((property) => property.asesorId === advisorId ? { ...property, asesorId: reassignToId } : property));
        setLeads(leads.map((lead) => lead.asesorId === advisorId ? { ...lead, asesorId: reassignToId } : lead));
        setAppointments(appointments.map((appointment) => appointment.asesorId === advisorId && (appointment.estado === "Agendada" || appointment.estado === "Confirmada")
          ? { ...appointment, asesorId: reassignToId } : appointment));
      });
    },
    reactivarAsesor: (id: string) => saveUser(id, { estadoCuenta: "Activo" }),
    editarPermisosAsesor: (id: string, value: boolean) => saveUser(id, { puedeVerOtrasPropiedades: value }),
  };
}
