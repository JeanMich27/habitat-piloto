import type { CitaAgenda, Lead, Propiedad } from "../types";

const MS_DIA = 24 * 60 * 60 * 1000;

/** Ventana móvil hacia atrás. Excluye fechas futuras y evita contarlas por error. */
export function ocurrioEnUltimosDias(fecha: string | undefined, ahora: number, dias: number) {
  if (!fecha) return false;
  const diferencia = ahora - new Date(fecha).getTime();
  return Number.isFinite(diferencia) && diferencia >= 0 && diferencia <= dias * MS_DIA;
}

/** Ventana móvil hacia adelante para la carga operativa de agenda. */
export function ocurriraEnProximosDias(fecha: string, ahora: number, dias: number) {
  const diferencia = new Date(fecha).getTime() - ahora;
  return Number.isFinite(diferencia) && diferencia >= 0 && diferencia <= dias * MS_DIA;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[mitad - 1] + ordenados[mitad]) / 2
    : ordenados[mitad];
}

/**
 * Cierre financiero real: estar en la etapa Cierre no basta. La operación
 * debe estar Ganada y tener fecha de cierre dentro del periodo consultado.
 */
export function operacionesGanadasEnPeriodo(
  leads: Lead[],
  ahora: number,
  dias: number,
) {
  return leads.filter(
    (lead) =>
      lead.estado === "Ganado" &&
      ocurrioEnUltimosDias(lead.cerradoEn, ahora, dias),
  );
}

/** Conversión de la cohorte: ganados entre los leads que ingresaron en el periodo. */
export function tasaConversionDeCohorte(leads: Lead[]) {
  if (leads.length === 0) return 0;
  return Math.round((leads.filter((lead) => lead.estado === "Ganado").length / leads.length) * 100);
}

export function documentacionCompleta(propiedad: Propiedad) {
  return propiedad.documentos.length > 0 && propiedad.documentos.every((documento) => documento.aprobado);
}

export function citasProximas(citas: CitaAgenda[], ahora: number, dias: number) {
  return citas.filter(
    (cita) =>
      cita.estado !== "Cancelada" &&
      cita.estado !== "No asistió" &&
      cita.estado !== "Realizada" &&
      ocurriraEnProximosDias(cita.inicio, ahora, dias),
  );
}

export interface DemandaPropiedad {
  propiedad: Propiedad;
  leads: number;
  visitas: number;
  ofertas: number;
  senales: number;
}

/**
 * Señales comprobables disponibles hoy. No confunde actividad comercial con
 * analítica web: vistas, clics y compartidos no se registran todavía.
 */
export function demandaDePropiedades(
  propiedades: Propiedad[],
  leads: Lead[],
  citas: CitaAgenda[],
): DemandaPropiedad[] {
  return propiedades.map((propiedad) => {
    const leadsPropiedad = leads.filter((lead) => lead.interesPropiedadId === propiedad.id);
    const visitas = citas.filter(
      (cita) =>
        cita.propiedadId === propiedad.id &&
        cita.tipo === "visita" &&
        cita.estado === "Realizada",
    ).length;
    const ofertas = leadsPropiedad.filter((lead) => lead.montoOferta !== undefined).length;
    return {
      propiedad,
      leads: leadsPropiedad.length,
      visitas,
      ofertas,
      senales: leadsPropiedad.length + visitas + ofertas,
    };
  });
}
