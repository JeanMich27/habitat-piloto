// Notificaciones derivadas de datos reales.
//
// No hay tabla de notificaciones ni proceso que las genere: se calculan al
// vuelo a partir de lo que ya está en la base. Esto tiene dos ventajas —
// no se puede desincronizar de la realidad, y no requiere infraestructura
// nueva. Lo único que se guarda es qué avisos ya vio cada usuario, en su
// propio navegador.
//
// Cada aviso responde a "¿qué pasó?" y lleva directo al registro que lo
// originó: nunca es un mensaje sin destino.
import type { Lead, Operacion, Propiedad, SolicitudEstado, Usuario } from "../types";
import { evaluarBant } from "../domain/leads/qualification";

export type DestinoNotificacion = "cliente" | "propiedad";

export interface Notificacion {
  id: string;
  titulo: string;
  detalle: string;
  fecha: string;
  /** A dónde lleva al tocarla. */
  destino: DestinoNotificacion;
  refId: string;
  /** Requiere acción del asesor (se pinta en ámbar). */
  urgente?: boolean;
}

const DIAS = 1000 * 60 * 60 * 24;
const LLAVE_LEIDAS = "habitat-notificaciones-leidas";

const fechaValida = (iso?: string) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * Construye la lista de avisos para un usuario concreto.
 * Solo mira lo que le pertenece: el asesor no recibe ruido de otros.
 */
export function construirNotificaciones(
  usuario: Usuario,
  leads: Lead[],
  propiedades: Propiedad[],
  solicitudes: SolicitudEstado[] = [],
  usuarios: Usuario[] = [],
  operaciones: Operacion[] = [],
  ahora = Date.now(),
): Notificacion[] {
  const esBroker = usuario.rol === "broker";
  const misLeads = esBroker ? leads : leads.filter((l) => l.asesorId === usuario.id);
  const misPropiedades = esBroker
    ? propiedades
    : propiedades.filter((p) => p.asesorId === usuario.id);

  const avisos: Notificacion[] = [];

  const tituloProp = (id: string) => propiedades.find((p) => p.id === id)?.titulo ?? "una propiedad";
  const nombreDe = (id: string) => usuarios.find((u) => u.id === id)?.nombre ?? "Un asesor";
  const nombreLead = (id: string) => leads.find((lead) => lead.id === id)?.nombre ?? "un cliente";

  // --- Operaciones: la fila es la notificación y nunca puede desfasarse ---
  operaciones.forEach((operacion) => {
    if (esBroker && operacion.estadoValidacion === "reportada") {
      avisos.push({
        id: `operacion-${operacion.id}-reportada`,
        titulo: "Operación pendiente de validar",
        detalle: `${nombreDe(operacion.reportadoPor)} reportó el cierre de ${nombreLead(operacion.leadId)}.`,
        fecha: operacion.reportadoEn,
        destino: "cliente",
        refId: operacion.leadId,
        urgente: true,
      });
    }
    if (operacion.reportadoPor === usuario.id && operacion.estadoValidacion === "devuelta") {
      avisos.push({
        id: `operacion-${operacion.id}-devuelta-${operacion.version}`,
        titulo: "Corrige el reporte de cierre",
        detalle: operacion.observacionBroker ?? `El cierre de ${nombreLead(operacion.leadId)} requiere cambios.`,
        fecha: operacion.resueltoEn ?? operacion.reportadoEn,
        destino: "cliente",
        refId: operacion.leadId,
        urgente: true,
      });
    }
    if (operacion.reportadoPor === usuario.id && operacion.estadoValidacion === "validada") {
      const cuando = fechaValida(operacion.resueltoEn);
      if (cuando !== null && (ahora - cuando) / DIAS <= 14) avisos.push({
        id: `operacion-${operacion.id}-validada`,
        titulo: "Operación validada",
        detalle: `El cierre de ${nombreLead(operacion.leadId)} ya cuenta como ganado.${operacion.comisionBrutaConfirmada == null ? " La comisión sigue pendiente." : ""}`,
        fecha: operacion.resueltoEn!,
        destino: "cliente",
        refId: operacion.leadId,
      });
    }
  });

  if (esBroker) propiedades.forEach((propiedad) => {
    if (propiedad.estatus !== "Vendida o Rentada" || propiedad.crmEstatus !== "published") return;
    avisos.push({
      id: `crm-publicada-${propiedad.id}`,
      titulo: "EasyBroker sigue mostrando una propiedad publicada",
      detalle: `${propiedad.titulo} ya tiene un cierre validado en HomeID. Revisa su publicación en EasyBroker.`,
      fecha: propiedad.ultimaActividad ?? propiedad.capturadaEl,
      destino: "propiedad",
      refId: propiedad.id,
      urgente: true,
    });
  });

  // --- Solicitudes de cambio de estado ---
  // Broker: cada solicitud pendiente exige su aprobación (se aplica sola al
  // aprobar). Solicitante: el resultado de lo que pidió.
  solicitudes.forEach((s) => {
    if (esBroker && s.estatus === "pendiente") {
      avisos.push({
        id: `solicitud-${s.id}`,
        titulo: "Solicitud de cambio de estado",
        detalle: `${nombreDe(s.solicitanteId)} pide pasar "${tituloProp(s.propiedadId)}" de ${s.estadoActual} a ${s.estadoSolicitado}.${s.motivo ? ` Motivo: ${s.motivo}` : ""}`,
        fecha: s.creadoEn,
        destino: "propiedad",
        refId: s.propiedadId,
        urgente: true,
      });
    }
    if (s.solicitanteId === usuario.id && s.estatus !== "pendiente") {
      const cuando = fechaValida(s.resueltoEn);
      if (cuando === null || (ahora - cuando) / DIAS > 14) return;
      avisos.push({
        id: `solicitud-${s.id}-${s.estatus}`,
        titulo:
          s.estatus === "aprobada"
            ? "Tu cambio de estado fue aprobado"
            : "Tu solicitud fue rechazada",
        detalle: `"${tituloProp(s.propiedadId)}" → ${s.estadoSolicitado}${
          s.estatus === "rechazada" ? " (no aplicado)" : ""
        }.`,
        fecha: s.resueltoEn ?? s.creadoEn,
        destino: "propiedad",
        refId: s.propiedadId,
        urgente: s.estatus === "rechazada",
      });
    }
  });

  // --- Clientes nuevos sin contactar ---
  misLeads.forEach((l) => {
    if (l.primerContactoEn) return;
    const creado = fechaValida(l.creado);
    if (creado === null) return;
    const dias = Math.floor((ahora - creado) / DIAS);
    if (dias > 30) return; // más viejo que un mes ya no es "nuevo"
    avisos.push({
      id: `lead-nuevo-${l.id}`,
      titulo: dias <= 1 ? "Llegó un cliente nuevo" : "Cliente sin contactar",
      detalle:
        dias <= 1
          ? `${l.nombre} entró y todavía no lo contactas.`
          : `${l.nombre} lleva ${dias} días esperando respuesta.`,
      fecha: l.creado,
      destino: "cliente",
      refId: l.id,
      urgente: dias >= 2,
    });
  });

  // --- Prospectos avanzados sin calificar ---
  misLeads.forEach((l) => {
    if (evaluarBant(l.bant).calificado) return;
    if (!["Visitado", "Negociacion", "Cierre"].includes(l.etapa)) return;
    avisos.push({
      id: `lead-sincalificar-${l.id}`,
      titulo: "Falta calificar a un cliente avanzado",
      detalle: `${l.nombre} está en ${l.etapa} y no tiene calificación.`,
      fecha: l.creado,
      destino: "cliente",
      refId: l.id,
      urgente: true,
    });
  });

  // --- Clientes listos para cerrar ---
  misLeads.forEach((l) => {
    const evaluacion = evaluarBant(l.bant);
    if (evaluacion.puntaje === null || evaluacion.puntaje < 80 || !l.bant) return;
    if (["Cierre"].includes(l.etapa)) return;
    avisos.push({
      id: `lead-hot-${l.id}-${l.bant.calificadoEl}`,
      titulo: "Cliente listo para cerrar",
      detalle: `${l.nombre} calificó ${evaluacion.puntaje}/100. Agenda visita.`,
      fecha: l.bant.calificadoEl,
      destino: "cliente",
      refId: l.id,
    });
  });

  // --- Propiedades asignadas recientemente ---
  misPropiedades.forEach((p) => {
    const capturada = fechaValida(p.capturadaEl);
    if (capturada === null) return;
    if ((ahora - capturada) / DIAS > 14) return;
    avisos.push({
      id: `prop-nueva-${p.id}`,
      titulo: esBroker ? "Se dio de alta una propiedad" : "Se te asignó una propiedad",
      detalle: `${p.titulo} — ${p.ubicacion}.`,
      fecha: p.capturadaEl,
      destino: "propiedad",
      refId: p.id,
    });
  });

  // --- Cambios de estado de propiedades (baja, pausa, publicación) ---
  misPropiedades.forEach((p) => {
    (p.eventos ?? [])
      .filter((e) => e.tipo === "Estado")
      .forEach((e) => {
        const cuando = fechaValida(e.fecha);
        if (cuando === null || (ahora - cuando) / DIAS > 14) return;
        const baja = /suspendida|vendida|rentada|pausada|cerrada/i.test(e.descripcion);
        avisos.push({
          id: `prop-estado-${p.id}-${e.id}`,
          titulo: baja ? "Se dio de baja una propiedad" : "Cambió el estado de una propiedad",
          detalle: `${p.titulo}: ${e.descripcion}`,
          fecha: e.fecha,
          destino: "propiedad",
          refId: p.id,
          urgente: baja,
        });
      });
  });

  // --- Propiedades publicadas sin movimiento ---
  misPropiedades.forEach((p) => {
    if (p.estatus !== "Publicada") return;
    const ultima = fechaValida(p.ultimaActividad ?? p.publicadaEl);
    if (ultima === null) return;
    const dias = Math.floor((ahora - ultima) / DIAS);
    if (dias < 30) return;
    avisos.push({
      id: `prop-inactiva-${p.id}`,
      titulo: "Propiedad sin movimiento",
      detalle: `${p.titulo} lleva ${dias} días sin actividad.`,
      fecha: p.ultimaActividad ?? p.publicadaEl ?? p.capturadaEl,
      destino: "propiedad",
      refId: p.id,
      urgente: true,
    });
  });

  return avisos.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
}

// --- Estado de lectura (por usuario, en su navegador) ---

export function leerVistas(usuarioId: string): Set<string> {
  try {
    const crudo = window.localStorage.getItem(`${LLAVE_LEIDAS}-${usuarioId}`);
    return new Set<string>(crudo ? JSON.parse(crudo) : []);
  } catch {
    return new Set<string>();
  }
}

export function guardarVistas(usuarioId: string, ids: Set<string>) {
  try {
    // Se acotan a 300 para que el almacenamiento no crezca sin límite.
    const recortadas = [...ids].slice(-300);
    window.localStorage.setItem(`${LLAVE_LEIDAS}-${usuarioId}`, JSON.stringify(recortadas));
  } catch {
    /* Sin almacenamiento disponible: las notificaciones se ven siempre como nuevas. */
  }
}

export function tiempoRelativo(iso: string, ahora = Date.now()): string {
  const t = fechaValida(iso);
  if (t === null) return "";
  const min = Math.floor((ahora - t) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} ${d === 1 ? "día" : "días"}`;
  return new Date(t).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}
