// Edge Function: feed de calendario (iCalendar / RFC 5545)
//
// Publica la agenda de un usuario como un calendario suscribible. El asesor
// pega la URL una sola vez en Google Calendar o en el iPhone y a partir de ahí
// sus citas de HomeID aparecen ahí solas, para siempre.
//
//   GET /functions/v1/agenda-ics?t=<token-uuid>
//   → text/calendar
//
// AUTENTICACIÓN (verify_jwt = false, a propósito):
//
// Los clientes de calendario — Google, Apple, Outlook — piden la URL ellos
// mismos, sin sesión y sin posibilidad de mandar cabeceras. Con el JWT de
// plataforma activado, la petición muere en 401 antes de llegar a este código
// y ningún calendario del mundo puede leer el feed. Por eso la autorización la
// hace la propia función:
//
//   - `t` debe ser un UUID v4 con formato válido (si no, 404).
//   - `citas_por_token` resuelve el token contra `agenda_feeds` y devuelve
//     SOLO las citas que a ese usuario le tocan según su rol.
//   - Esa función tiene EXECUTE revocado a `anon` Y a `authenticated`: ningún
//     navegador puede llamarla, solo esta función con `service_role`.
//   - Un token que no existe devuelve un calendario vacío, igual que un asesor
//     sin citas. No hay forma de distinguirlos, así que el endpoint no sirve
//     como oráculo para adivinar tokens.
//   - El asesor puede invalidar su URL cuando quiera con `rotar_token_agenda()`.
//
// Es el mismo modelo que usa Google Calendar para sus propias "direcciones
// secretas en formato iCal": una URL larga e imposible de adivinar, revocable,
// de solo lectura y limitada a un recurso.
//
// Despliegue:
//   supabase functions deploy agenda-ics --no-verify-jwt
//
// El `verify_jwt = false` de supabase/config.toml lo deja fijo para que un
// despliegue futuro sin la bandera no rompa el feed en silencio.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const RANGO_ATRAS_DIAS = 30;
const RANGO_ADELANTE_DIAS = 180;

// --- Utilidades de iCalendar -------------------------------------------------

/** Escapa según RFC 5545 §3.3.11. Sin esto, una coma en la dirección parte el campo. */
const esc = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

const aUTC = (iso: string) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");

/**
 * Las líneas de iCalendar no pueden pasar de 75 octetos: las de más se parten
 * y la continuación empieza con un espacio. Outlook y varios clientes de
 * Android descartan el evento entero si esto no se respeta.
 */
function plegar(linea: string): string {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 74) return linea;
  const partes: string[] = [];
  let actual = "";
  let largo = 0;
  for (const ch of linea) {
    const n = new TextEncoder().encode(ch).length;
    if (largo + n > (partes.length === 0 ? 74 : 73)) {
      partes.push(actual);
      actual = "";
      largo = 0;
    }
    actual += ch;
    largo += n;
  }
  if (actual) partes.push(actual);
  return partes.join("\r\n ");
}

type Fila = {
  id: string;
  titulo: string;
  inicio: string;
  fin: string;
  ubicacion: string | null;
  notas: string | null;
  estado: string;
  tipo: string;
  lead_nombre: string | null;
  lead_telefono: string | null;
  propiedad_titulo: string | null;
  asesor_nombre: string | null;
};

function evento(c: Fila, ahora: string): string[] {
  const detalle = [
    c.lead_nombre ? `Cliente: ${c.lead_nombre}${c.lead_telefono ? ` · ${c.lead_telefono}` : ""}` : null,
    c.propiedad_titulo ? `Propiedad: ${c.propiedad_titulo}` : null,
    c.asesor_nombre ? `Asesor: ${c.asesor_nombre}` : null,
    c.notas ? `Notas: ${c.notas}` : null,
    `Estado: ${c.estado}`,
    "Agendado en HomeID",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "BEGIN:VEVENT",
    // UID estable: si cambia entre corridas, el cliente crea un duplicado en
    // vez de actualizar el evento existente.
    plegar(`UID:${c.id}@homeid`),
    `DTSTAMP:${ahora}`,
    `DTSTART:${aUTC(c.inicio)}`,
    `DTEND:${aUTC(c.fin)}`,
    plegar(`SUMMARY:${esc(c.titulo)}`),
    plegar(`DESCRIPTION:${esc(detalle)}`),
    plegar(`LOCATION:${esc(c.ubicacion)}`),
    // Una cita "Agendada" todavía no está confirmada por el cliente: se marca
    // como TENTATIVE para que se vea distinta en el calendario del asesor.
    `STATUS:${c.estado === "Confirmada" || c.estado === "Realizada" ? "CONFIRMED" : "TENTATIVE"}`,
    plegar(`CATEGORIES:${esc(c.tipo)}`),
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Recordatorio de cita",
    "END:VALARM",
    "END:VEVENT",
  ];
}

// --- Handler ----------------------------------------------------------------

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!token || !UUID.test(token)) {
    // 404 y no 401 a propósito: un 401 confirmaría que la ruta existe y sirve
    // calendarios, que es justo lo que no conviene decirle a quien tantea.
    return new Response("No encontrado", { status: 404 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const desde = new Date();
  desde.setDate(desde.getDate() - RANGO_ATRAS_DIAS);
  const hasta = new Date();
  hasta.setDate(hasta.getDate() + RANGO_ADELANTE_DIAS);

  const { data, error } = await supabase.rpc("citas_por_token", {
    p_token: token,
    p_desde: desde.toISOString(),
    p_hasta: hasta.toISOString(),
  });

  if (error) {
    console.error("[agenda-ics] citas_por_token", error);
    return new Response("Error interno", { status: 500 });
  }

  const filas = (data ?? []) as Fila[];
  // Un token inválido y un asesor sin citas devuelven lo mismo: un calendario
  // vacío. Distinguirlos convertiría el endpoint en un oráculo de tokens.
  supabase.rpc("marcar_acceso_feed", { p_token: token }).then(() => {});

  const ahora = aUTC(new Date().toISOString());
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HomeID//Agenda//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:HomeID · Agenda",
    "X-WR-CALDESC:Citas agendadas en HomeID",
    "X-WR-TIMEZONE:America/Mexico_City",
    // Sugerencia de refresco. Apple la respeta; Google la ignora y refresca a
    // su criterio (8-24 h). Ese hueco lo cubre el botón "Añadir a mi
    // calendario" de cada cita dentro de la app.
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
    ...filas.flatMap((f) => evento(f, ahora)),
    "END:VCALENDAR",
  ];

  return new Response(lineas.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="homeid-agenda.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
});
