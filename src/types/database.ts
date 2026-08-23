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
    };
  };
}

export interface PropertyRow {
  id: string; version: number; agencia_id: string; titulo: string; ubicacion: string;
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
