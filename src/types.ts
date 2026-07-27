export type PropertyStatus =
  | "Intake"
  | "Validacion"
  | "Activa"
  | "Pausada"
  | "Cerrada";

export type LeadStage =
  | "Nuevo"
  | "Contactado"
  | "Visitado"
  | "Negociacion"
  | "Cierre";

// Sin integraciones externas en el MVP (EasyBroker/n8n/WhatsApp quedan post-MVP).
// El lead siempre se captura manualmente; "origen" solo registra de dónde dice
// venir, no de dónde lo trajo un webhook.
export type LeadOrigin = "Portal" | "Referido" | "Redes" | "Directo";

// 5 roles confirmados: Broker y Administrador son el mismo rol. Asesor
// Independiente tiene el mismo permiso que Broker pero acotado a su propia
// operación (no tiene equipo). Validación de documentos es una acción del
// rol "broker", no un rol de permisos aparte.
export type UserRole =
  | "broker"
  | "asesor_independiente"
  | "asesor_equipo"
  | "propietario"
  | "cliente";

export type DocumentName = "INE" | "Predial" | "Contrato";

export interface Documento {
  nombre: DocumentName;
  aprobado: boolean;
}

export type TipoInmueble = "Casa" | "Depto" | "Terreno" | "Local";
export type TipoOperacion = "Venta" | "Renta";

export interface PropietarioInfo {
  nombre: string;
  telefono: string;
  correo: string;
}

export type TipoEvento = "Estado" | "Documento" | "Nota" | "Publicacion";

export interface EventoCronologia {
  id: string;
  fecha: string;
  tipo: TipoEvento;
  descripcion: string;
}

export interface Comparable {
  id: string;
  direccion: string;
  precio: number;
  m2: number;
  fuente: string;
}

export interface Propiedad {
  id: string;
  titulo: string;
  ubicacion: string;
  municipio: string;
  estado: string;
  precio: number;
  recamaras: number;
  banos: number;
  m2: number;
  descripcion: string;
  estatus: PropertyStatus;
  tipoInmueble: TipoInmueble;
  tipoOperacion: TipoOperacion;
  asesorId: string;
  propietario: PropietarioInfo;
  documentos: Documento[];
  // Fecha en que el asesor la dio de alta (Intake). Existe siempre; alimenta
  // el tab "Captaciones" de Reportes. Distinta de publicadaEl (cuando pasó a Activa).
  capturadaEl: string;
  // Solo se llenan cuando estatus = "Activa" — alimentan el KPI "días en
  // mercado" y la alerta de "propiedad sin actividad" del Dashboard del Broker.
  publicadaEl?: string;
  ultimaActividad?: string;
  // Cronología (Detalle de Propiedad) y Comparativo — opcionales porque solo
  // se llenan una vez que la propiedad tiene actividad registrada.
  eventos?: EventoCronologia[];
  comparables?: Comparable[];
}

export type EstadoCuenta = "Activo" | "Invitado" | "Inactivo" | "Pendiente";

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  rol: UserRole;
  puesto: string;
  iniciales: string;
  estadoCuenta: EstadoCuenta;
  // Ejemplo de permiso especial editable desde Asesores > Editar permisos.
  puedeVerOtrasPropiedades?: boolean;
}

export interface Lead {
  id: string;
  nombre: string;
  telefono: string;
  // Correo del interesado: es lo que vincula su cuenta (rol "cliente") con
  // este lead — sin correo, el cliente no puede ver su proceso en el portal.
  correo?: string;
  etapa: LeadStage;
  origen: LeadOrigin;
  interesPropiedadId: string;
  asesorId: string;
  creado: string;
  nota: string;
  // Cuándo el asesor le dio el primer seguimiento — de aquí sale el KPI
  // "tiempo promedio de respuesta". Si no existe, el lead sigue sin contactar.
  primerContactoEn?: string;
  // Monto de la oferta cuando el lead llega a Negociación o Cierre — alimenta
  // "Comisiones proyectadas" (3% de referencia, ajustable).
  montoOferta?: number;
  // Solo existe cuando etapa === "Cierre" — es lo que ve el Cliente en su portal.
  cierre?: ProcesoCierre;
}

// --- Proceso de cierre (Fase 4: Cliente/Comprador) ---
// Se activa una vez que una oferta se acepta (Lead.etapa === "Cierre"). Las 6
// etapas son secuenciales: todo antes de etapaActual ya se hizo, etapaActual
// está en proceso, lo de después está pendiente.
export const ETAPAS_CIERRE = [
  "Visita realizada",
  "Documentos enviados",
  "Investigación en proceso",
  "Resultado de póliza",
  "Firma de contrato",
  "Entrega de llaves",
] as const;

export type EstadoDocCliente = "Pendiente" | "Cargado" | "Validado" | "Rechazado";

export interface DocumentoCliente {
  nombre: string;
  estado: EstadoDocCliente;
  motivoRechazo?: string;
}

export type EstadoCita = "Programada" | "Confirmada" | "Realizada";

export interface CitaCliente {
  id: string;
  fecha: string;
  ubicacion: string;
  tipo: string;
  estado: EstadoCita;
}

export interface ProcesoCierre {
  etapaActual: number; // índice 0-5 sobre ETAPAS_CIERRE
  documentos: DocumentoCliente[];
  citas: CitaCliente[];
}

// --- Configuración (Broker) ---
export interface AgenciaInfo {
  nombre: string;
  direccion: string;
  logoUrl?: string;
}

export const formatoMXN = (valor: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(valor);
