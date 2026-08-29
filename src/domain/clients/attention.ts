import type { Lead, Operacion, Tarea, Usuario } from "../../types";
import { evaluarBant } from "../leads/qualification";

export type BandejaCliente =
  | "por_atender"
  | "en_seguimiento"
  | "cerrados"
  | "contactos"
  | "archivo";

export type MotivoAtencion =
  | "cierre_por_validar"
  | "cierre_devuelto"
  | "seguimiento_vencido"
  | "sin_contactar"
  | "seguimiento_hoy"
  | "sin_respuesta_sin_fecha"
  | "seguimiento_programado"
  | "sin_proxima_accion"
  | "cerrado"
  | "contacto"
  | "archivo";

export interface ClienteClasificado {
  lead: Lead;
  bandeja: BandejaCliente;
  motivo: MotivoAtencion;
  proximaTarea?: Tarea;
  operacion?: Operacion;
  altaPrioridad: boolean;
  prioridad: number;
}

export interface ConteosBandeja {
  porAtender: number;
  enSeguimiento: number;
  cerrados: number;
  contactos: number;
  archivo: number;
  vencidos: number;
  paraHoy: number;
  altaPrioridad: number;
  cierresPorValidar: number;
}

export interface BandejaClientes {
  clientes: ClienteClasificado[];
  conteos: ConteosBandeja;
  /**
   * true cuando ningún lead visible tiene todavía una tarea (de cualquier
   * estado) asociada. Sirve para no mostrar "0 seguimientos vencidos" como si
   * fuera "todo al día" cuando en realidad nadie ha usado "Programar
   * seguimiento" todavía.
   */
  sinSeguimientosRegistrados: boolean;
}

interface ConstruirBandejaInput {
  leads: Lead[];
  tareas: Tarea[];
  operaciones: Operacion[];
  usuario: Usuario;
  ahora?: number;
  zonaHoraria?: string;
}

const fechaLocal = (valor: string | number, zonaHoraria: string) => {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(valor));
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((item) => item.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
};

const masReciente = (a: Operacion, b: Operacion) =>
  Date.parse(a.reportadoEn) >= Date.parse(b.reportadoEn) ? a : b;

const puedeVerTodos = (usuario: Usuario) =>
  usuario.rol === "broker" ||
  usuario.rol === "asesor_independiente" ||
  usuario.puedeVerOtrasPropiedades === true;

/**
 * Fuente única para navegación, lista e indicadores de Clientes.
 *
 * No se persiste `bandeja`: depende de la hora actual, del rol y de tareas que
 * pueden vencer sin que cambie el lead. Guardarla produciría estados obsoletos.
 */
export function construirBandejaClientes({
  leads,
  tareas,
  operaciones,
  usuario,
  ahora = Date.now(),
  zonaHoraria = "America/Mexico_City",
}: ConstruirBandejaInput): BandejaClientes {
  const visibles = puedeVerTodos(usuario)
    ? leads
    : leads.filter((lead) => lead.asesorId === usuario.id);
  const idsVisibles = new Set(visibles.map((lead) => lead.id));
  const hoy = fechaLocal(ahora, zonaHoraria);

  const sinSeguimientosRegistrados = !tareas.some(
    (tarea) => tarea.leadId && idsVisibles.has(tarea.leadId),
  );

  const tareasPorLead = new Map<string, Tarea[]>();
  tareas
    .filter((tarea) => tarea.estado === "pendiente" && tarea.leadId && idsVisibles.has(tarea.leadId))
    .forEach((tarea) => {
      const actuales = tareasPorLead.get(tarea.leadId!) ?? [];
      actuales.push(tarea);
      tareasPorLead.set(tarea.leadId!, actuales);
    });
  tareasPorLead.forEach((items) =>
    items.sort((a, b) => Date.parse(a.venceEn) - Date.parse(b.venceEn)),
  );

  const operacionPorLead = new Map<string, Operacion>();
  operaciones
    .filter((operacion) => idsVisibles.has(operacion.leadId))
    .forEach((operacion) => {
      const actual = operacionPorLead.get(operacion.leadId);
      operacionPorLead.set(operacion.leadId, actual ? masReciente(actual, operacion) : operacion);
    });

  const clientes = visibles.map<ClienteClasificado>((lead) => {
    const proximaTarea = tareasPorLead.get(lead.id)?.[0];
    const operacion = operacionPorLead.get(lead.id);
    const altaPrioridad =
      !lead.esDirectorio &&
      !lead.esHistorico &&
      !lead.fueraDeCrm &&
      lead.estado !== "Ganado" &&
      lead.estado !== "Descartado" &&
      evaluarBant(lead.bant).clasificacion === "Hot";

    if (lead.esDirectorio) {
      return { lead, bandeja: "contactos", motivo: "contacto", proximaTarea, operacion, altaPrioridad: false, prioridad: 80 };
    }
    if (lead.esHistorico || lead.fueraDeCrm) {
      return { lead, bandeja: "archivo", motivo: "archivo", proximaTarea, operacion, altaPrioridad: false, prioridad: 90 };
    }
    if (lead.estado === "Ganado" || lead.estado === "Descartado") {
      return { lead, bandeja: "cerrados", motivo: "cerrado", proximaTarea, operacion, altaPrioridad: false, prioridad: 70 };
    }
    if (usuario.rol === "broker" && operacion?.estadoValidacion === "reportada") {
      return { lead, bandeja: "por_atender", motivo: "cierre_por_validar", proximaTarea, operacion, altaPrioridad, prioridad: 0 };
    }
    if (
      operacion?.estadoValidacion === "devuelta" &&
      (operacion.reportadoPor === usuario.id || lead.asesorId === usuario.id)
    ) {
      return { lead, bandeja: "por_atender", motivo: "cierre_devuelto", proximaTarea, operacion, altaPrioridad, prioridad: 1 };
    }
    if (proximaTarea && Date.parse(proximaTarea.venceEn) < ahora) {
      return { lead, bandeja: "por_atender", motivo: "seguimiento_vencido", proximaTarea, operacion, altaPrioridad, prioridad: 2 };
    }
    if (!lead.primerContactoEn) {
      return { lead, bandeja: "por_atender", motivo: "sin_contactar", proximaTarea, operacion, altaPrioridad, prioridad: 3 };
    }
    if (proximaTarea && fechaLocal(proximaTarea.venceEn, zonaHoraria) === hoy) {
      return { lead, bandeja: "por_atender", motivo: "seguimiento_hoy", proximaTarea, operacion, altaPrioridad, prioridad: 4 };
    }
    if (lead.estado === "Sin respuesta" && !proximaTarea) {
      return { lead, bandeja: "por_atender", motivo: "sin_respuesta_sin_fecha", proximaTarea, operacion, altaPrioridad, prioridad: 5 };
    }
    return {
      lead,
      bandeja: "en_seguimiento",
      motivo: proximaTarea ? "seguimiento_programado" : "sin_proxima_accion",
      proximaTarea,
      operacion,
      altaPrioridad,
      prioridad: proximaTarea ? 10 : 20,
    };
  });

  clientes.sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    const tareaA = a.proximaTarea ? Date.parse(a.proximaTarea.venceEn) : Number.POSITIVE_INFINITY;
    const tareaB = b.proximaTarea ? Date.parse(b.proximaTarea.venceEn) : Number.POSITIVE_INFINITY;
    if (tareaA !== tareaB) return tareaA - tareaB;
    return (Date.parse(b.lead.creado) || 0) - (Date.parse(a.lead.creado) || 0);
  });

  const conteos: ConteosBandeja = {
    porAtender: 0,
    enSeguimiento: 0,
    cerrados: 0,
    contactos: 0,
    archivo: 0,
    vencidos: 0,
    paraHoy: 0,
    altaPrioridad: 0,
    cierresPorValidar: 0,
  };
  clientes.forEach((item) => {
    if (item.bandeja === "por_atender") conteos.porAtender += 1;
    if (item.bandeja === "en_seguimiento") conteos.enSeguimiento += 1;
    if (item.bandeja === "cerrados") conteos.cerrados += 1;
    if (item.bandeja === "contactos") conteos.contactos += 1;
    if (item.bandeja === "archivo") conteos.archivo += 1;
    if (item.motivo === "seguimiento_vencido") conteos.vencidos += 1;
    if (item.motivo === "seguimiento_hoy") conteos.paraHoy += 1;
    if (item.altaPrioridad) conteos.altaPrioridad += 1;
    if (item.motivo === "cierre_por_validar") conteos.cierresPorValidar += 1;
  });

  return { clientes, conteos, sinSeguimientosRegistrados };
}

export const textoMotivoAtencion = (item: ClienteClasificado): string => {
  switch (item.motivo) {
    case "cierre_por_validar": return "Cierre pendiente de validar";
    case "cierre_devuelto": return "Corregir reporte de cierre";
    case "seguimiento_vencido": return `Seguimiento vencido · ${item.proximaTarea?.titulo ?? "Retomar contacto"}`;
    case "sin_contactar": return "Nuevo · falta contactar";
    case "seguimiento_hoy": return `Para hoy · ${item.proximaTarea?.titulo ?? "Seguimiento"}`;
    case "sin_respuesta_sin_fecha": return "Sin respuesta · programa el siguiente intento";
    case "seguimiento_programado": return `Próximo · ${item.proximaTarea?.titulo ?? "Seguimiento"}`;
    case "sin_proxima_accion": return "En seguimiento · sin próxima acción";
    case "cerrado": return item.lead.estado === "Ganado" ? "Operación ganada" : "Prospecto descartado";
    case "contacto": return "Contacto del CRM · sin oportunidad activa";
    case "archivo": return item.lead.fueraDeCrm ? "Fuera del CRM" : "Solicitud antigua archivada";
  }
};
