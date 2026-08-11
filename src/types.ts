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

/**
 * Quién puede dar de alta propiedades.
 *
 * El asesor de equipo pertenece a una inmobiliaria: captar y publicar
 * inventario es responsabilidad del broker, no suya. El asesor
 * independiente sí, porque es su propia operación.
 *
 * Fuente única: no repartir este `if` por las pantallas.
 */
export const puedeCargarPropiedades = (rol: UserRole) =>
  rol === "broker" || rol === "asesor_independiente";

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

  // --- Datos que llegan del CRM (EasyBroker hoy; otros después) ---
  // Nombres genéricos a propósito: la columna describe el dato, y
  // `crmOrigen` describe de dónde vino.
  imagenes?: string[];
  amenidades?: string[];
  m2Terreno?: number;
  mediosBanos?: number;
  estacionamientos?: number;
  niveles?: number;
  mantenimiento?: number;
  videoUrl?: string;
  tourVirtualUrl?: string;
  colonia?: string;
  calle?: string;
  codigoPostal?: string;
  /** Comisión pactada en el CRM. Si existe, manda sobre el default de la app. */
  comisionTipo?: "porcentaje" | "meses";
  comisionValor?: number;
  comisionCompartidaPct?: number;
  exclusiva?: boolean;
  crmOrigen?: string;
  crmIdInterno?: string;
  urlPublica?: string;
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

// ============================================================
// Calificación objetiva de prospectos (marco BANT)
// ============================================================
// El puntaje NUNCA se escribe a mano: se deriva de las opciones elegidas.
// Los catálogos de abajo son la única fuente de verdad de los puntos, así
// dos asesores que responden lo mismo obtienen forzosamente el mismo
// resultado — que es lo que hace objetiva la calificación.
//
// Pesos (sobre 100): Presupuesto 30, Autoridad 20, Necesidad 30, Plazo 20.

export interface OpcionBant {
  valor: string;
  /** Texto que ve el asesor: lenguaje de conversación, no de formulario. */
  etiqueta: string;
  /** Detalle corto que evita interpretaciones distintas entre asesores. */
  ayuda: string;
  puntos: number;
}

export const BANT_PRESUPUESTO: OpcionBant[] = [
  {
    valor: "aprobado",
    etiqueta: "Ya tiene el dinero listo",
    ayuda: "Crédito aprobado por el banco o pago de contado comprobable",
    puntos: 30,
  },
  {
    valor: "tramite",
    etiqueta: "Está tramitando su crédito",
    ayuda: "Tiene el enganche, pero el banco aún no le aprueba",
    puntos: 15,
  },
  {
    valor: "depende_venta",
    etiqueta: "Primero necesita vender otra propiedad",
    ayuda: "El dinero existe, pero está atado a una venta que aún no ocurre",
    puntos: 5,
  },
  {
    valor: "sin_definir",
    etiqueta: "Todavía no sabe cuánto puede pagar",
    ayuda: "No conoce su capacidad de crédito ni tiene un monto claro",
    puntos: 0,
  },
];

// --- Presupuesto del inquilino ---
// A un inquilino no se le pregunta por crédito hipotecario: no aplica. Lo que
// determina si puede rentar es otra cosa — ingresos comprobables (la regla de
// mercado es ~3x la renta), aval o póliza jurídica, y el depósito disponible.
// Preguntarle por su crédito era la fuente principal de calificaciones sin
// sentido en operaciones de renta.
export const BANT_PRESUPUESTO_RENTA: OpcionBant[] = [
  {
    valor: "solvente_aval",
    etiqueta: "Comprueba ingresos y tiene aval o póliza",
    ayuda: "Ingresos demostrables de ~3x la renta y respaldo listo",
    puntos: 30,
  },
  {
    valor: "solvente_sin_aval",
    etiqueta: "Comprueba ingresos, pero le falta el aval",
    ayuda: "Puede pagar; todavía no resuelve aval, fiador o póliza jurídica",
    puntos: 15,
  },
  {
    valor: "ingresos_dificiles",
    etiqueta: "Le cuesta comprobar ingresos",
    ayuda: "Trabaja por su cuenta o sin recibos; requiere revisión caso por caso",
    puntos: 5,
  },
  {
    valor: "sin_solvencia",
    etiqueta: "No alcanza para esta renta",
    ayuda: "El monto está por encima de lo que puede sostener",
    puntos: 0,
  },
];

export const BANT_AUTORIDAD: OpcionBant[] = [
  {
    valor: "decide",
    etiqueta: "Es quien decide y firma",
    ayuda: "Decide solo, o es una pareja donde ambos vienen en la búsqueda",
    puntos: 20,
  },
  {
    valor: "filtro",
    etiqueta: "Está buscando para alguien más",
    ayuda: "Un familiar o asistente que filtra opciones; el que firma no está",
    puntos: 10,
  },
  {
    valor: "sin_poder",
    etiqueta: "No puede decidir ni firmar",
    ayuda: "No tiene la capacidad legal o económica para cerrar la operación",
    puntos: 0,
  },
];

export const BANT_NECESIDAD: OpcionBant[] = [
  {
    valor: "clara",
    etiqueta: "Sabe exactamente qué necesita",
    ayuda: "Requisitos concretos y no negociables (recámaras, zona, accesos)",
    puntos: 30,
  },
  {
    valor: "flexible",
    etiqueta: "Tiene una idea, pero es flexible",
    ayuda: "Abierto a varias zonas o formatos de propiedad",
    puntos: 15,
  },
  {
    valor: "explorando",
    etiqueta: "Solo está viendo qué hay",
    ayuda: "Curiosidad general, sin requisitos definidos",
    puntos: 5,
  },
];

export const BANT_PLAZO: OpcionBant[] = [
  {
    valor: "inmediato",
    etiqueta: "Se muda en menos de un mes",
    ayuda: "Urgencia real: contrato por vencer, crédito por expirar, mudanza en curso",
    puntos: 20,
  },
  {
    valor: "corto",
    etiqueta: "En uno a tres meses",
    ayuda: "Tiene fecha aproximada y está buscando en serio",
    puntos: 15,
  },
  {
    valor: "medio",
    etiqueta: "En tres a seis meses",
    ayuda: "Planea mudarse, pero nada lo apura todavía",
    puntos: 5,
  },
  {
    valor: "largo",
    etiqueta: "En más de seis meses",
    ayuda: "Está explorando el mercado para el futuro",
    puntos: 0,
  },
];

export type ClasificacionLead = "Hot" | "Warm" | "Cold";

/**
 * Qué quiere hacer la persona. Determina qué bloque de dinero se le pregunta.
 * Se deduce del tipo de operación de la propiedad que le interesa, y el asesor
 * lo puede corregir si el prospecto ve las dos cosas.
 */
export type PerfilProspecto = "Comprador" | "Inquilino";

export const perfilDesdeOperacion = (op?: TipoOperacion): PerfilProspecto =>
  op === "Renta" ? "Inquilino" : "Comprador";

/** El catálogo de dinero que aplica a cada perfil. Autoridad, Necesidad y
 *  Plazo son comunes: ahí la pregunta es idéntica para los dos. */
export const catalogoPresupuesto = (perfil: PerfilProspecto): OpcionBant[] =>
  perfil === "Inquilino" ? BANT_PRESUPUESTO_RENTA : BANT_PRESUPUESTO;

export interface CalificacionBANT {
  /** Si falta, se asume Comprador (calificaciones previas al cambio). */
  perfil?: PerfilProspecto;
  presupuesto: string;
  autoridad: string;
  necesidad: string;
  plazo: string;
  /** Datos de apoyo: no suman puntos, sirven para el resumen y el match. */
  montoMaximo?: number;
  formaPago?: string;
  quienMasDecide?: string;
  requisitos?: string;
  observaciones?: string;
  /** Trazabilidad: quién calificó y cuándo. */
  calificadoPor: string;
  calificadoEl: string;
}

const puntosDe = (catalogo: OpcionBant[], valor: string) =>
  catalogo.find((o) => o.valor === valor)?.puntos ?? 0;

/** Único lugar donde se calcula el puntaje. No duplicar esta fórmula. */
export function puntajeBant(b: CalificacionBANT) {
  return {
    // Los dos catálogos de dinero suman igual (30/15/5/0), así que el puntaje
    // es comparable entre compradores e inquilinos aunque midan cosas distintas.
    presupuesto: puntosDe(catalogoPresupuesto(b.perfil ?? "Comprador"), b.presupuesto),
    autoridad: puntosDe(BANT_AUTORIDAD, b.autoridad),
    necesidad: puntosDe(BANT_NECESIDAD, b.necesidad),
    plazo: puntosDe(BANT_PLAZO, b.plazo),
    get total() {
      return this.presupuesto + this.autoridad + this.necesidad + this.plazo;
    },
  };
}

export function totalBant(b: CalificacionBANT): number {
  const p = puntajeBant(b);
  return p.presupuesto + p.autoridad + p.necesidad + p.plazo;
}

export function clasificarLead(total: number): ClasificacionLead {
  if (total >= 80) return "Hot";
  if (total >= 50) return "Warm";
  return "Cold";
}

/** Qué hacer con el prospecto según su nivel: la calificación sin acción no sirve. */
export const ACCION_POR_CLASIFICACION: Record<
  ClasificacionLead,
  { titulo: string; accion: string }
> = {
  Hot: {
    titulo: "Listo para cerrar",
    accion: "Agenda visita física de inmediato y prepara la propuesta.",
  },
  Warm: {
    titulo: "Necesita acompañamiento",
    accion: "Envíale propiedades similares y apóyalo con asesoría de crédito.",
  },
  Cold: {
    titulo: "Aún no está listo",
    accion: "Déjalo en seguimiento automático y retómalo cuando su situación cambie.",
  },
};

/** Etapas que exigen calificación previa: no se avanza sin el dato. */
export const ETAPAS_QUE_EXIGEN_BANT: LeadStage[] = ["Visitado", "Negociacion", "Cierre"];

// ============================================================
// Historial de interacciones
// ============================================================
export type TipoInteraccion =
  | "Nota"
  | "Llamada"
  | "WhatsApp"
  | "Correo"
  | "Visita"
  | "Calificacion"
  | "Etapa";

export interface Interaccion {
  id: string;
  fecha: string;
  tipo: TipoInteraccion;
  descripcion: string;
  /** Nombre del asesor que registró el evento. */
  autor: string;
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
  // Calificación objetiva BANT. Mientras no exista, el prospecto no puede
  // pasar de "Contactado" (ver ETAPAS_QUE_EXIGEN_BANT).
  bant?: CalificacionBANT;
  // Bitácora de todo lo que pasa con el prospecto. Se alimenta sola cuando
  // cambia de etapa o se recalifica, y a mano cuando el asesor registra algo.
  historial?: Interaccion[];
  // Datos de contexto que ayudan a leer la ficha de un vistazo.
  ocupacion?: string;
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
