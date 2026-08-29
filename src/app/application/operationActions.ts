import type { Lead, Operacion, Propiedad, Usuario } from "../../types";
import {
  reportarOperacion,
  resolverOperacion,
  type ReportarOperacionInput,
  type ResolverOperacionInput,
  type ResolverOperacionResult,
} from "../../repositories/operationsRepository";
import { ok } from "../../repositories/repositoryResult";
import type { ConfirmPersistence, StateSetter } from "./persistence";

interface OperationActionsInput {
  operaciones: Operacion[];
  setOperaciones: StateSetter<Operacion[]>;
  setLeads: StateSetter<Lead[]>;
  setPropiedades: StateSetter<Propiedad[]>;
  currentUser: Usuario;
  cloudEnabled: boolean;
  confirmPersistence: ConfirmPersistence;
}

const reemplazar = <T extends { id: string }>(items: T[], item: T) =>
  items.some((current) => current.id === item.id)
    ? items.map((current) => current.id === item.id ? item : current)
    : [...items, item];

export function createOperationActions({
  operaciones,
  setOperaciones,
  setLeads,
  setPropiedades,
  currentUser,
  cloudEnabled,
  confirmPersistence,
}: OperationActionsInput) {
  const report = async (input: ReportarOperacionInput): Promise<boolean> => {
    if (cloudEnabled) {
      let saved: Operacion | undefined;
      return confirmPersistence(async () => {
        const result = await reportarOperacion(input);
        if (result.ok) saved = result.data;
        return result;
      }, () => saved && setOperaciones((current) => reemplazar(current, saved!)));
    }
    const returned = operaciones.find(
      (item) => item.leadId === input.leadId && item.estadoValidacion === "devuelta",
    );
    const demo: Operacion = {
      id: returned?.id ?? `op-${Date.now()}`,
      version: (returned?.version ?? 0) + 1,
      leadId: input.leadId,
      propiedadId: input.propiedadId,
      propiedadReferencia: input.propiedadReferencia,
      crmPropiedadId: input.crmPropiedadId,
      estadoValidacion: "reportada",
      reportadoPor: returned?.reportadoPor ?? currentUser.id,
      reportadoEn: returned?.reportadoEn ?? new Date().toISOString(),
      tipoOperacion: input.tipoOperacion,
      fechaCierre: input.fechaCierre,
      montoFinal: input.montoFinal,
      moneda: input.moneda ?? "MXN",
      comisionBrutaConfirmada: input.comisionBrutaConfirmada,
      comentarioAsesor: input.comentario,
      datosReportadosOriginales: returned?.datosReportadosOriginales ?? { ...input },
      historialRevisiones: [...(returned?.historialRevisiones ?? []), { tipo: returned ? "reenviada" : "reportada", fecha: new Date().toISOString() }],
    };
    return confirmPersistence(() => Promise.resolve(ok(demo)), () =>
      setOperaciones((current) => reemplazar(current, demo)));
  };

  const resolve = async (input: ResolverOperacionInput): Promise<boolean> => {
    if (currentUser.rol !== "broker") return false;
    if (cloudEnabled) {
      let saved: ResolverOperacionResult | undefined;
      return confirmPersistence(async () => {
        const result = await resolverOperacion(input);
        if (result.ok) saved = result.data;
        return result;
      }, () => {
        const currentSaved = saved;
        if (!currentSaved) return;
        setOperaciones((current) => reemplazar(current, currentSaved.operacion));
        if (currentSaved.lead) setLeads((current) => reemplazar(current, currentSaved.lead!));
        if (currentSaved.propiedad) setPropiedades((current) => reemplazar(current, currentSaved.propiedad!));
      });
    }
    const current = operaciones.find((item) => item.id === input.operacionId);
    if (!current) return false;
    const resolved: Operacion = {
      ...current,
      estadoValidacion: input.resultado,
      observacionBroker: input.observacion,
      tipoOperacion: input.tipoOperacion ?? current.tipoOperacion,
      propiedadId: input.propiedadId,
      propiedadReferencia: input.propiedadReferencia,
      crmPropiedadId: input.crmPropiedadId,
      fechaCierre: input.fechaCierre ?? current.fechaCierre ?? new Date().toISOString(),
      montoFinal: input.montoFinal ?? current.montoFinal,
      moneda: input.moneda ?? current.moneda,
      comisionBrutaConfirmada: input.comisionBrutaConfirmada ?? current.comisionBrutaConfirmada,
      resueltoPor: currentUser.id,
      resueltoEn: new Date().toISOString(),
      version: current.version + 1,
    };
    return confirmPersistence(() => Promise.resolve(ok(resolved)), () => {
      setOperaciones((items) => reemplazar(items, resolved));
      if (input.resultado !== "validada") return;
      setLeads((items) => items.map((lead) => lead.id === current.leadId ? {
        ...lead,
        etapa: "Cierre",
        estado: "Ganado",
        cerradoEn: resolved.fechaCierre,
        cerradoPor: currentUser.nombre,
      } : lead));
      if (resolved.propiedadId) setPropiedades((items) => items.map((property) =>
        property.id === resolved.propiedadId ? { ...property, estatus: "Vendida o Rentada" } : property));
    });
  };

  return { reportarOperacion: report, resolverOperacion: resolve };
}
