import { describe, expect, it } from "vitest";
import { rowToCita, rowToLead } from "../src/lib/rowMappers";
import type { AppointmentRow, LeadRow } from "../src/types/database";

const leadRow: LeadRow = {
  id: "lead-1", version: 3, agencia_id: "agency-a", nombre: "Ana", telefono: "555",
  correo: null, etapa: "Contactado", origen: "Referido", interes_propiedad_id: "property-1",
  asesor_id: "advisor-1", creado: "2026-08-23T10:00:00.000Z", nota: "",
  primer_contacto_en: null, monto_oferta: "1250000.50", cierre: null, ocupacion: null,
  bant: null, historial: null, eb_property_id: null, es_directorio: false, es_historico: false,
  fuera_de_crm: false, eb_visto_en: null, estado_lead: null, familia_perdida: null,
  motivo_perdida: null, detalle_perdida: null, cerrado_en: null, cerrado_por: null,
  intentos_contacto: null, ultimo_intento_en: null,
};

const appointmentRow: AppointmentRow = {
  id: "appointment-1", version: 2, agencia_id: "agency-a", asesor_id: "advisor-1",
  lead_id: null, propiedad_id: null, titulo: "Seguimiento", tipo: "llamada",
  inicio: "2026-08-24T15:00:00.000Z", fin: "2026-08-24T15:30:00.000Z",
  ubicacion: null, notas: null, estado: "Agendada", creada_por: null, creado_en: null,
};

describe("mappers de filas Supabase", () => {
  it("normaliza null y numéricos de un lead sin perder identidad ni versión", () => {
    const lead = rowToLead(leadRow);
    expect(lead).toMatchObject({ id: "lead-1", version: 3, correo: "", montoOferta: 1250000.5 });
    expect(lead.historial).toEqual([]);
    expect(lead.estado).toBe("Activo");
  });

  it("conserva timestamps y convierte null opcional de una cita", () => {
    expect(rowToCita(appointmentRow)).toEqual({
      id: "appointment-1", version: 2, agenciaId: "agency-a", asesorId: "advisor-1",
      leadId: undefined, propiedadId: undefined, titulo: "Seguimiento", tipo: "llamada",
      inicio: "2026-08-24T15:00:00.000Z", fin: "2026-08-24T15:30:00.000Z",
      ubicacion: "", notas: "", estado: "Agendada", creadaPor: undefined, creadoEn: undefined,
    });
  });
});
