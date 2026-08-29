import type {
  CalificacionBANT,
  ProcesoCierre,
  Documento,
  EnlacePromocion,
  EstadoCuenta,
  EstatusSolicitud,
  EventoCronologia,
  Interaccion,
  LeadOrigin,
  FamiliaPerdida,
  LeadStage,
  PropietarioInfo,
  PropertyStatus,
  TipoCitaAgenda,
  EstadoCitaAgenda,
  TipoInmueble,
  TipoOperacion,
  UserRole,
  Comparable,
  EstadoValidacionOperacion,
  EstadoTarea,
} from "../types";

/**
 * Contratos del esquema canónico consumido por el frontend.
 *
 * Mantienen la forma `Database` de `supabase gen types typescript`. Deben
 * regenerarse contra Supabase local después de cada migración y compararse con
 * este archivo antes de integrar: `supabase gen types typescript --local`.
 */
export interface Database {
  public: {
    Tables: {
      propiedades: { Row: PropertyRow; Insert: Partial<PropertyRow>; Update: Partial<PropertyRow> };
      leads: { Row: LeadRow; Insert: Partial<LeadRow>; Update: Partial<LeadRow> };
      usuarios: { Row: UserRow; Insert: Partial<UserRow>; Update: Partial<UserRow> };
      agencias: { Row: AgencyRow; Insert: Partial<AgencyRow>; Update: Partial<AgencyRow> };
      configuracion: { Row: ConfigurationRow; Insert: Partial<ConfigurationRow>; Update: Partial<ConfigurationRow> };
      citas: { Row: AppointmentRow; Insert: Partial<AppointmentRow>; Update: Partial<AppointmentRow> };
      solicitudes_estado: { Row: StatusRequestRow; Insert: Partial<StatusRequestRow>; Update: Partial<StatusRequestRow> };
      operaciones: { Row: OperationRow; Insert: Partial<OperationRow>; Update: Partial<OperationRow> };
      tareas: { Row: TaskRow; Insert: Partial<TaskRow>; Update: Partial<TaskRow> };
      integration_events: { Row: IntegrationEventRow; Insert: Partial<IntegrationEventRow>; Update: Partial<IntegrationEventRow> };
      webhook_deliveries: { Row: WebhookDeliveryRow; Insert: Partial<WebhookDeliveryRow>; Update: Partial<WebhookDeliveryRow> };
      integration_logs: { Row: IntegrationLogRow; Insert: Partial<IntegrationLogRow>; Update: Partial<IntegrationLogRow> };
      generated_documents: { Row: GeneratedDocumentRow; Insert: Partial<GeneratedDocumentRow>; Update: Partial<GeneratedDocumentRow> };
      shared_links: { Row: SharedLinkRow; Insert: Partial<SharedLinkRow>; Update: Partial<SharedLinkRow> };
      document_audit_events: { Row: DocumentAuditEventRow; Insert: Partial<DocumentAuditEventRow>; Update: Partial<DocumentAuditEventRow> };
    };
  };
}

export interface PropertyRow {
  id: string; slug_publico: string | null; version: number; agencia_id: string; titulo: string; ubicacion: string;
  municipio: string; estado: string; precio: number | string; recamaras: number;
  banos: number; m2: number | string; descripcion: string; estatus: PropertyStatus | "Activa" | "Intake" | "Validacion" | "Pausada" | "Cerrada";
  tipo_inmueble: TipoInmueble; tipo_operacion: TipoOperacion; asesor_id: string;
  propietario: PropietarioInfo | null; documentos: Documento[] | null; capturada_el: string;
  publicada_el: string | null; ultima_actividad: string | null; eventos: EventoCronologia[] | null;
  comparables: Comparable[] | null; imagenes: string[] | null; amenidades: string[] | null;
  m2_terreno: number | string | null; medios_banos: number | null; estacionamientos: number | null;
  niveles: number | null; mantenimiento: number | string | null; video_url: string | null;
  tour_virtual_url: string | null; colonia: string | null; calle: string | null; codigo_postal: string | null;
  comision_tipo: "porcentaje" | "meses" | null; comision_valor: number | string | null;
  comision_compartida_pct: number | string | null; exclusiva: boolean | null; crm_origen: string | null;
  crm_id_interno: string | null; eb_public_url: string | null; enlaces_promocion: EnlacePromocion[] | null;
  crm_estatus: string | null; crm_estatus_en: string | null; crm_operaciones: Record<string, unknown>[] | null;
}

export interface OperationRow {
  id: string; version: number; agencia_id: string; lead_id: string; propiedad_id: string | null;
  propiedad_referencia: string | null; crm_propiedad_id: string | null;
  estado_validacion: EstadoValidacionOperacion; reportado_por: string; reportado_en: string;
  tipo_operacion: TipoOperacion | null; fecha_cierre: string | null; monto_final: number | string | null;
  moneda: string; comision_bruta_confirmada: number | string | null; comentario_asesor: string | null;
  observacion_broker: string | null; resuelto_por: string | null; resuelto_en: string | null;
  datos_reportados_originales: Record<string, unknown> | null;
  historial_revisiones: Record<string, unknown>[] | null; creado_en: string; actualizado_en: string;
}

export interface TaskRow {
  id: string; agencia_id: string; lead_id: string | null; asesor_id: string | null;
  titulo: string; estado: EstadoTarea; vence_en: string; creada_en: string;
  completada_en: string | null; metadata: Record<string, unknown> | null;
}

export interface LeadRow {
  id: string; version: number; agencia_id: string; nombre: string; telefono: string; correo: string | null;
  etapa: LeadStage; origen: LeadOrigin; interes_propiedad_id: string; asesor_id: string;
  creado: string; nota: string; primer_contacto_en: string | null; monto_oferta: number | string | null;
  cierre: ProcesoCierre | null; ocupacion: string | null; bant: CalificacionBANT | null;
  historial: Interaccion[] | null; eb_property_id: string | null; es_directorio: boolean;
  es_historico: boolean; fuera_de_crm: boolean; eb_visto_en: string | null;
  estado_lead: "Activo" | "Sin respuesta" | "Descartado" | "Ganado" | null;
  familia_perdida: FamiliaPerdida | null; motivo_perdida: string | null; detalle_perdida: string | null;
  cerrado_en: string | null; cerrado_por: string | null; intentos_contacto: number | null;
  ultimo_intento_en: string | null;
}
export interface UserRow {
  id: string; agencia_id: string; nombre: string; correo: string; telefono: string; rol: UserRole;
  puesto: string; iniciales: string; estado_cuenta: EstadoCuenta; puede_ver_otras_propiedades: boolean | null;
  // Perfil público del micrositio (decision-perfil-asesor-micrositio.md).
  foto_url: string | null; bio_corta: string | null; especialidades: string[] | null;
  anos_experiencia: number | null; idiomas: string[] | null; certificaciones: string[] | null;
  redes_sociales: { red: string; url: string }[] | null; slug_publico: string | null;
}
export interface AgencyRow {
  id: string; nombre: string; direccion: string; logo_url: string | null; slug: string | null;
  estado: string | null; codigo_invitacion: string | null; telefono: string | null; correo: string | null;
  ciudad: string | null; sitio_web: string | null; crm: "ninguno" | "easybroker" | null; max_brokers: number | null;
}
export interface ConfigurationRow {
  id: string; agencia_id: string; permiso_equipo_ver_todas: boolean | null;
  notificaciones: Record<string, boolean> | null;
}
export interface AppointmentRow {
  id: string; version: number; agencia_id: string; asesor_id: string; lead_id: string | null;
  propiedad_id: string | null; titulo: string; tipo: TipoCitaAgenda; inicio: string; fin: string;
  ubicacion: string | null; notas: string | null; estado: EstadoCitaAgenda; creada_por: string | null;
  creado_en: string | null;
}
export interface StatusRequestRow {
  id: string; agencia_id: string; propiedad_id: string; solicitante_id: string; estado_actual: string;
  estado_solicitado: PropertyStatus; motivo: string | null; estatus: EstatusSolicitud;
  resuelto_por: string | null; resuelto_en: string | null; creado_en: string;
}

export interface IntegrationEventRow {
  id: string; agencia_id: string; event_type: string; event_version: number;
  entity_type: string; entity_id: string; payload: Record<string, unknown>; status: string;
  attempts: number; available_at: string; created_at: string; occurred_at: string;
  processed_at: string | null; last_error: string | null; actor_id: string | null;
  correlation_id: string; causation_id: string | null;
}

export interface WebhookDeliveryRow {
  id: string; agencia_id: string; event_id: string; endpoint_id: string;
  status: "pending" | "processing" | "succeeded" | "failed"; attempts: number;
  next_attempt_at: string; last_attempt_at: string | null; delivered_at: string | null;
  response_status: number | null; last_error: string | null; created_at: string;
}

export interface IntegrationLogRow {
  id: number; agencia_id: string; provider: string; direction: "inbound" | "outbound";
  event_type: string | null; entity_id: string | null;
  result: "accepted" | "succeeded" | "rejected" | "retrying" | "failed";
  duration_ms: number | null; correlation_id: string; error_summary: string | null; created_at: string;
}

export interface GeneratedDocumentRow {
  id: string; agencia_id: string; created_by: string; document_type: "property_sheet" | "comparative_report";
  resource_type: "property"; resource_id: string; storage_path: string; mime_type: "application/pdf";
  file_size: number; metadata: Record<string, unknown>; created_at: string; updated_at: string;
  expires_at: string | null; deleted_at: string | null;
}

export interface SharedLinkRow {
  id: string; agencia_id: string; created_by: string; resource_type: "property"; resource_id: string;
  document_id: string; token_hash: string; expires_at: string; revoked_at: string | null;
  created_at: string; last_accessed_at: string | null; access_count: number;
}

export interface DocumentAuditEventRow {
  id: number; agencia_id: string; actor_id: string | null;
  event_type: "document_created" | "document_downloaded" | "share_link_created" | "share_link_accessed" | "share_link_revoked" | "share_link_expired";
  document_id: string | null; shared_link_id: string | null; correlation_id: string;
  metadata: Record<string, unknown>; created_at: string;
}
