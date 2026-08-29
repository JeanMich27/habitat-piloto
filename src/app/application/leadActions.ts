import type {
  CalificacionBANT, FamiliaPerdida, Interaccion, Lead, LeadStage, TipoInteraccion, Usuario,
} from "../../types";
import {
  INTENTOS_PARA_SUGERIR_DESCARTE, motivoPerdidaEtiqueta, totalBant,
} from "../../types";
import { evaluarBant, puedeAvanzarAEtapa } from "../../domain/leads/qualification";
import { bulkUpsertLeads, upsertLead } from "../../repositories/leadsRepository";
import type { ConfirmPersistence, StateSetter } from "./persistence";

interface LeadActionsInput {
  leads: Lead[];
  setLeads: StateSetter<Lead[]>;
  currentUser: Usuario;
  confirmPersistence: ConfirmPersistence;
  setBusinessNotice: StateSetter<string | null>;
}

export function createLeadActions({
  leads, setLeads, currentUser, confirmPersistence, setBusinessNotice,
}: LeadActionsInput) {
  const withHistory = (lead: Lead, type: TipoInteraccion, description: string): Lead => {
    const event: Interaccion = {
      id: `int-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fecha: new Date().toISOString(),
      tipo: type,
      descripcion: description,
      autor: currentUser.nombre,
    };
    return { ...lead, historial: [...(lead.historial ?? []), event] };
  };

  const saveLead = async (next: Lead[], leadId: string) => {
    const changed = next.find((lead) => lead.id === leadId);
    if (!changed) return false;
    return confirmPersistence(() => upsertLead(changed), () => setLeads(next));
  };

  const moveLead = async (leadId: string, stage: LeadStage): Promise<boolean> => {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return false;
    if (!puedeAvanzarAEtapa(lead.bant, stage)) {
      setBusinessNotice(
        `Antes de mover a ${lead.nombre} necesitas calificarlo. Ve a Clientes y responde las cuatro preguntas: toma menos de un minuto.`,
      );
      return false;
    }
    return saveLead(leads.map((item) => item.id === leadId
      ? withHistory({ ...item, etapa: stage }, "Etapa", `Pasó de "${item.etapa}" a "${stage}"`)
      : item), leadId);
  };

  const saveQualification = (leadId: string, bant: CalificacionBANT): Promise<boolean> => {
    const evaluation = evaluarBant(bant);
    const total = evaluation.puntaje ?? totalBant(bant);
    const missing = evaluation.faltantes.length;
    const next = leads.map((lead) => lead.id === leadId
      ? withHistory(
          { ...lead, bant, estado: lead.estado === "Sin respuesta" ? "Activo" : lead.estado },
          "Calificacion",
          evaluation.calificado
            ? `Calificado en ${total}/100 puntos — nivel ${evaluation.clasificacion}`
            : `Calificación parcial: ${total} pts con ${4 - missing} de 4 respuestas`,
        )
      : lead);
    return saveLead(next, leadId);
  };

  const registerNoAnswer = (leadId: string): Promise<boolean> => {
    const now = new Date().toISOString();
    const next = leads.map((lead) => {
      if (lead.id !== leadId) return lead;
      const attempts = (lead.intentosContacto ?? 0) + 1;
      return withHistory({
        ...lead,
        intentosContacto: attempts,
        ultimoIntentoEn: now,
        estado: lead.estado === "Descartado" || lead.estado === "Ganado" ? lead.estado : "Sin respuesta",
        primerContactoEn: lead.primerContactoEn ?? now,
      }, "Llamada", `Intento de contacto sin respuesta (${attempts}${
        attempts >= INTENTOS_PARA_SUGERIR_DESCARTE ? " — se sugiere cerrarlo" : ""
      })`);
    });
    return saveLead(next, leadId);
  };

  const discardLead = (
    leadId: string,
    reason: { familia: FamiliaPerdida; motivo: string; detalle?: string },
  ): Promise<boolean> => {
    const now = new Date().toISOString();
    const next = leads.map((lead) => lead.id === leadId
      ? withHistory({
          ...lead, estado: "Descartado", familiaPerdida: reason.familia,
          motivoPerdida: reason.motivo, detallePerdida: reason.detalle,
          cerradoEn: now, cerradoPor: currentUser.nombre,
        }, "Nota", `Cerrado: ${motivoPerdidaEtiqueta(reason.motivo)}${reason.detalle ? ` — ${reason.detalle}` : ""}`)
      : lead);
    return saveLead(next, leadId);
  };

  const reactivateLead = (leadId: string): Promise<boolean> => saveLead(leads.map((lead) => lead.id === leadId
    ? withHistory({
        ...lead, estado: "Activo", familiaPerdida: undefined, motivoPerdida: undefined,
        detallePerdida: undefined, cerradoEn: undefined, cerradoPor: undefined, intentosContacto: 0,
      }, "Nota", "Prospecto reactivado")
    : lead), leadId);

  const registerInteraction = (leadId: string, type: TipoInteraccion, description: string): Promise<boolean> => {
    const next = leads.map((lead) => {
      if (lead.id !== leadId) return lead;
      return withHistory(
        lead.primerContactoEn ? lead : { ...lead, primerContactoEn: new Date().toISOString() },
        type,
        description,
      );
    });
    return saveLead(next, leadId);
  };

  const resolveOffer = (leadId: string, result: "Aceptada" | "Rechazada"): Promise<boolean> => saveLead(
    leads.map((lead) => lead.id === leadId ? {
      ...lead,
      etapa: result === "Aceptada" ? "Cierre" : "Visitado",
      nota: result === "Aceptada" ? `${lead.nota} — Oferta aceptada.` : `${lead.nota} — Oferta rechazada.`,
    } : lead),
    leadId,
  );

  const createClient = (lead: Lead): Promise<boolean> => {
    const created = withHistory(lead, "Nota", "Cliente dado de alta");
    return confirmPersistence(() => upsertLead(created), () => setLeads((current) => [...current, created]));
  };

  const importLeads = (items: Lead[]): Promise<boolean> => confirmPersistence(
    () => bulkUpsertLeads(items),
    () => setLeads((current) => [...current, ...items]),
  );

  return {
    moverLead: moveLead,
    guardarCalificacion: saveQualification,
    registrarIntentoSinRespuesta: registerNoAnswer,
    descartarLead: discardLead,
    reactivarLead: reactivateLead,
    registrarInteraccion: registerInteraction,
    resolverOferta: resolveOffer,
    crearCliente: createClient,
    importarLeads: importLeads,
  };
}
