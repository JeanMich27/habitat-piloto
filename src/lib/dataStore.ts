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
  configuracionToRow,
  leadToRow,
  propiedadToRow,
  rowToAgencia,
  rowToConfiguracion,
  rowToLead,
  rowToPropiedad,
  rowToUsuario,
  usuarioToRow,
} from "./rowMappers";
import type { AgenciaInfo, Lead, Propiedad, Usuario } from "../types";

const LOCAL_KEY = "habitat-piloto-datos-v1";

export interface EstadoCompleto {
  propiedades: Propiedad[];
  leads: Lead[];
  usuarios: Usuario[];
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
  const [pRes, lRes, uRes, aRes, cRes] = await Promise.all([
    supabase.from("propiedades").select("*"),
    supabase.from("leads").select("*"),
    supabase.from("usuarios").select("*"),
    // RLS ya limita estas tablas a la oficina de la sesión: no hace falta
    // filtrar por id, y el literal 'default' dejaría fuera a toda oficina nueva.
    supabase.from("agencias").select("*").limit(1).maybeSingle(),
    supabase.from("configuracion").select("*").limit(1).maybeSingle(),
  ]);
  for (const r of [pRes, lRes, uRes, aRes, cRes]) {
    if (r.error) throw r.error;
  }
  return {
    propiedades: (pRes.data ?? []).map(rowToPropiedad),
    leads: (lRes.data ?? []).map(rowToLead),
    usuarios: (uRes.data ?? []).map(rowToUsuario),
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

type RealtimeHandlers = {
  onPropiedad: (p: Propiedad) => void;
  onPropiedadEliminada: (id: string) => void;
  onLead: (l: Lead) => void;
  onUsuario: (u: Usuario) => void;
  onAgencia: (a: AgenciaInfo) => void;
  onConfiguracion: (c: { permisoEquipoVerTodas: boolean; notificaciones: Record<string, boolean> }) => void;
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
