// Capa de persistencia del piloto.
//
// Modo nube (Supabase configurado): cada acción del usuario hace un upsert
// puntual a la tabla correspondiente, y una suscripción Realtime avisa a los
// demás testers cuando algo cambia (así las 10 personas ven los mismos datos
// sin recargar).
//
// Modo local (sin variables de entorno de Supabase): no hay backend, así que
// guardamos una "foto" completa del estado en localStorage para que al menos
// no se pierda al recargar la pestaña de esa persona.
import { isCloudEnabled, supabase } from "./supabaseClient";
import { agenciaActualONull, hayAgencia } from "./agenciaActual";
import {
  agenciaToRow,
  citaToRow,
  configuracionToRow,
  leadToRow,
  propiedadToRow,
  rowToAgencia,
  rowToCita,
  rowToConfiguracion,
  rowToLead,
  rowToPropiedad,
  rowToSolicitud,
  rowToUsuario,
  usuarioToRow,
} from "./rowMappers";
import type {
  AgenciaInfo,
  CitaAgenda,
  Lead,
  Propiedad,
  PropertyStatus,
  SolicitudEstado,
  Usuario,
} from "../types";

const LOCAL_KEY = "habitat-piloto-datos-v1";

// PostgREST corta TODA respuesta en 1,000 filas. No avisa: simplemente devuelve
// menos. Con 1,289 clientes en la base, `select("*")` a secas dejaba fuera a
// los últimos ~289 — y como no había ORDER BY, los que se caían eran justo los
// más recientes. Por eso todo lo que puede crecer sin techo se lee paginado.
const PAGINA = 1000;

async function leerTodo<T>(
  tabla: string,
  ordenar?: { columna: string; ascendente: boolean },
): Promise<T[]> {
  if (!supabase) return [];
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let q = supabase.from(tabla).select("*");
    // Un orden estable no es cosmético: sin él, dos páginas pueden traer la
    // misma fila y saltarse otra.
    if (ordenar) q = q.order(ordenar.columna, { ascending: ordenar.ascendente });
    q = q.order("id", { ascending: true });
    const { data, error } = await q.range(desde, desde + PAGINA - 1);
    if (error) throw error;
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    if (lote.length < PAGINA) break;
    if (desde > 200_000) break;
  }
  return filas;
}

export interface EstadoCompleto {
  propiedades: Propiedad[];
  leads: Lead[];
  usuarios: Usuario[];
  citas: CitaAgenda[];
  agencia: AgenciaInfo;
  permisoEquipoVerTodas: boolean;
  notificaciones: Record<string, boolean>;
}

// --- Modo local (localStorage) ---
export function cargarSnapshotLocal(): Partial<EstadoCompleto> | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function guardarSnapshotLocal(estado: EstadoCompleto) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(estado));
  } catch {
    // Almacenamiento lleno o bloqueado: no es crítico para el piloto.
  }
}

export function exportarSnapshotJSON(estado: EstadoCompleto) {
  const blob = new Blob([JSON.stringify(estado, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `habitat-piloto-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Una cuenta pendiente de aprobación no tiene oficina asignada todavía. Sin
// ella los conversores de fila lanzan, así que se corta antes y se registra el
// motivo en lugar de dejar reventar una promesa sin manejar.
function sinAgencia(operacion: string): boolean {
  if (hayAgencia()) return false;
  console.error(
    `[Supabase] ${operacion}: la sesión no tiene oficina asignada. ` +
      "La cuenta está pendiente de aprobación o la sesión expiró.",
  );
  return true;
}

// --- Modo nube (Supabase) ---
export async function fetchInitialData(): Promise<EstadoCompleto | null> {
  if (!supabase) return null;
  // La agenda solo se trae hacia adelante y un mes hacia atras: el historico
  // completo crece sin limite y no se usa en ninguna pantalla.
  const desde = new Date();
  desde.setDate(desde.getDate() - 30);

  // Propiedades, leads y usuarios se leen paginados: son las tres tablas que
  // crecen con el negocio y las únicas que pueden pasar de 1,000 filas.
  // Los leads llegan del más nuevo al más viejo para que la app no dependa del
  // orden físico de la tabla al decidir qué mostrar primero.
  const [propiedadesFilas, leadsFilas, usuariosFilas, aRes, cRes, ciRes] = await Promise.all([
    leerTodo<any>("propiedades"),
    leerTodo<any>("leads", { columna: "creado", ascendente: false }),
    leerTodo<any>("usuarios"),
    // RLS ya limita estas tablas a la oficina de la sesión: no hace falta
    // filtrar por id, y el literal 'default' dejaría fuera a toda oficina nueva.
    supabase.from("agencias").select("*").limit(1).maybeSingle(),
    supabase.from("configuracion").select("*").limit(1).maybeSingle(),
    supabase.from("citas").select("*").gte("inicio", desde.toISOString()).order("inicio"),
  ]);
  for (const r of [aRes, cRes]) {
    if (r.error) throw r.error;
  }
  // La agenda no rompe la carga: si la migracion 07 aun no corre en esta
  // instancia, la app entra igual y simplemente no muestra citas.
  if (ciRes.error) console.warn("[Supabase] citas no disponibles todavia", ciRes.error.message);
  return {
    propiedades: propiedadesFilas.map(rowToPropiedad),
    leads: leadsFilas.map(rowToLead),
    usuarios: usuariosFilas.map(rowToUsuario),
    citas: (ciRes.data ?? []).map(rowToCita),
    agencia: aRes.data ? rowToAgencia(aRes.data) : { nombre: "", direccion: "" },
    permisoEquipoVerTodas: cRes.data ? rowToConfiguracion(cRes.data).permisoEquipoVerTodas : false,
    notificaciones: cRes.data ? rowToConfiguracion(cRes.data).notificaciones : {},
  };
}

// Siembra la base de datos compartida con los datos de ejemplo la primera
// vez que alguien abre la app y las tablas están vacías.
export async function sembrarDatosDeEjemplo(estado: EstadoCompleto) {
  if (!supabase || sinAgencia("sembrarDatosDeEjemplo")) return;
  await supabase.from("usuarios").upsert(estado.usuarios.map(usuarioToRow));
  await supabase.from("propiedades").upsert(estado.propiedades.map(propiedadToRow));
  await supabase.from("leads").upsert(estado.leads.map(leadToRow));
  await supabase.from("agencias").upsert(agenciaToRow(estado.agencia));
  await supabase
    .from("configuracion")
    .upsert(configuracionToRow(estado.permisoEquipoVerTodas, estado.notificaciones));
}

export async function upsertPropiedad(p: Propiedad) {
  if (!supabase || sinAgencia("upsertPropiedad")) return;
  const { error } = await supabase.from("propiedades").upsert(propiedadToRow(p));
  if (error) console.error("[Supabase] upsertPropiedad", error);
}

export async function bulkUpsertPropiedades(lista: Propiedad[]) {
  if (!supabase || lista.length === 0 || sinAgencia("bulkUpsertPropiedades")) return;
  const { error } = await supabase.from("propiedades").upsert(lista.map(propiedadToRow));
  if (error) console.error("[Supabase] bulkUpsertPropiedades", error);
}

export async function upsertLead(l: Lead) {
  if (!supabase || sinAgencia("upsertLead")) return;
  const { error } = await supabase.from("leads").upsert(leadToRow(l));
  if (error) console.error("[Supabase] upsertLead", error);
}

export async function bulkUpsertLeads(lista: Lead[]) {
  if (!supabase || lista.length === 0 || sinAgencia("bulkUpsertLeads")) return;
  const { error } = await supabase.from("leads").upsert(lista.map(leadToRow));
  if (error) console.error("[Supabase] bulkUpsertLeads", error);
}

export async function upsertUsuario(u: Usuario) {
  if (!supabase || sinAgencia("upsertUsuario")) return;
  const { error } = await supabase.from("usuarios").upsert(usuarioToRow(u));
  if (error) console.error("[Supabase] upsertUsuario", error);
}

export async function upsertAgencia(a: AgenciaInfo) {
  if (!supabase || sinAgencia("upsertAgencia")) return;
  const { error } = await supabase.from("agencias").upsert(agenciaToRow(a));
  if (error) console.error("[Supabase] upsertAgencia", error);
}

export async function upsertConfiguracion(
  permisoEquipoVerTodas: boolean,
  notificaciones: Record<string, boolean>,
) {
  if (!supabase || sinAgencia("upsertConfiguracion")) return;
  const { error } = await supabase
    .from("configuracion")
    .upsert(configuracionToRow(permisoEquipoVerTodas, notificaciones));
  if (error) console.error("[Supabase] upsertConfiguracion", error);
}

export async function upsertCita(c: CitaAgenda) {
  if (!supabase || sinAgencia("upsertCita")) return;
  const { error } = await supabase.from("citas").upsert(citaToRow(c));
  if (error) console.error("[Supabase] upsertCita", error);
}

export async function eliminarCita(id: string) {
  if (!supabase || sinAgencia("eliminarCita")) return;
  const { error } = await supabase.from("citas").delete().eq("id", id);
  if (error) console.error("[Supabase] eliminarCita", error);
}

/**
 * Token del feed ICS del usuario. La funcion `mi_token_agenda()` lo crea la
 * primera vez y despues devuelve siempre el mismo. Vive en su propia tabla,
 * no en `usuarios`, porque la politica de lectura de `usuarios` alcanza a toda
 * la oficina: ahi el token seria visible para los companeros y cualquiera
 * podria suscribirse a la agenda del broker.
 */
export async function obtenerTokenAgenda(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("mi_token_agenda");
  if (error) {
    console.error("[Supabase] mi_token_agenda", error);
    return null;
  }
  return (data as string) ?? null;
}

/** Invalida la URL anterior. Se usa cuando un asesor deja la oficina. */
export async function rotarTokenAgenda(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("rotar_token_agenda");
  if (error) {
    console.error("[Supabase] rotar_token_agenda", error);
    return null;
  }
  return (data as string) ?? null;
}

// --- Solicitudes de cambio de estado ----------------------------------------
// El asesor de equipo solicita; el broker resuelve. Al aprobar, un trigger en
// la base aplica el cambio a la propiedad y notifica al solicitante — el
// frontend nunca escribe el estatus por su cuenta en este flujo.

/** Pendientes de la oficina + resueltas de los últimos 14 días (para avisos). */
export async function fetchSolicitudes(): Promise<SolicitudEstado[]> {
  if (!supabase) return [];
  const desde = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("solicitudes_estado")
    .select("*")
    .or(`estatus.eq.pendiente,creado_en.gte.${desde}`)
    .order("creado_en", { ascending: false });
  if (error) {
    // La tabla puede no existir aún en una instancia sin la migración 07.
    console.warn("[Supabase] solicitudes_estado no disponible", error.message);
    return [];
  }
  return (data ?? []).map(rowToSolicitud);
}

export async function crearSolicitudEstado(s: {
  id: string;
  propiedadId: string;
  solicitanteId: string;
  estadoActual: string;
  estadoSolicitado: PropertyStatus;
  motivo?: string;
}): Promise<string | null> {
  if (!supabase || sinAgencia("crearSolicitudEstado")) return null;
  const { error } = await supabase.from("solicitudes_estado").insert({
    id: s.id,
    agencia_id: agenciaActualONull(),
    propiedad_id: s.propiedadId,
    solicitante_id: s.solicitanteId,
    estado_actual: s.estadoActual,
    estado_solicitado: s.estadoSolicitado,
    motivo: s.motivo ?? null,
  });
  if (error) {
    console.error("[Supabase] crearSolicitudEstado", error);
    return /pendiente_unica|duplicate/i.test(error.message)
      ? "Esta propiedad ya tiene una solicitud en revisión."
      : "No se pudo enviar la solicitud. Intenta de nuevo.";
  }
  return null;
}

/** Solo broker (RLS). El trigger de la base aplica el cambio si se aprueba. */
export async function resolverSolicitudEstado(
  solicitudId: string,
  resultado: "aprobada" | "rechazada",
): Promise<string | null> {
  if (!supabase || sinAgencia("resolverSolicitudEstado")) return null;
  const { error } = await supabase
    .from("solicitudes_estado")
    .update({ estatus: resultado })
    .eq("id", solicitudId);
  if (error) {
    console.error("[Supabase] resolverSolicitudEstado", error);
    return "No se pudo resolver la solicitud. Intenta de nuevo.";
  }
  return null;
}

type RealtimeHandlers = {
  onPropiedad: (p: Propiedad) => void;
  onPropiedadEliminada: (id: string) => void;
  onLead: (l: Lead) => void;
  onUsuario: (u: Usuario) => void;
  onAgencia: (a: AgenciaInfo) => void;
  onConfiguracion: (c: { permisoEquipoVerTodas: boolean; notificaciones: Record<string, boolean> }) => void;
  onCita: (c: CitaAgenda) => void;
  onCitaEliminada: (id: string) => void;
  onSolicitud?: (s: SolicitudEstado) => void;
};

export function suscribirCambiosEnVivo(handlers: RealtimeHandlers): () => void {
  const client = supabase;
  if (!client) return () => {};

  // Realtime respeta RLS, pero filtrar en el servidor evita recibir y descartar
  // eventos de otras oficinas. Si aún no hay agencia, no se filtra: RLS igual
  // impide que llegue algo ajeno.
  const agencia = agenciaActualONull();
  const soloMiAgencia = agencia ? { filter: `agencia_id=eq.${agencia}` } : {};

  const canal = client
    .channel(`sync-${agencia ?? "sin-agencia"}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "propiedades", ...soloMiAgencia }, (payload) => {
      if (payload.eventType === "DELETE") {
        handlers.onPropiedadEliminada((payload.old as any).id);
      } else {
        handlers.onPropiedad(rowToPropiedad(payload.new));
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "leads", ...soloMiAgencia }, (payload) => {
      if (payload.eventType !== "DELETE") handlers.onLead(rowToLead(payload.new));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "usuarios", ...soloMiAgencia }, (payload) => {
      if (payload.eventType !== "DELETE") handlers.onUsuario(rowToUsuario(payload.new));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "agencias" }, (payload) => {
      if (payload.eventType !== "DELETE") handlers.onAgencia(rowToAgencia(payload.new));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "configuracion", ...soloMiAgencia }, (payload) => {
      if (payload.eventType !== "DELETE") handlers.onConfiguracion(rowToConfiguracion(payload.new));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "citas", ...soloMiAgencia }, (payload) => {
      if (payload.eventType === "DELETE") handlers.onCitaEliminada((payload.old as any).id);
      else handlers.onCita(rowToCita(payload.new));
    })
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "solicitudes_estado", ...soloMiAgencia },
      (payload) => {
        if (payload.eventType !== "DELETE") handlers.onSolicitud?.(rowToSolicitud(payload.new));
      },
    )
    .subscribe();

  return () => {
    client.removeChannel(canal);
  };
}

export function reemplazarEnArreglo<T extends { id: string }>(arreglo: T[], item: T): T[] {
  const existe = arreglo.some((x) => x.id === item.id);
  return existe ? arreglo.map((x) => (x.id === item.id ? item : x)) : [...arreglo, item];
}

export { isCloudEnabled };
