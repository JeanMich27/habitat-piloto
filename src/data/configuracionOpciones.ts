// Definiciones compartidas entre App.tsx (estado inicial) y la pantalla de
// Configuración. Los permisos por rol reflejan el modelo de negocio confirmado
// en el análisis inicial (Broker y Asesor Independiente = mismo rol con control
// total; Asesor de Equipo = acotado, sin funciones administrativas). Por eso
// solo se muestran como referencia fija, no como checkboxes editables: hacerlos
// editables sin que el resto de la app lea ese estado sería simular un control
// que no existe.

export interface PermisoReferencia {
  id: string;
  label: string;
  broker: boolean;
  asesorIndependiente: boolean;
  asesorEquipo: boolean;
}

export const PERMISOS_REFERENCIA: PermisoReferencia[] = [
  {
    id: "ver_todas_propiedades",
    label: "Ver todas las propiedades de la agencia",
    broker: true,
    asesorIndependiente: true,
    asesorEquipo: false,
  },
  {
    id: "editar_propiedades_ajenas",
    label: "Editar propiedades captadas por otros asesores",
    broker: true,
    asesorIndependiente: true,
    asesorEquipo: false,
  },
  {
    id: "validar_documentos",
    label: "Validar documentos y aprobar publicación",
    broker: true,
    asesorIndependiente: true,
    asesorEquipo: false,
  },
  {
    id: "gestionar_asesores",
    label: "Invitar y gestionar asesores",
    broker: true,
    asesorIndependiente: false,
    asesorEquipo: false,
  },
  {
    id: "ver_reportes",
    label: "Ver reportes de la agencia",
    broker: true,
    asesorIndependiente: true,
    asesorEquipo: false,
  },
  {
    id: "editar_configuracion",
    label: "Editar configuración de la agencia",
    broker: true,
    asesorIndependiente: false,
    asesorEquipo: false,
  },
];

export interface EventoNotificacion {
  id: string;
  label: string;
}

export const EVENTOS_NOTIFICACION: EventoNotificacion[] = [
  { id: "lead_asignado", label: "Nuevo lead asignado a un asesor" },
  { id: "lead_sin_contactar", label: "Lead sin contactar más de 24 h" },
  { id: "propiedad_a_validacion", label: "Propiedad enviada a validación" },
  { id: "propiedad_publicada", label: "Propiedad aprobada y publicada" },
  { id: "oferta_recibida", label: "Oferta recibida (Negociación)" },
  { id: "cierre_completado", label: "Cierre completado" },
];

export const NOTIFICACIONES_DEFAULT: Record<string, boolean> = {
  lead_asignado: true,
  lead_sin_contactar: true,
  propiedad_a_validacion: true,
  propiedad_publicada: false,
  oferta_recibida: true,
  cierre_completado: true,
};
