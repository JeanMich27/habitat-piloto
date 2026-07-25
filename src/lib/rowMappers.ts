// Convierte entre las filas de Supabase (snake_case) y los tipos que ya usa
// el frontend (camelCase, definidos en src/types.ts). Los campos anidados
// (propietario, documentos, eventos, comparables, cierre, notificaciones) se
// guardan tal cual en columnas JSONB, así que no requieren transformación.
import type { AgenciaInfo, Lead, Propiedad, Usuario } from "../types";

export function propiedadToRow(p: Propiedad) {
  return {
    id: p.id,
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
    estatus: r.estatus,
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
  };
}

export function leadToRow(l: Lead) {
  return {
    id: l.id,
    nombre: l.nombre,
    telefono: l.telefono,
    etapa: l.etapa,
    origen: l.origen,
    interes_propiedad_id: l.interesPropiedadId,
    asesor_id: l.asesorId,
    creado: l.creado,
    nota: l.nota,
    primer_contacto_en: l.primerContactoEn ?? null,
    monto_oferta: l.montoOferta ?? null,
    cierre: l.cierre ?? null,
  };
}

export function rowToLead(r: any): Lead {
  return {
    id: r.id,
    nombre: r.nombre,
    telefono: r.telefono,
    etapa: r.etapa,
    origen: r.origen,
    interesPropiedadId: r.interes_propiedad_id,
    asesorId: r.asesor_id,
    creado: r.creado,
    nota: r.nota,
    primerContactoEn: r.primer_contacto_en ?? undefined,
    montoOferta: r.monto_oferta != null ? Number(r.monto_oferta) : undefined,
    cierre: r.cierre ?? undefined,
  };
}

export function usuarioToRow(u: Usuario) {
  return {
    id: u.id,
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
  };
}

export function agenciaToRow(a: AgenciaInfo) {
  return { id: "default", nombre: a.nombre, direccion: a.direccion, logo_url: a.logoUrl ?? null };
}

export function rowToAgencia(r: any): AgenciaInfo {
  return { nombre: r.nombre, direccion: r.direccion, logoUrl: r.logo_url ?? undefined };
}

export function configuracionToRow(permisoEquipoVerTodas: boolean, notificaciones: Record<string, boolean>) {
  return { id: "default", permiso_equipo_ver_todas: permisoEquipoVerTodas, notificaciones };
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
