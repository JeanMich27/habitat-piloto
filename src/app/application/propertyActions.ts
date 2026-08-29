import type { Comparable, DocumentName, Propiedad, PropertyStatus, SolicitudEstado, Usuario } from "../../types";
import { bulkUpsertPropiedades, upsertPropiedad } from "../../repositories/propertiesRepository";
import { crearSolicitudEstado, resolverSolicitudEstado } from "../../repositories/statusRequestsRepository";
import type { ConfirmPersistence, StateSetter } from "./persistence";

interface PropertyActionsInput {
  propiedades: Propiedad[];
  setPropiedades: StateSetter<Propiedad[]>;
  setSolicitudes: StateSetter<SolicitudEstado[]>;
  currentUser: Usuario;
  cloudEnabled: boolean;
  confirmPersistence: ConfirmPersistence;
  setBusinessNotice: StateSetter<string | null>;
}

const replaceById = <T extends { id: string }>(items: T[], item: T): T[] =>
  items.map((current) => current.id === item.id ? item : current);

export function createPropertyActions(input: PropertyActionsInput) {
  const { propiedades, setPropiedades, setSolicitudes, currentUser, cloudEnabled,
    confirmPersistence, setBusinessNotice } = input;

  const save = (next: Propiedad[], id: string): Promise<boolean> => {
    const changed = next.find((property) => property.id === id);
    return changed
      ? confirmPersistence(() => upsertPropiedad(changed), () => setPropiedades(next))
      : Promise.resolve(false);
  };

  const registerEvent = (propertyId: string, type: "Estado" | "Documento" | "Nota" | "Publicacion", description: string) =>
    save(propiedades.map((property) => property.id === propertyId ? {
      ...property,
      eventos: [...(property.eventos ?? []), { id: `ev-${Date.now()}`, fecha: new Date().toISOString(), tipo: type, descripcion: description }],
    } : property), propertyId);

  const changeStatus = (propertyId: string, status: PropertyStatus, reason?: string): Promise<boolean> => {
    const now = new Date().toISOString();
    const description = reason ? `Cambió a estado "${status}" — motivo: ${reason}` : `Cambió a estado "${status}"`;
    return save(propiedades.map((property) => property.id === propertyId ? {
      ...property,
      estatus: status,
      publicadaEl: status === "Publicada" && property.estatus !== "Publicada" ? now : property.publicadaEl,
      ultimaActividad: now,
      eventos: [...(property.eventos ?? []), { id: `ev-${Date.now()}`, fecha: now, tipo: "Estado" as const, descripcion: description }],
    } : property), propertyId);
  };

  const requestStatusChange = async (propertyId: string, status: PropertyStatus, reason?: string): Promise<boolean> => {
    const property = propiedades.find((item) => item.id === propertyId);
    if (!property) return false;
    const request: SolicitudEstado = {
      id: crypto.randomUUID?.() ?? `sol-${Date.now()}`,
      propiedadId: propertyId,
      solicitanteId: currentUser.id,
      estadoActual: property.estatus,
      estadoSolicitado: status,
      motivo: reason,
      estatus: "pendiente",
      creadoEn: new Date().toISOString(),
    };
    if (cloudEnabled) {
      const result = await crearSolicitudEstado(request);
      if (!result.ok) { setBusinessNotice(result.error.message); return false; }
    }
    setSolicitudes((current) => replaceById(current, request));
    await registerEvent(propertyId, "Estado", `${currentUser.nombre} solicitó cambiar el estado a "${status}"${reason ? ` — motivo: ${reason}` : ""} (en revisión del broker)`);
    return true;
  };

  const resolveStatusRequest = async (request: SolicitudEstado, result: "aprobada" | "rechazada"): Promise<boolean> => {
    if (cloudEnabled) {
      const persisted = await resolverSolicitudEstado(request.id, result);
      if (!persisted.ok) { setBusinessNotice(persisted.error.message); return false; }
    }
    setSolicitudes((current) => replaceById(current, {
      ...request, estatus: result, resueltoPor: currentUser.id, resueltoEn: new Date().toISOString(),
    }));
    if (!cloudEnabled) {
      if (result === "aprobada") {
        await changeStatus(request.propiedadId, request.estadoSolicitado, `solicitud aprobada por ${currentUser.nombre}`);
      } else {
        await registerEvent(request.propiedadId, "Estado", `Solicitud de cambio a "${request.estadoSolicitado}" rechazada por ${currentUser.nombre}`);
      }
    }
    // En nube, el trigger resolver_solicitud_estado ya aplicó el cambio de
    // propiedad en la misma transacción. Realtime entrega la fila actualizada.
    return true;
  };

  return {
    toggleDocumento: (propertyId: string, document: DocumentName) => save(propiedades.map((property) => property.id === propertyId ? {
      ...property, documentos: property.documentos.map((item) => item.nombre === document ? { ...item, aprobado: !item.aprobado } : item),
    } : property), propertyId),
    activarPropiedad: (propertyId: string) => { void changeStatus(propertyId, "Publicada", "Documentos validados por el broker"); },
    registrarEvento: registerEvent,
    cambiarEstadoPropiedad: changeStatus,
    solicitarCambioEstado: requestStatusChange,
    resolverSolicitudCambio: resolveStatusRequest,
    guardarInformacionPropiedad: (propertyId: string, changes: Partial<Propiedad>) =>
      save(propiedades.map((property) => property.id === propertyId ? { ...property, ...changes } : property), propertyId),
    agregarComparable: (propertyId: string, comparable: Omit<Comparable, "id">) =>
      save(propiedades.map((property) => property.id === propertyId ? {
        ...property, comparables: [...(property.comparables ?? []), { id: `cmp-${Date.now()}`, ...comparable }],
      } : property), propertyId),
    guardarNuevaPropiedad: (property: Propiedad) => confirmPersistence(
      () => upsertPropiedad(property), () => setPropiedades((current) => [...current, property]),
    ),
    importarPropiedades: (items: Propiedad[]) => confirmPersistence(
      () => bulkUpsertPropiedades(items), () => setPropiedades((current) => [...current, ...items]),
    ),
  };
}
