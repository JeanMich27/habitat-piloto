// Convierte entre las filas de Supabase (snake_case) y los tipos que ya usa
// el frontend (camelCase, definidos en src/types.ts). Los campos anidados
// (propietario, documentos, eventos, comparables, cierre, notificaciones) se
// guardan tal cual en columnas JSONB, así que no requieren transformación.
import { getAgenciaActual } from "./agenciaActual";
import { normalizarEstatus } from "../types";
import type {
  AgenciaInfo,
  CitaAgenda,
  Lead,
  Propiedad,
  SolicitudEstado,
  Usuario,
} from "../types";

// Toda fila que se escribe lleva la oficina de la sesión. Ver agenciaActual.ts.

export function propiedadToRow(p: Propiedad) {
  return {
    id: p.id,
    agencia_id: getAgenciaActual(),
    titulo: p.titulo,
    ubicacion: p.ubicacion,
    municipio: p.municipio,
    estado: p.estado,
    precio: p.precio,
    recamaras: p.recamaras,
    banos: p.banos,
    m2: p.m2,
    descripcion: p.descripcion,
    estatus: p.estatus,
    tipo_inmueble: p.tipoInmueble,
    tipo_operacion: p.tipoOperacion,
    asesor_id: p.asesorId,
    propietario: p.propietario,
    documentos: p.documentos,
    capturada_el: p.capturadaEl,
    publicada_el: p.publicadaEl ?? null,
    ultima_actividad: p.ultimaActividad ?? null,
    eventos: p.eventos ?? [],
    comparables: p.comparables ?? [],

    // --- Campos que antes se perdían al guardar ---
    // `rowToPropiedad` los leía pero este conversor no los escribía, así que
    // toda propiedad creada desde la app nacía sin fotos, sin amenidades y sin
    // comisión pactada. En actualizaciones no se perdía nada (PostgREST solo
    // actualiza las columnas enviadas), pero en altas sí.
    imagenes: p.imagenes ?? [],
    amenidades: p.amenidades ?? [],
    m2_terreno: p.m2Terreno ?? 0,
    medios_banos: p.mediosBanos ?? 0,
    estacionamientos: p.estacionamientos ?? 0,
    niveles: p.niveles ?? null,
    mantenimiento: p.mantenimiento ?? null,
    video_url: p.videoUrl ?? null,
    tour_virtual_url: p.tourVirtualUrl ?? null,
    colonia: p.colonia ?? "",
    calle: p.calle ?? "",
    codigo_postal: p.codigoPostal ?? "",
    comision_tipo: p.comisionTipo ?? null,
    comision_valor: p.comisionValor ?? null,
    comision_compartida_pct: p.comisionCompartidaPct ?? null,
    exclusiva: p.exclusiva ?? false,
    crm_origen: p.crmOrigen ?? null,
    crm_id_interno: p.crmIdInterno ?? null,
    enlaces_promocion: p.enlacesPromocion ?? [],

    // NO se escriben a propósito — son propiedad de la sincronización con
    // EasyBroker y la app no los edita:
    //   eb_public_id, eb_public_url, eb_sincronizado_en, latitud, longitud
    // Omitirlos en el upsert conserva el valor que tenga la fila. Escribirlos
    // desde un objeto en memoria desactualizado rompería el vínculo con el CRM.
  };
}

export function rowToPropiedad(r: any): Propiedad {
  return {
    id: r.id,
    titulo: r.titulo,
    ubicacion: r.ubicacion,
    municipio: r.municipio,
    estado: r.estado,
    precio: Number(r.precio) || 0,
    recamaras: Number(r.recamaras) || 0,
    banos: Number(r.banos) || 0,
    m2: Number(r.m2) || 0,
    descripcion: r.descripcion,
    // Normaliza valores previos a la migración 08 (Activa, Intake, …).
    estatus: normalizarEstatus(r.estatus),
    tipoInmueble: r.tipo_inmueble,
    tipoOperacion: r.tipo_operacion,
    asesorId: r.asesor_id,
    propietario: r.propietario ?? { nombre: "", correo: "", telefono: "" },
    documentos: r.documentos ?? [],
    capturadaEl: r.capturada_el,
    publicadaEl: r.publicada_el ?? undefined,
    ultimaActividad: r.ultima_actividad ?? undefined,
    eventos: r.eventos ?? [],
    comparables: r.comparables ?? [],
    // Datos del CRM
    imagenes: r.imagenes ?? [],
    amenidades: r.amenidades ?? [],
    m2Terreno: r.m2_terreno != null ? Number(r.m2_terreno) : undefined,
    mediosBanos: r.medios_banos ?? undefined,
    estacionamientos: r.estacionamientos ?? undefined,
    niveles: r.niveles ?? undefined,
    mantenimiento: r.mantenimiento != null ? Number(r.mantenimiento) : undefined,
    videoUrl: r.video_url ?? undefined,
    tourVirtualUrl: r.tour_virtual_url ?? undefined,
    colonia: r.colonia ?? undefined,
    calle: r.calle ?? undefined,
    codigoPostal: r.codigo_postal ?? undefined,
    comisionTipo: r.comision_tipo ?? undefined,
    comisionValor: r.comision_valor != null ? Number(r.comision_valor) : undefined,
    comisionCompartidaPct:
      r.comision_compartida_pct != null ? Number(r.comision_compartida_pct) : undefined,
    exclusiva: r.exclusiva ?? undefined,
    crmOrigen: r.crm_origen ?? undefined,
    crmIdInterno: r.crm_id_interno ?? undefined,
    urlPublica: r.eb_public_url ?? undefined,
    enlacesPromocion: r.enlaces_promocion ?? [],
  };
}

// --- Solicitudes de cambio de estado ---------------------------------------

export function rowToSolicitud(r: any): SolicitudEstado {
  return {
    id: r.id,
    propiedadId: r.propiedad_id,
    solicitanteId: r.solicitante_id,
    estadoActual: r.estado_actual,
    estadoSolicitado: r.estado_solicitado,
    motivo: r.motivo ?? undefined,
    estatus: r.estatus,
    resueltoPor: r.resuelto_por ?? undefined,
    resueltoEn: r.resuelto_en ?? undefined,
    creadoEn: r.creado_en,
  };
}

export function leadToRow(l: Lead) {
  // `telefono_norm` no se escribe aquí a propósito: lo calcula un trigger en la
  // base con la misma función `norm_tel()` que usa la ingesta de EasyBroker.
  // Duplicar esa normalización en TypeScript garantizaría que las dos copias se
  // separen con el tiempo y aparezcan leads duplicados.
  // Las columnas eb_*, requiere_revision, motivo_revision, es_directorio,
  // es_historico y fuera_de_crm pertenecen a la ingesta: el frontend las lee
  // pero nunca las escribe. Omitirlas del upsert las conserva intactas.
  return {
    id: l.id,
    agencia_id: getAgenciaActual(),
    nombre: l.nombre,
    telefono: l.telefono,
    correo: (l.correo ?? "").toLowerCase(),
    etapa: l.etapa,
    origen: l.origen,
    interes_propiedad_id: l.interesPropiedadId,
    asesor_id: l.asesorId,
    creado: l.creado,
    nota: l.nota,
    primer_contacto_en: l.primerContactoEn ?? null,
    monto_oferta: l.montoOferta ?? null,
    cierre: l.cierre ?? null,
    ocupacion: l.ocupacion ?? "",
    bant: l.bant ?? null,
    historial: l.historial ?? [],
    // Desenlace: lo escribe el asesor desde la app, nunca el sync.
    estado_lead: l.estado ?? "Activo",
    familia_perdida: l.familiaPerdida ?? null,
    motivo_perdida: l.motivoPerdida ?? null,
    detalle_perdida: l.detallePerdida ?? null,
    cerrado_en: l.cerradoEn ?? null,
    cerrado_por: l.cerradoPor ?? null,
    intentos_contacto: l.intentosContacto ?? 0,
    ultimo_intento_en: l.ultimoIntentoEn ?? null,
  };
}

export function rowToLead(r: any): Lead {
  return {
    id: r.id,
    nombre: r.nombre,
    telefono: r.telefono,
    correo: r.correo ?? "",
    etapa: r.etapa,
    origen: r.origen,
    interesPropiedadId: r.interes_propiedad_id,
    asesorId: r.asesor_id,
    creado: r.creado,
    nota: r.nota,
    primerContactoEn: r.primer_contacto_en ?? undefined,
    montoOferta: r.monto_oferta != null ? Number(r.monto_oferta) : undefined,
    cierre: r.cierre ?? undefined,
    ocupacion: r.ocupacion ?? undefined,
    bant: r.bant ?? undefined,
    historial: r.historial ?? [],
    ebPropertyId: r.eb_property_id ?? undefined,
    esDirectorio: r.es_directorio === true,
    esHistorico: r.es_historico === true,
    fueraDeCrm: r.fuera_de_crm === true,
    ebVistoEn: r.eb_visto_en ?? undefined,
    estado: (r.estado_lead ?? "Activo") as Lead["estado"],
    familiaPerdida: r.familia_perdida ?? undefined,
    motivoPerdida: r.motivo_perdida ?? undefined,
    detallePerdida: r.detalle_perdida ?? undefined,
    cerradoEn: r.cerrado_en ?? undefined,
    cerradoPor: r.cerrado_por ?? undefined,
    intentosContacto: r.intentos_contacto ?? 0,
    ultimoIntentoEn: r.ultimo_intento_en ?? undefined,
  };
}

export function usuarioToRow(u: Usuario) {
  return {
    id: u.id,
    agencia_id: u.agenciaId ?? getAgenciaActual(),
    nombre: u.nombre,
    correo: u.correo,
    telefono: u.telefono,
    rol: u.rol,
    puesto: u.puesto,
    iniciales: u.iniciales,
    estado_cuenta: u.estadoCuenta,
    puede_ver_otras_propiedades: u.puedeVerOtrasPropiedades ?? false,
  };
}

export function rowToUsuario(r: any): Usuario {
  return {
    id: r.id,
    nombre: r.nombre,
    correo: r.correo,
    telefono: r.telefono,
    rol: r.rol,
    puesto: r.puesto,
    iniciales: r.iniciales,
    estadoCuenta: r.estado_cuenta,
    puedeVerOtrasPropiedades: r.puede_ver_otras_propiedades ?? false,
    agenciaId: r.agencia_id,
  };
}

export function agenciaToRow(a: AgenciaInfo) {
  // Solo se actualizan los campos editables desde la app. `estado`, `plan`,
  // `codigo_invitacion`, `crm` y `max_brokers` los administra la plataforma:
  // si la oficina pudiera cambiar `crm` a mano, apagaría o encendería la
  // sincronización de su propio CRM desde una pantalla de configuración.
  return {
    id: getAgenciaActual(),
    nombre: a.nombre,
    direccion: a.direccion,
    logo_url: a.logoUrl ?? null,
    telefono: a.telefono ?? "",
    correo: a.correo ?? "",
    ciudad: a.ciudad ?? "",
    sitio_web: a.sitioWeb ?? "",
  };
}

export function rowToAgencia(r: any): AgenciaInfo {
  return {
    id: r.id,
    nombre: r.nombre,
    direccion: r.direccion,
    logoUrl: r.logo_url ?? undefined,
    slug: r.slug ?? undefined,
    estado: r.estado ?? undefined,
    codigoInvitacion: r.codigo_invitacion ?? undefined,
    telefono: r.telefono ?? undefined,
    correo: r.correo ?? undefined,
    ciudad: r.ciudad ?? undefined,
    sitioWeb: r.sitio_web ?? undefined,
    crm: (r.crm ?? "ninguno") as AgenciaInfo["crm"],
    maxBrokers: r.max_brokers ?? 2,
  };
}

export function configuracionToRow(permisoEquipoVerTodas: boolean, notificaciones: Record<string, boolean>) {
  // `id` y `agencia_id` coinciden: hay exactamente una configuración por oficina.
  const agencia = getAgenciaActual();
  return {
    id: agencia,
    agencia_id: agencia,
    permiso_equipo_ver_todas: permisoEquipoVerTodas,
    notificaciones,
  };
}

export function rowToConfiguracion(r: any): {
  permisoEquipoVerTodas: boolean;
  notificaciones: Record<string, boolean>;
} {
  return {
    permisoEquipoVerTodas: r.permiso_equipo_ver_todas ?? false,
    notificaciones: r.notificaciones ?? {},
  };
}

// --- Agenda -----------------------------------------------------------------

export function citaToRow(c: CitaAgenda) {
  return {
    id: c.id,
    agencia_id: getAgenciaActual(),
    asesor_id: c.asesorId,
    lead_id: c.leadId ?? null,
    propiedad_id: c.propiedadId ?? null,
    titulo: c.titulo,
    tipo: c.tipo,
    inicio: c.inicio,
    fin: c.fin,
    ubicacion: c.ubicacion ?? "",
    notas: c.notas ?? "",
    estado: c.estado,
    creada_por: c.creadaPor ?? null,
    // `actualizado_en` lo pone un trigger; enviarlo desde el cliente permitiria
    // falsear el orden de los cambios.
  };
}

export function rowToCita(r: any): CitaAgenda {
  return {
    id: r.id,
    agenciaId: r.agencia_id ?? undefined,
    asesorId: r.asesor_id,
    leadId: r.lead_id ?? undefined,
    propiedadId: r.propiedad_id ?? undefined,
    titulo: r.titulo,
    tipo: r.tipo,
    inicio: r.inicio,
    fin: r.fin,
    ubicacion: r.ubicacion ?? "",
    notas: r.notas ?? "",
    estado: r.estado,
    creadaPor: r.creada_por ?? undefined,
    creadoEn: r.creado_en ?? undefined,
  };
}
