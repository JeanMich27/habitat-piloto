// Lógica de la agenda: agrupación por día, choques de horario y puentes hacia
// calendarios externos (Google, Apple, Outlook).
//
// Decisión de arquitectura — por qué NO sincronización bidireccional en v1:
//
//   HomeID es la fuente de verdad de las citas. Hacia afuera se publican de
//   dos formas complementarias, ninguna de las cuales requiere OAuth:
//
//   a) Suscripción ICS (webcal). El asesor pega una URL privada en Google
//      Calendar o en el iPhone y a partir de ahí TODAS sus citas aparecen
//      solas, para siempre. Costo de mantenimiento: cero.
//      Límite real y conocido: Google refresca los feeds externos cada 8-24 h
//      a su criterio; Apple permite fijar el refresco en 5 minutos.
//
//   b) "Añadir a mi calendario" por cita (enlace de Google o archivo .ics).
//      Instantáneo, y es lo que cubre el hueco de refresco de (a) cuando la
//      cita es para hoy o mañana.
//
//   La bidireccional (leer lo que el asesor agenda fuera de HomeID) exige
//   verificación de la app ante Google por un scope restringido, refresh
//   tokens por usuario y por oficina, y resolver conflictos de edición. Es
//   4-6x el trabajo. Solo se justifica cuando haya evidencia de que los
//   asesores agendan visitas fuera de la app; hoy no la hay.
import type { CitaAgenda, Lead, Propiedad, Usuario } from "../types";
import { TIPOS_CITA } from "../types";

// --- Fechas -----------------------------------------------------------------

export const inicioDelDia = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const sumarDias = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Lunes de la semana de `d` (la semana laboral en México empieza en lunes). */
export function inicioDeSemana(d: Date): Date {
  const x = inicioDelDia(d);
  const dia = x.getDay(); // 0 = domingo
  return sumarDias(x, dia === 0 ? -6 : 1 - dia);
}

export const claveDia = (iso: string) => iso.slice(0, 10);

export const esMismoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });

export const fmtDiaLargo = (d: Date) =>
  d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

export const fmtDiaCorto = (d: Date) =>
  d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric" });

/** "Hoy" / "Mañana" / "jueves 21 de agosto" — el encabezado de la agenda. */
export function etiquetaDia(d: Date, hoy = new Date()): string {
  if (esMismoDia(d, hoy)) return "Hoy";
  if (esMismoDia(d, sumarDias(hoy, 1))) return "Mañana";
  if (esMismoDia(d, sumarDias(hoy, -1))) return "Ayer";
  return fmtDiaLargo(d);
}

/** Convierte los campos de un <input type="datetime-local"> a ISO con zona. */
export function localAISO(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora}`).toISOString();
}

/** Y al revés, para precargar los inputs al editar. */
export function isoALocal(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    fecha: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    hora: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

export const duracionPorTipo = (tipo: string) =>
  TIPOS_CITA.find((t) => t.valor === tipo)?.duracionMin ?? 60;

// --- Consultas sobre la lista ----------------------------------------------

/** Alcance por rol. Es la misma regla que aplica RLS del lado del servidor;
 *  aquí se repite solo para no mostrar de más mientras carga. */
export function citasVisibles(citas: CitaAgenda[], usuario: Usuario): CitaAgenda[] {
  if (usuario.rol === "broker") return citas;
  return citas.filter((c) => c.asesorId === usuario.id);
}

export function ordenarPorInicio(citas: CitaAgenda[]): CitaAgenda[] {
  return [...citas].sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/**
 * Una cita "abierta" es la que todavía puede pasar: ni cancelada, ni ya
 * ocurrida, ni plantón. Es lo que cuenta el badge de la Agenda y lo que
 * muestra el dashboard — si cada pantalla decidiera esto por su cuenta, el
 * badge diría 3 y el dashboard 2.
 */
export const esCitaAbierta = (c: CitaAgenda) =>
  c.estado !== "Cancelada" && c.estado !== "Realizada" && c.estado !== "No asistió";

/**
 * Citas abiertas de hoy, ordenadas. `asesorId` omitido = todas (broker).
 *
 * OJO con la zona horaria: se compara el día LOCAL (esMismoDia), no el prefijo
 * del ISO. En México (UTC-6) una cita de las 7 p.m. se guarda como la 1 a.m.
 * del día siguiente en UTC; comparar cadenas la mandaba a mañana.
 */
export function citasDeHoy(
  citas: CitaAgenda[],
  asesorId?: string,
  ahora = new Date(),
): CitaAgenda[] {
  return ordenarPorInicio(
    citas.filter(
      (c) =>
        (!asesorId || c.asesorId === asesorId) &&
        esCitaAbierta(c) &&
        esMismoDia(new Date(c.inicio), ahora),
    ),
  );
}

/**
 * La siguiente cita que todavía no empieza. Es la respuesta a la pregunta que
 * un asesor en campo se hace varias veces al día; el dashboard la muestra para
 * que no tenga que entrar a la Agenda a averiguarla.
 */
export function proximaCita(
  citas: CitaAgenda[],
  asesorId?: string,
  ahora = new Date(),
): CitaAgenda | null {
  const desde = ahora.toISOString();
  const candidatas = ordenarPorInicio(
    citas.filter(
      (c) => (!asesorId || c.asesorId === asesorId) && esCitaAbierta(c) && c.inicio >= desde,
    ),
  );
  return candidatas[0] ?? null;
}

export function agruparPorDia(citas: CitaAgenda[]): { dia: string; citas: CitaAgenda[] }[] {
  const mapa = new Map<string, CitaAgenda[]>();
  for (const c of ordenarPorInicio(citas)) {
    const k = claveDia(c.inicio);
    const lista = mapa.get(k);
    if (lista) lista.push(c);
    else mapa.set(k, [c]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, lista]) => ({ dia, citas: lista }));
}

/**
 * Choques de horario del mismo asesor. Es la única validación que de verdad
 * ahorra un problema en campo: agendar dos visitas encimadas en puntos
 * distintos de la ciudad cuesta una cita perdida, no un renglón mal puesto.
 */
export function citasEncimadas(
  candidata: Pick<CitaAgenda, "id" | "asesorId" | "inicio" | "fin">,
  citas: CitaAgenda[],
): CitaAgenda[] {
  const ini = new Date(candidata.inicio).getTime();
  const fin = new Date(candidata.fin).getTime();
  return citas.filter(
    (c) =>
      c.id !== candidata.id &&
      c.asesorId === candidata.asesorId &&
      c.estado !== "Cancelada" &&
      new Date(c.inicio).getTime() < fin &&
      new Date(c.fin).getTime() > ini,
  );
}

// --- Puentes a calendarios externos ----------------------------------------

const escaparICS = (s: string) =>
  (s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Formato UTC de iCalendar: 20260813T170000Z */
export const aFormatoICS = (iso: string) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");

export function descripcionCita(
  cita: CitaAgenda,
  lead?: Lead,
  propiedad?: Propiedad,
  asesor?: Usuario,
): string {
  const lineas: string[] = [];
  if (lead) lineas.push(`Cliente: ${lead.nombre}${lead.telefono ? ` · ${lead.telefono}` : ""}`);
  if (propiedad) lineas.push(`Propiedad: ${propiedad.titulo}`);
  if (asesor) lineas.push(`Asesor: ${asesor.nombre}`);
  if (cita.notas) lineas.push(`Notas: ${cita.notas}`);
  lineas.push("Agendado en HomeID");
  return lineas.join("\n");
}

/** Archivo .ics de UNA cita, para el botón "Añadir a mi calendario". */
export function icsDeUnaCita(cita: CitaAgenda, descripcion: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HomeID//Agenda//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${cita.id}@homeid`,
    `DTSTAMP:${aFormatoICS(new Date().toISOString())}`,
    `DTSTART:${aFormatoICS(cita.inicio)}`,
    `DTEND:${aFormatoICS(cita.fin)}`,
    `SUMMARY:${escaparICS(cita.titulo)}`,
    `DESCRIPTION:${escaparICS(descripcion)}`,
    `LOCATION:${escaparICS(cita.ubicacion)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Recordatorio",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function descargarICS(cita: CitaAgenda, descripcion: string) {
  const blob = new Blob([icsDeUnaCita(cita, descripcion)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cita-${claveDia(cita.inicio)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Enlace que abre Google Calendar con el evento precargado. */
export function urlGoogleCalendar(cita: CitaAgenda, descripcion: string): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: cita.titulo,
    dates: `${aFormatoICS(cita.inicio)}/${aFormatoICS(cita.fin)}`,
    details: descripcion,
    location: cita.ubicacion,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/**
 * URL de suscripción permanente. `webcal://` hace que iOS y macOS abran el
 * diálogo de "Suscribirse al calendario" en vez de descargar un archivo
 * suelto; Google pide la misma URL en https.
 */
export function urlsDeSuscripcion(baseUrl: string, token: string) {
  const https = `${baseUrl.replace(/\/$/, "")}/functions/v1/agenda-ics?t=${token}`;
  return {
    https,
    webcal: https.replace(/^https?:\/\//, "webcal://"),
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(https)}`,
  };
}
