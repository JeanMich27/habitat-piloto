// Estados comerciales de una propiedad (definidos con Jean, ago 2026).
// "No publicada" cubre también la captación en curso (antes Intake/Validación):
// la bandeja de Validación distingue por documentos, no por sub-estado.
export type PropertyStatus =
  | "Publicada"
  | "No publicada"
  | "Reservada"
  | "Vendida o Rentada"
  | "Suspendida";

export const ESTADOS_PROPIEDAD: PropertyStatus[] = [
  "Publicada",
  "No publicada",
  "Reservada",
  "Vendida o Rentada",
  "Suspendida",
];

/** Traduce los valores previos a la migración (datos locales o importaciones viejas). */
export function normalizarEstatus(valor: string): PropertyStatus {
  switch (valor) {
    case "Activa":
      return "Publicada";
    case "Intake":
    case "Validacion":
      return "No publicada";
    case "Pausada":
      return "Suspendida";
    case "Cerrada":
      return "Vendida o Rentada";
    default:
      return (ESTADOS_PROPIEDAD as string[]).includes(valor)
        ? (valor as PropertyStatus)
        : "No publicada";
  }
}

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

/** Editar la información de una propiedad sigue la misma regla que darla de alta. */
export const puedeEditarPropiedades = puedeCargarPropiedades;

/**
 * El asesor de equipo no cambia el estado directamente: lo SOLICITA y el
 * broker lo aprueba (el cambio se aplica solo al aprobarse — trigger en la
 * base). Broker e independiente sí aplican el cambio de inmediato.
 */
export const solicitaCambioDeEstado = (rol: UserRole) => rol === "asesor_equipo";

// --- Solicitudes de cambio de estado (tabla solicitudes_estado) ---
export type EstatusSolicitud = "pendiente" | "aprobada" | "rechazada";

export interface SolicitudEstado {
  id: string;
  propiedadId: string;
  solicitanteId: string;
  estadoActual: string;
  estadoSolicitado: PropertyStatus;
  motivo?: string;
  estatus: EstatusSolicitud;
  resueltoPor?: string;
  resueltoEn?: string;
  creadoEn: string;
}

/** Dónde se promociona una propiedad (además del enlace de EasyBroker). */
export interface EnlacePromocion {
  portal: string;
  url: string;
}

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
  /** Slug estable de la ficha pública propia (/inmueble/:slug), sólo lectura. */
  slugPublico?: string;
  /** Versión de concurrencia; cambia en cada escritura confirmada por la base. */
  version?: number;
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
  // Solo se llenan cuando estatus = "Publicada" — alimentan el KPI "días en
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
  /** Enlace público que genera EasyBroker (lo llena la sincronización). */
  urlPublica?: string;
  /** Portales/medios donde se promociona, capturados por el broker. */
  enlacesPromocion?: EnlacePromocion[];
}

export type EstadoCuenta = "Activo" | "Invitado" | "Inactivo" | "Pendiente";

export interface Usuario {
  id: string;
  /** Oficina (tenant) a la que pertenece. Una cuenta = una oficina. */
  agenciaId?: string;
  nombre: string;
  correo: string;
  telefono: string;
  rol: UserRole;
  puesto: string;
  iniciales: string;
  estadoCuenta: EstadoCuenta;
  // Ejemplo de permiso especial editable desde Asesores > Editar permisos.
  puedeVerOtrasPropiedades?: boolean;

  // ------------------------------------------------------------------
  // Perfil público del micrositio (decision-perfil-asesor-micrositio.md).
  // Ninguno bloquea nada: el micrositio siempre está activo, es
  // responsabilidad del asesor llenarlo (decisión de Jean, 26 ago 2026).
  // ------------------------------------------------------------------
  /** Foto pública del micrositio. Distinta del avatar de iniciales. */
  fotoUrl?: string;
  /** Bio pública, máx. 280 caracteres (usuarios_bio_corta_longitud en la base). */
  bioCorta?: string;
  /** Zonas/tipos de propiedad en los que se especializa. */
  especialidades?: string[];
  anosExperiencia?: number;
  idiomas?: string[];
  certificaciones?: string[];
  redesSociales?: { red: string; url: string }[];
  /** Slug único para la URL pública (/m/:slug). Se autogenera en la base, solo lectura. */
  slugPublico?: string;
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

/**
 * Una calificación está completa cuando las cuatro preguntas tienen respuesta.
 * Se permite guardar incompleta a propósito: en la vida real el cliente cuelga
 * a la segunda pregunta, y obligar a las cuatro hacía que el asesor no
 * registrara NADA. Media calificación guardada vale más que cero.
 * Lo que NO se hace es fingir que un puntaje parcial es comparable con uno
 * completo: mientras falte una respuesta, el lead no recibe clasificación.
 */
export const bantCompleto = (b?: CalificacionBANT): boolean =>
  !!b && !!b.presupuesto && !!b.autoridad && !!b.necesidad && !!b.plazo;

export const preguntasBantFaltantes = (b?: CalificacionBANT): number => {
  if (!b) return 4;
  return [b.presupuesto, b.autoridad, b.necesidad, b.plazo].filter((v) => !v).length;
};

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
  /** Versión de concurrencia; evita sobrescribir una ficha desactualizada. */
  version?: number;
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
  // Id público de la propiedad en EasyBroker. Se guarda aunque la propiedad
  // ya no esté en el catálogo (vendida o retirada): sin esto, un lead viejo
  // muestra "sin propiedad de interés" y el asesor no sabe por qué preguntó.
  ebPropertyId?: string;
  // Contacto que vive en el CRM pero nunca generó una solicitud de portal:
  // la API de EasyBroker no expone su etapa ni su propiedad de interés, así
  // que no es un prospecto del embudo, es un nombre en la agenda.
  esDirectorio?: boolean;
  // Solicitud de portal anterior a la ventana móvil del sync. Es un lead real,
  // pero de hace meses: cuenta para el histórico, no para lo que hay que atender.
  esHistorico?: boolean;
  // El contacto ya no existe en EasyBroker: el broker lo borró allá y el sync
  // dejó de recibirlo. La app conserva la ficha (la historia de seguimiento es
  // suya, no del CRM) pero la saca de todo conteo que deba cuadrar contra el
  // CRM. Lo pone `sync-contactos`; el frontend nunca lo escribe.
  fueraDeCrm?: boolean;
  // Última corrida del sync en la que EasyBroker devolvió este contacto.
  ebVistoEn?: string;
  // --- Desenlace (ver EstadoLead) ---
  // Va APARTE de la etapa a propósito: la etapa dice hasta dónde llegó el lead,
  // el estado dice si sigue en juego. Un "Descartado" que borrara su etapa
  // haría imposible saber en qué punto del embudo se cae la gente.
  estado?: EstadoLead;
  familiaPerdida?: FamiliaPerdida;
  motivoPerdida?: string;
  detallePerdida?: string;
  cerradoEn?: string;
  cerradoPor?: string;
  // Intentos de contacto sin respuesta. Alimentan la sugerencia de descarte.
  intentosContacto?: number;
  ultimoIntentoEn?: string;
}

// --- Desenlace del lead ---------------------------------------------------
export type EstadoLead = "Activo" | "Sin respuesta" | "Descartado" | "Ganado";

export type FamiliaPerdida =
  | "No se pudo contactar"
  | "Ya no está interesado"
  | "No calificaba"
  | "No era un lead real";

export interface MotivoPerdida {
  valor: string;
  etiqueta: string;
  ayuda: string;
  familia: FamiliaPerdida;
}

/**
 * Los motivos NO son texto libre. Un campo abierto produce cuarenta formas de
 * escribir "no contestó" y ningún dato agregable. Con catálogo cerrado, el
 * broker puede decir "el 38% de lo que perdemos es fuera de presupuesto" — y
 * eso deja de ser un problema del asesor para volverse uno de segmentación
 * del anuncio.
 */
export const MOTIVOS_PERDIDA: MotivoPerdida[] = [
  {
    valor: "no_contesta",
    etiqueta: "No contesta",
    ayuda: "Se le buscó varias veces y nunca respondió",
    familia: "No se pudo contactar",
  },
  {
    valor: "datos_incorrectos",
    etiqueta: "Teléfono o correo incorrecto",
    ayuda: "El dato que llegó del portal no sirve",
    familia: "No se pudo contactar",
  },
  {
    valor: "no_es_la_persona",
    etiqueta: "No es la persona que preguntó",
    ayuda: "Contestó alguien más o dice no haber solicitado nada",
    familia: "No se pudo contactar",
  },
  {
    valor: "otra_opcion",
    etiqueta: "Encontró otra opción",
    ayuda: "Sigue buscando, pero ya no esta propiedad",
    familia: "Ya no está interesado",
  },
  {
    valor: "cerro_con_otro",
    etiqueta: "Compró o rentó con otra inmobiliaria",
    ayuda: "Ya cerró operación fuera. Ojo con el tiempo de respuesta",
    familia: "Ya no está interesado",
  },
  {
    valor: "cambio_planes",
    etiqueta: "Cambió de planes",
    ayuda: "Ya no se muda, lo pospuso o cambió de ciudad",
    familia: "Ya no está interesado",
  },
  {
    valor: "fuera_presupuesto",
    etiqueta: "Fuera de presupuesto",
    ayuda: "Lo que busca no alcanza para lo que preguntó",
    familia: "No calificaba",
  },
  {
    valor: "fuera_zona",
    etiqueta: "Fuera de zona o sin inventario",
    ayuda: "Busca algo que la oficina no maneja",
    familia: "No calificaba",
  },
  {
    valor: "sin_credito",
    etiqueta: "Sin crédito o sin respaldo",
    ayuda: "No califica para el crédito ni tiene aval o póliza",
    familia: "No calificaba",
  },
  {
    valor: "solo_informacion",
    etiqueta: "Solo pedía información",
    ayuda: "Curioseando precios, sin intención de mudarse",
    familia: "No era un lead real",
  },
  {
    valor: "duplicado",
    etiqueta: "Duplicado de otro registro",
    ayuda: "La misma persona ya está en la cartera",
    familia: "No era un lead real",
  },
  {
    valor: "spam",
    etiqueta: "Spam o prueba",
    ayuda: "Publicidad, broma o una prueba del equipo",
    familia: "No era un lead real",
  },
];

export const FAMILIAS_PERDIDA: { familia: FamiliaPerdida; ayuda: string }[] = [
  {
    familia: "No se pudo contactar",
    ayuda: "Nunca hubo conversación. Mide la calidad del dato que llega.",
  },
  {
    familia: "Ya no está interesado",
    ayuda: "Sí hubo conversación, pero ya no quiere. Mide tu velocidad.",
  },
  {
    familia: "No calificaba",
    ayuda: "Quería, pero no podía. Mide la puntería del anuncio.",
  },
  {
    familia: "No era un lead real",
    ayuda: "Nunca fue un prospecto. Limpia el denominador.",
  },
];

export const motivoPerdidaEtiqueta = (valor?: string) =>
  MOTIVOS_PERDIDA.find((m) => m.valor === valor)?.etiqueta ?? valor ?? "Sin motivo";

/** Cuántos intentos sin respuesta, y en cuántos días, antes de SUGERIR el
 *  descarte. La app nunca descarta sola: un lead que contesta al cuarto
 *  intento es un lead ganado que un automatismo habría tirado. */
export const INTENTOS_PARA_SUGERIR_DESCARTE = 4;
export const DIAS_VENTANA_INTENTOS = 10;

export const sugiereDescarte = (l: Lead): boolean => {
  if (l.estado === "Descartado" || l.estado === "Ganado") return false;
  if ((l.intentosContacto ?? 0) < INTENTOS_PARA_SUGERIR_DESCARTE) return false;
  if (!l.ultimoIntentoEn) return true;
  const dias = (Date.now() - Date.parse(l.ultimoIntentoEn)) / 864e5;
  return dias >= 0 && dias <= DIAS_VENTANA_INTENTOS * 3;
};

export const estaDescartado = (l: Lead) => l.estado === "Descartado";

/**
 * Un lead "operativo" es trabajo real del embudo: solicitud reciente, con
 * propiedad y etapa de verdad. Los tableros, los KPIs y el Kanban SOLO deben
 * contar estos. Si el directorio importado del CRM entrara al conteo, el
 * embudo mostraría más de mil prospectos donde hay poco más de cien y la
 * tasa de respuesta del equipo quedaría inservible.
 * La pantalla de Clientes es la única que ve la lista completa, con filtro.
 *
 * `fueraDeCrm` entra por la misma razón: si el broker borró el contacto en
 * EasyBroker, seguir contándolo en el embudo hace que la app y el CRM den
 * números distintos — que es justo lo que rompe la confianza en la app.
 */
export const esLeadOperativo = (l: Lead) =>
  !l.esDirectorio && !l.esHistorico && !l.fueraDeCrm;

/**
 * Lead del embudo que TODAVÍA está en juego. Se usa en las pantallas de
 * trabajo del día (tableros, agenda, avisos): un descartado ahí es ruido que
 * hace que el asesor deje de confiar en su propia lista de pendientes.
 *
 * Ojo: los tableros de MEDICIÓN (Reportes, Salud inmobiliaria, desempeño por
 * asesor) siguen usando esLeadOperativo a propósito. Un lead descartado sí
 * ocurrió y sí debe contar en el denominador — sacarlo inflaría artificialmente
 * la tasa de conversión.
 */
export const esLeadEnSeguimiento = (l: Lead) =>
  esLeadOperativo(l) && l.estado !== "Descartado";

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
  /** Identificador del tenant. Lo asigna la plataforma, no la oficina. */
  id?: string;
  nombre: string;
  direccion: string;
  logoUrl?: string;
  slug?: string;
  /** activa | suspendida | prueba. Solo lectura desde la app. */
  estado?: string;
  /** Código que el broker comparte con su equipo para que puedan registrarse. */
  codigoInvitacion?: string;
  telefono?: string;
  correo?: string;
  ciudad?: string;
  sitioWeb?: string;
  /**
   * De dónde sale la información de esta oficina.
   *
   * `"ninguno"` — la oficina usa esta plataforma COMO su CRM: captura
   * propiedades y clientes a mano y no hay sincronización que la pise.
   * `"easybroker"` — la información la manda ese CRM; la app la lee y agrega
   * encima lo que el CRM no tiene (embudo, BANT, seguimiento, agenda).
   *
   * Lo fija la plataforma al crear la oficina. La app solo lo lee: es lo que
   * decide si se muestran los avisos de sincronización o no.
   */
  crm?: CrmDeOficina;
  /** Cuántos administradores admite la oficina. Dos por defecto. */
  maxBrokers?: number;
}

/** CRM del que se alimenta una oficina. `ninguno` = trabaja sin CRM. */
export type CrmDeOficina = "ninguno" | "easybroker";

/** true si la oficina trabaja sin CRM y captura todo dentro de la plataforma. */
export const oficinaSinCrm = (a?: AgenciaInfo | null) =>
  (a?.crm ?? "ninguno") === "ninguno";

export const formatoMXN = (valor: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(valor);

// ============================================================
// Agenda de citas
// ============================================================
// Nota de nombres: ya existe `CitaCliente` / `EstadoCita` dentro del proceso
// de cierre (ProcesoCierre). Son otra cosa — hitos de una operación ya
// cerrada. Lo de aquí es la agenda de campo del asesor, así que lleva el
// sufijo `Agenda` para que nadie las confunda al importar.

export type TipoCitaAgenda = "visita" | "llamada" | "firma" | "captacion" | "otro";

export type EstadoCitaAgenda =
  | "Agendada"
  | "Confirmada"
  | "Realizada"
  | "No asistió"
  | "Cancelada";

export interface CitaAgenda {
  id: string;
  /** Versión de concurrencia; evita perder reprogramaciones o estados ajenos. */
  version?: number;
  /** Oficina (tenant). Lo fija la capa de datos, no el formulario. */
  agenciaId?: string;
  /** Dueño de la cita. Es el filtro que separa "mis citas" de "las del equipo". */
  asesorId: string;
  leadId?: string;
  propiedadId?: string;
  titulo: string;
  tipo: TipoCitaAgenda;
  /** ISO 8601 con zona. Nunca guardar hora local sin offset: al sincronizar
   *  con Google/iPhone una hora sin zona se corre según el dispositivo. */
  inicio: string;
  fin: string;
  ubicacion: string;
  notas: string;
  estado: EstadoCitaAgenda;
  /** Quién la creó (puede ser el broker agendando por su asesor). */
  creadaPor?: string;
  creadoEn?: string;
}

export const TIPOS_CITA: {
  valor: TipoCitaAgenda;
  etiqueta: string;
  /** Duración por defecto en minutos: evita que el asesor la teclee. */
  duracionMin: number;
}[] = [
  { valor: "visita", etiqueta: "Visita a propiedad", duracionMin: 60 },
  { valor: "captacion", etiqueta: "Cita de captación", duracionMin: 60 },
  { valor: "llamada", etiqueta: "Llamada / videollamada", duracionMin: 30 },
  { valor: "firma", etiqueta: "Firma o notaría", duracionMin: 90 },
  { valor: "otro", etiqueta: "Otro", duracionMin: 60 },
];

/** Estados que ya no ocupan lugar en la agenda futura. */
export const ESTADOS_CITA_CERRADOS: EstadoCitaAgenda[] = [
  "Realizada",
  "No asistió",
  "Cancelada",
];

// Quién tiene agenda. Propietario y cliente NO: su relación con la oficina es
// puntual, darles un calendario los obliga a mantener algo que no van a
// mantener. Lo que sí necesitan (saber que hay una visita) se resuelve con un
// aviso, no con una vista de calendario.
export const ROLES_CON_AGENDA: UserRole[] = [
  "broker",
  "asesor_independiente",
  "asesor_equipo",
];

export const tieneAgenda = (rol: UserRole) => ROLES_CON_AGENDA.includes(rol);

/** El broker ve la agenda de toda su oficina; el asesor solo la suya. */
export const veAgendaDelEquipo = (rol: UserRole) => rol === "broker";
