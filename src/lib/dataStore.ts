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
import type {
  AgencyRow,
  AppointmentRow,
  ConfigurationRow,
  LeadRow,
  PropertyRow,
  StatusRequestRow,
  UserRow,
} from "../types/database";

const LOCAL_KEY = "habitat-piloto-datos-v1";

export type DomainErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_ERROR"
  | "PERMISSION_ERROR"
  | "CONFLICT"
  | "NOT_FOUND"
  | "NETWORK_ERROR"
  | "SERVER_ERROR";

export type OperationResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: DomainErrorCode; message: string; cause?: unknown } };

const ok = <T = undefined>(data?: T): OperationResult<T> => ({ ok: true, data: data as T });

export const clasificarErrorDominio = (cause?: unknown): DomainErrorCode => {
  const code = typeof cause === "object" && cause && "code" in cause ? String(cause.code) : "";
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (code === "42501") return "PERMISSION_ERROR";
  if (code === "28000" || code === "PGRST301") return "AUTH_ERROR";
  if (code === "23505" || code === "40001") return "CONFLICT";
  if (code === "P0002" || code === "PGRST116") return "NOT_FOUND";
  if (code.startsWith("22") || code === "23502" || code === "23503") return "VALIDATION_ERROR";
  if (cause instanceof TypeError || message.includes("fetch") || message.includes("network")) return "NETWORK_ERROR";
  return "SERVER_ERROR";
};

const fail = (
  operation: string,
  message: string,
  cause?: unknown,
  code = clasificarErrorDominio(cause),
): OperationResult<never> => {
  console.error(`[Supabase] ${operation}`, cause);
  return { ok: false, error: { code, message, cause } };
};

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

async function leerDirectorioVisible<T>(): Promise<T[]> {
  if (!supabase) return [];
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .rpc("directorio_visible")
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA - 1);
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
  metricasPropietario?: Record<string, MetricasPropietario>;
  errorMetricasPropietario?: string | null;
}

export interface MetricasPropietario {
  leads: number;
  visitas: number;
  ofertas: number;
  actividad: number;
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
  const [propiedadesFilas, leadsFilas, usuariosFilas, aRes, cRes, ciRes, ccRes, mpRes] = await Promise.all([
    leerTodo<PropertyRow>("propiedades"),
    leerTodo<LeadRow>("leads", { columna: "creado", ascendente: false }),
    leerDirectorioVisible<UserRow>(),
    // RLS ya limita estas tablas a la oficina de la sesión: no hace falta
    // filtrar por id, y el literal 'default' dejaría fuera a toda oficina nueva.
    supabase.from("agencias").select("*").limit(1).maybeSingle(),
    supabase.from("configuracion").select("*").limit(1).maybeSingle(),
    supabase.from("citas").select("*").gte("inicio", desde.toISOString()).order("inicio"),
    supabase.rpc("mis_citas_cliente"),
    supabase.rpc("metricas_propietario"),
  ]);
  for (const r of [aRes, cRes]) {
    if (r.error) throw r.error;
  }
  // La agenda no rompe la carga: si la migracion 07 aun no corre en esta
  // instancia, la app entra igual y simplemente no muestra citas.
  if (ciRes.error) console.warn("[Supabase] citas no disponibles todavia", ciRes.error.message);
  if (ccRes.error) console.warn("[Supabase] citas de cliente no disponibles todavia", ccRes.error.message);
  const citasPorId = new Map<string, AppointmentRow>();
  for (const fila of [...(ciRes.data ?? []), ...(ccRes.data ?? [])]) citasPorId.set(fila.id, fila);
  const metricasPropietario = Object.fromEntries(
    (mpRes.data ?? []).map((fila: { propiedad_id: string; leads: number; visitas: number; ofertas: number; actividad: number }) => [
      fila.propiedad_id,
      {
        leads: Number(fila.leads),
        visitas: Number(fila.visitas),
        ofertas: Number(fila.ofertas),
        actividad: Number(fila.actividad),
      },
    ]),
  );
  return {
    propiedades: propiedadesFilas.map(rowToPropiedad),
    leads: leadsFilas.map(rowToLead),
    usuarios: usuariosFilas.map(rowToUsuario),
    citas: [...citasPorId.values()].map(rowToCita),
    agencia: aRes.data ? rowToAgencia(aRes.data) : { nombre: "", direccion: "" },
    permisoEquipoVerTodas: cRes.data ? rowToConfiguracion(cRes.data).permisoEquipoVerTodas : false,
    notificaciones: cRes.data ? rowToConfiguracion(cRes.data).notificaciones : {},
    metricasPropietario,
    errorMetricasPropietario: mpRes.error ? "No se pudieron cargar las métricas reales." : null,
  };
}

// Siembra la base de datos compartida con los datos de ejemplo la primera
// vez que alguien abre la app y las tablas están vacías.
export async function sembrarDatosDeEjemplo(estado: EstadoCompleto): Promise<OperationResult> {
  if (!supabase) return fail("sembrarDatosDeEjemplo", "Sin conexión a la nube.");
  if (sinAgencia("sembrarDatosDeEjemplo"))
    return fail("sembrarDatosDeEjemplo", "Esta sesión no tiene oficina asociada.");
  const resultados = await Promise.all([
    supabase.from("usuarios").upsert(estado.usuarios.map(usuarioToRow)),
    supabase.from("propiedades").upsert(estado.propiedades.map(propiedadToRow)),
    supabase.from("leads").upsert(estado.leads.map(leadToRow)),
    supabase.from("agencias").upsert(agenciaToRow(estado.agencia)),
    supabase
      .from("configuracion")
      .upsert(configuracionToRow(estado.permisoEquipoVerTodas, estado.notificaciones)),
  ]);
  const error = resultados.find((resultado) => resultado.error)?.error;
  return error
    ? fail("sembrarDatosDeEjemplo", "No se pudieron crear los datos iniciales.", error)
    : ok();
}

export async function upsertPropiedad(p: Propiedad): Promise<OperationResult> {
  if (!supabase) return fail("upsertPropiedad", "Sin conexión a la nube.");
  if (sinAgencia("upsertPropiedad")) return fail("upsertPropiedad", "Esta sesión no tiene oficina asociada.");
  const query = p.version == null
    ? supabase.from("propiedades").upsert(propiedadToRow(p)).select("version").maybeSingle()
    : supabase.from("propiedades").update(propiedadToRow(p)).eq("id", p.id).eq("version", p.version).select("version").maybeSingle();
  const { data, error } = await query;
  if (error) return fail("upsertPropiedad", "No se pudo guardar la propiedad.", error);
  if (!data) return fail("upsertPropiedad", "La propiedad cambió en otra sesión. Recarga antes de guardar.", undefined, "CONFLICT");
  p.version = Number(data.version);
  return ok();
}

export async function bulkUpsertPropiedades(lista: Propiedad[]): Promise<OperationResult> {
  if (lista.length === 0) return ok();
  if (!supabase) return fail("bulkUpsertPropiedades", "Sin conexión a la nube.");
  if (sinAgencia("bulkUpsertPropiedades"))
    return fail("bulkUpsertPropiedades", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("propiedades").upsert(lista.map(propiedadToRow));
  return error ? fail("bulkUpsertPropiedades", "No se pudieron guardar las propiedades.", error) : ok();
}

export async function upsertLead(l: Lead): Promise<OperationResult> {
  if (!supabase) return fail("upsertLead", "Sin conexión a la nube.");
  if (sinAgencia("upsertLead")) return fail("upsertLead", "Esta sesión no tiene oficina asociada.");
  const query = l.version == null
    ? supabase.from("leads").upsert(leadToRow(l)).select("version").maybeSingle()
    : supabase.from("leads").update(leadToRow(l)).eq("id", l.id).eq("version", l.version).select("version").maybeSingle();
  const { data, error } = await query;
  if (error) return fail("upsertLead", "No se pudo guardar el lead.", error);
  if (!data) return fail("upsertLead", "El lead cambió en otra sesión. Recarga antes de guardar.", undefined, "CONFLICT");
  l.version = Number(data.version);
  return ok();
}

export interface CrearLeadInput {
  name: string;
  phone?: string;
  email?: string;
  source: string;
  origin: Lead["origen"];
  property_id?: string;
  message?: string;
  assigned_agent_id?: string;
  occupation?: string;
}

/**
 * Punto único de alta de leads en nube. La RPC resuelve identidad, tenant,
 * permisos, asignación y eventos dentro de una sola transacción.
 */
export async function crearOEnlazarLead(
  input: CrearLeadInput,
): Promise<OperationResult<{ lead: Lead; created: boolean }>> {
  if (!supabase) return fail("crearOEnlazarLead", "Sin conexión a la nube.");
  if (sinAgencia("crearOEnlazarLead"))
    return fail("crearOEnlazarLead", "Esta sesión no tiene oficina asociada.");

  const { data, error } = await supabase.rpc("crear_o_relacionar_lead", {
    p_input: input,
  });
  if (error) return fail("crearOEnlazarLead", "No se pudo crear el lead.", error);

  const resultado = data as { lead_id?: string; created?: boolean } | null;
  if (!resultado?.lead_id)
    return fail("crearOEnlazarLead", "La base no confirmó el lead creado.");

  const { data: fila, error: lecturaError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", resultado.lead_id)
    .single();
  if (lecturaError || !fila)
    return fail("crearOEnlazarLead", "El lead se creó, pero no pudo recuperarse.", lecturaError);

  return ok({ lead: rowToLead(fila), created: resultado.created === true });
}

export async function bulkUpsertLeads(lista: Lead[]): Promise<OperationResult> {
  if (lista.length === 0) return ok();
  if (!supabase) return fail("bulkUpsertLeads", "Sin conexión a la nube.");
  if (sinAgencia("bulkUpsertLeads")) return fail("bulkUpsertLeads", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("leads").upsert(lista.map(leadToRow));
  return error ? fail("bulkUpsertLeads", "No se pudieron guardar los leads.", error) : ok();
}

export async function upsertUsuario(u: Usuario): Promise<OperationResult> {
  if (!supabase) return fail("upsertUsuario", "Sin conexión a la nube.");
  if (sinAgencia("upsertUsuario")) return fail("upsertUsuario", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("usuarios").upsert(usuarioToRow(u));
  return error ? fail("upsertUsuario", "No se pudo guardar el usuario.", error) : ok();
}

export async function desactivarAsesorAtomico(
  asesorId: string,
  reasignarAId: string,
): Promise<OperationResult> {
  if (!supabase) return fail("desactivarAsesorAtomico", "Sin conexión a la nube.");
  const { error } = await supabase.rpc("desactivar_asesor_y_reasignar", {
    p_asesor_id: asesorId,
    p_reasignar_a_id: reasignarAId,
  });
  return error
    ? fail("desactivarAsesorAtomico", "No se pudo desactivar y reasignar al asesor.", error)
    : ok();
}

/**
 * Igual que `upsertUsuario`, pero DEVUELVE el error en vez de solo anotarlo en
 * la consola.
 *
 * El alta de una persona del equipo es de las pocas escrituras donde la base
 * puede decir que no por una regla de negocio —el tope de brokers de la
 * oficina, RLS si la agencia no cuadra— y donde el usuario tiene que
 * enterarse. Tragarse ese error dejaría la persona pintada en pantalla y
 * ausente de la base: el peor de los mundos.
 */
export async function upsertUsuarioConError(u: Usuario): Promise<string | null> {
  if (!supabase) return "Sin conexión a la nube.";
  if (sinAgencia("upsertUsuarioConError")) return "Esta sesión no tiene oficina asociada. Vuelve a entrar.";
  const { error } = await supabase.from("usuarios").upsert(usuarioToRow(u));
  if (!error) return null;
  console.error("[Supabase] upsertUsuarioConError", error);
  const m = error.message.toLowerCase();
  if (m.includes("máximo") || m.includes("maximo")) return error.message;
  if (m.includes("row-level security") || m.includes("violates row-level"))
    return "Tu cuenta no tiene permiso para dar de alta gente en esta oficina.";
  if (m.includes("duplicate key") && m.includes("correo"))
    return "Ya existe una cuenta con ese correo.";
  return error.message;
}

export async function upsertAgencia(a: AgenciaInfo): Promise<OperationResult> {
  if (!supabase) return fail("upsertAgencia", "Sin conexión a la nube.");
  if (sinAgencia("upsertAgencia")) return fail("upsertAgencia", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("agencias").upsert(agenciaToRow(a));
  return error ? fail("upsertAgencia", "No se pudo guardar la agencia.", error) : ok();
}

export async function upsertConfiguracion(
  permisoEquipoVerTodas: boolean,
  notificaciones: Record<string, boolean>,
): Promise<OperationResult> {
  if (!supabase) return fail("upsertConfiguracion", "Sin conexión a la nube.");
  if (sinAgencia("upsertConfiguracion"))
    return fail("upsertConfiguracion", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase
    .from("configuracion")
    .upsert(configuracionToRow(permisoEquipoVerTodas, notificaciones));
  return error ? fail("upsertConfiguracion", "No se pudo guardar la configuración.", error) : ok();
}

export async function upsertCita(c: CitaAgenda): Promise<OperationResult> {
  if (!supabase) return fail("upsertCita", "Sin conexión a la nube.");
  if (sinAgencia("upsertCita")) return fail("upsertCita", "Esta sesión no tiene oficina asociada.");
  const query = c.version == null
    ? supabase.from("citas").upsert(citaToRow(c)).select("version").maybeSingle()
    : supabase.from("citas").update(citaToRow(c)).eq("id", c.id).eq("version", c.version).select("version").maybeSingle();
  const { data, error } = await query;
  if (error) return fail("upsertCita", "No se pudo guardar la cita.", error);
  if (!data) return fail("upsertCita", "La cita cambió en otra sesión. Recarga antes de guardar.", undefined, "CONFLICT");
  c.version = Number(data.version);
  return ok();
}

export async function confirmarCitaClienteEnNube(
  leadId: string,
  citaId: string,
): Promise<string | null> {
  if (!supabase) return "Sin conexión a la nube.";
  const { data, error } = await supabase.rpc("cliente_confirmar_cita", {
    p_lead_id: leadId,
    p_cita_id: citaId,
  });
  if (error) {
    console.error("[Supabase] cliente_confirmar_cita", error);
    return "No se pudo confirmar la cita. Intenta de nuevo.";
  }
  if (data !== true) return "La cita ya no está disponible para confirmar.";
  return null;
}

export async function eliminarCita(id: string): Promise<OperationResult> {
  if (!supabase) return fail("eliminarCita", "Sin conexión a la nube.");
  if (sinAgencia("eliminarCita")) return fail("eliminarCita", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("citas").delete().eq("id", id);
  return error ? fail("eliminarCita", "No se pudo eliminar la cita.", error) : ok();
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
        const id = (payload.old as { id?: unknown }).id;
        if (typeof id === "string") handlers.onPropiedadEliminada(id);
      } else {
        handlers.onPropiedad(rowToPropiedad(payload.new as PropertyRow));
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "leads", ...soloMiAgencia }, (payload) => {
      if (payload.eventType !== "DELETE") handlers.onLead(rowToLead(payload.new as LeadRow));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "usuarios", ...soloMiAgencia }, (payload) => {
      if (payload.eventType !== "DELETE") handlers.onUsuario(rowToUsuario(payload.new as UserRow));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "agencias" }, (payload) => {
      if (payload.eventType !== "DELETE") handlers.onAgencia(rowToAgencia(payload.new as AgencyRow));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "configuracion", ...soloMiAgencia }, (payload) => {
      if (payload.eventType !== "DELETE") handlers.onConfiguracion(rowToConfiguracion(payload.new as ConfigurationRow));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "citas", ...soloMiAgencia }, (payload) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as { id?: unknown }).id;
        if (typeof id === "string") handlers.onCitaEliminada(id);
      } else handlers.onCita(rowToCita(payload.new as AppointmentRow));
    })
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "solicitudes_estado", ...soloMiAgencia },
      (payload) => {
        if (payload.eventType !== "DELETE") {
          handlers.onSolicitud?.(rowToSolicitud(payload.new as StatusRequestRow));
        }
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
