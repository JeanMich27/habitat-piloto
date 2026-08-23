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
import { agenciaActualONull } from "./agenciaActual";
import {
  agenciaToRow,
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
import {
  fail,
  missingAgency as sinAgencia,
  ok,
  type OperationResult,
} from "../repositories/repositoryResult";

const LOCAL_KEY = "habitat-piloto-datos-v1";

export { clasificarErrorDominio } from "../repositories/repositoryResult";
export type { DomainErrorCode, OperationResult } from "../repositories/repositoryResult";
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

// Las escrituras viven en repositorios de dominio. Este módulo conserva sólo
// carga inicial, snapshot local, bootstrap y sincronización Realtime.
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
// Fachada temporal para consumidores existentes. La implementación pertenece
// a cada repositorio; código nuevo debe importar el repositorio de su dominio.
export { bulkUpsertPropiedades, upsertPropiedad } from "../repositories/propertiesRepository";
export { bulkUpsertLeads, crearOEnlazarLead, upsertLead } from "../repositories/leadsRepository";
export type { CrearLeadInput } from "../repositories/leadsRepository";
export { desactivarAsesorAtomico, upsertUsuario, upsertUsuarioConError } from "../repositories/usersRepository";
export { upsertAgencia, upsertConfiguracion } from "../repositories/settingsRepository";
export { confirmarCitaClienteEnNube, eliminarCita, obtenerTokenAgenda, rotarTokenAgenda, upsertCita } from "../repositories/appointmentsRepository";
export { crearSolicitudEstado, resolverSolicitudEstado } from "../repositories/statusRequestsRepository";
