import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  CloudOff,
  ClipboardCheck,
  Home,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Upload,
  User as UserIcon,
  Users,
} from "lucide-react";
import db from "./data/db.json";
import { NOTIFICACIONES_DEFAULT } from "./data/configuracionOpciones";
import type {
  AgenciaInfo,
  Comparable,
  DocumentName,
  Lead,
  LeadStage,
  PropertyStatus,
  Propiedad,
  Usuario,
} from "./types";
import AsesorDashboard from "./views/AsesorDashboard";
import Asesores from "./views/Asesores";
import BrokerDashboard from "./views/BrokerDashboard";
import Configuracion from "./views/Configuracion";
import DetalleDePropiedad from "./views/DetalleDePropiedad";
import ImportarDatos from "./views/ImportarDatos";
import IntakeValidacion from "./views/IntakeValidacion";
import ListadoPropiedades from "./views/ListadoPropiedades";
import NuevaPropiedad from "./views/NuevaPropiedad";
import PerfilDesempeno from "./views/PerfilDesempeno";
import PerfilPersonal from "./views/PerfilPersonal";
import ClientePortal from "./views/ClientePortal";
import PropietarioPortal from "./views/PropietarioPortal";
import Reportes from "./views/Reportes";
import { isCloudEnabled } from "./lib/supabaseClient";
import {
  bulkUpsertLeads,
  bulkUpsertPropiedades,
  cargarSnapshotLocal,
  exportarSnapshotJSON,
  fetchInitialData,
  guardarSnapshotLocal,
  reemplazarEnArreglo,
  sembrarDatosDeEjemplo,
  suscribirCambiosEnVivo,
  upsertAgencia,
  upsertConfiguracion,
  upsertLead,
  upsertPropiedad,
  upsertUsuario,
  type EstadoCompleto,
} from "./lib/dataStore";

type Vista =
  | "broker"
  | "propiedades"
  | "detalle"
  | "nueva"
  | "asesores"
  | "perfil"
  | "asesor"
  | "mi-perfil"
  | "propietario"
  | "cliente"
  | "intake"
  | "reportes"
  | "importar"
  | "configuracion";

function inicialesDe(nombre: string) {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

// Snapshot de fábrica (datos de ejemplo) usado para sembrar Supabase la
// primera vez, o como respaldo si no hay nube configurada ni datos locales.
const snapshotDeFabrica: EstadoCompleto = {
  propiedades: db.propiedades as Propiedad[],
  leads: db.leads as Lead[],
  usuarios: db.usuarios as Usuario[],
  agencia: db.agencia as AgenciaInfo,
  permisoEquipoVerTodas: false,
  notificaciones: NOTIFICACIONES_DEFAULT,
};

export default function App() {
  // Estado inicial: en modo local usamos lo último guardado en este
  // navegador (si existe) para no perder datos al recargar; en modo nube el
  // useEffect de abajo lo reemplaza por lo que venga de Supabase.
  const snapshotLocal = !isCloudEnabled ? cargarSnapshotLocal() : null;
  const inicial: EstadoCompleto = { ...snapshotDeFabrica, ...snapshotLocal };

  const [propiedades, setPropiedades] = useState<Propiedad[]>(inicial.propiedades);
  const [leads, setLeads] = useState<Lead[]>(inicial.leads);
  const [usuarios, setUsuarios] = useState<Usuario[]>(inicial.usuarios);
  const [agencia, setAgencia] = useState<AgenciaInfo>(inicial.agencia);
  // Política por defecto al invitar un nuevo Asesor de Equipo (Configuración >
  // Roles y permisos). Se puede ajustar por persona desde Asesores > Editar permisos.
  const [permisoEquipoVerTodas, setPermisoEquipoVerTodas] = useState(inicial.permisoEquipoVerTodas);
  const [notificaciones, setNotificaciones] = useState<Record<string, boolean>>(
    inicial.notificaciones,
  );

  // --- Sincronización con Supabase (piloto multiusuario) ---
  const [cargandoNube, setCargandoNube] = useState(isCloudEnabled);
  const [avisoNube, setAvisoNube] = useState<string | null>(null);
  const yaSembrado = useRef(false);

  useEffect(() => {
    if (!isCloudEnabled) return;
    let vivo = true;
    (async () => {
      try {
        let datos = await fetchInitialData();
        const vacio =
          datos &&
          datos.propiedades.length === 0 &&
          datos.leads.length === 0 &&
          datos.usuarios.length === 0;
        if (datos && vacio && !yaSembrado.current) {
          yaSembrado.current = true;
          await sembrarDatosDeEjemplo(snapshotDeFabrica);
          datos = await fetchInitialData();
        }
        if (!vivo || !datos) return;
        setPropiedades(datos.propiedades);
        setLeads(datos.leads);
        setUsuarios(datos.usuarios);
        setAgencia(datos.agencia);
        setPermisoEquipoVerTodas(datos.permisoEquipoVerTodas);
        setNotificaciones(datos.notificaciones);
      } catch (err) {
        console.error("[Supabase] fetchInitialData", err);
        if (vivo) setAvisoNube("No se pudo conectar con la base de datos compartida. Mostrando datos de ejemplo.");
      } finally {
        if (vivo) setCargandoNube(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!isCloudEnabled) return;
    return suscribirCambiosEnVivo({
      onPropiedad: (p) => setPropiedades((prev) => reemplazarEnArreglo(prev, p)),
      onPropiedadEliminada: (id) => setPropiedades((prev) => prev.filter((p) => p.id !== id)),
      onLead: (l) => setLeads((prev) => reemplazarEnArreglo(prev, l)),
      onUsuario: (u) => setUsuarios((prev) => reemplazarEnArreglo(prev, u)),
      onAgencia: (a) => setAgencia(a),
      onConfiguracion: (c) => {
        setPermisoEquipoVerTodas(c.permisoEquipoVerTodas);
        setNotificaciones(c.notificaciones);
      },
    });
  }, []);

  // Modo local (sin Supabase configurado): autoguarda todo en este navegador.
  useEffect(() => {
    if (isCloudEnabled) return;
    guardarSnapshotLocal({
      propiedades,
      leads,
      usuarios,
      agencia,
      permisoEquipoVerTodas,
      notificaciones,
    });
  }, [propiedades, leads, usuarios, agencia, permisoEquipoVerTodas, notificaciones]);

  const [vista, setVista] = useState<Vista>("broker");
  const [propiedadSeleccionadaId, setPropiedadSeleccionadaId] = useState<string | null>(null);
  const [asesorSeleccionadoId, setAsesorSeleccionadoId] = useState<string | null>(null);
  // Quién está "viendo" Propiedades / Detalle / Nueva Propiedad — antes estas
  // 3 pantallas siempre asumían al Broker sin importar de dónde venías, lo que
  // dejaba sin ejercitar el alcance acotado del Asesor de Equipo. Por defecto
  // es el Broker (Jean); "Ver mis propiedades" desde el Dashboard Asesor lo
  // cambia a esa persona.
  const [usuarioActivoId, setUsuarioActivoId] = useState("user-002");

  const lulu = usuarios.find((u) => u.id === "user-003")!;
  const jean = usuarios.find((u) => u.id === "user-002")!;
  const usuarioActivo = usuarios.find((u) => u.id === usuarioActivoId) ?? jean;
  // Demo del portal del propietario: se identifica por correo (todavía no hay
  // cuenta/login de propietario en el MVP), usando la dueña de la propiedad
  // con más actividad capturada (prop-001).
  const propiedadesDeAnaBeltran = propiedades.filter(
    (p) => p.propietario.correo === "ana.beltran@example.com",
  );

  // --- Acciones del pipeline (Kanban) ---
  const moverLead = (leadId: string, etapa: LeadStage) => {
    const next = leads.map((l) => (l.id === leadId ? { ...l, etapa } : l));
    setLeads(next);
    const cambiado = next.find((l) => l.id === leadId);
    if (cambiado) upsertLead(cambiado);
  };

  // --- Acciones de Intake / Validación ---
  const enviarAValidacion = (propiedadId: string) => {
    const next = propiedades.map((p) =>
      p.id === propiedadId ? { ...p, estatus: "Validacion" as PropertyStatus } : p,
    );
    setPropiedades(next);
    const cambiada = next.find((p) => p.id === propiedadId);
    if (cambiada) upsertPropiedad(cambiada);
  };

  const toggleDocumento = (propiedadId: string, documento: DocumentName) => {
    const next = propiedades.map((p) =>
      p.id === propiedadId
        ? {
            ...p,
            documentos: p.documentos.map((d) =>
              d.nombre === documento ? { ...d, aprobado: !d.aprobado } : d,
            ),
          }
        : p,
    );
    setPropiedades(next);
    const cambiada = next.find((p) => p.id === propiedadId);
    if (cambiada) upsertPropiedad(cambiada);
  };

  const activarPropiedad = (propiedadId: string) => {
    const next = propiedades.map((p) =>
      p.id === propiedadId ? { ...p, estatus: "Activa" as PropertyStatus } : p,
    );
    setPropiedades(next);
    const cambiada = next.find((p) => p.id === propiedadId);
    if (cambiada) upsertPropiedad(cambiada);
  };

  // Agrega una entrada a la cronología de una propiedad (usado por varias acciones).
  const registrarEvento = (
    propiedadId: string,
    tipo: "Estado" | "Documento" | "Nota" | "Publicacion",
    descripcion: string,
  ) => {
    const next = propiedades.map((p) =>
      p.id === propiedadId
        ? {
            ...p,
            eventos: [
              ...(p.eventos ?? []),
              { id: `ev-${Date.now()}`, fecha: new Date().toISOString(), tipo, descripcion },
            ],
          }
        : p,
    );
    setPropiedades(next);
    const cambiada = next.find((p) => p.id === propiedadId);
    if (cambiada) upsertPropiedad(cambiada);
  };

  // --- Cambiar estado desde el Listado / Detalle de Propiedad (modal genérico) ---
  const cambiarEstadoPropiedad = (
    propiedadId: string,
    nuevoEstado: PropertyStatus,
    motivo?: string,
  ) => {
    const etiqueta = nuevoEstado === "Validacion" ? "En validación" : nuevoEstado;
    const descripcionEvento = motivo
      ? `Cambió a estado "${etiqueta}" — motivo: ${motivo}`
      : `Cambió a estado "${etiqueta}"`;
    const next = propiedades.map((p) => {
      if (p.id !== propiedadId) return p;
      const activandose = nuevoEstado === "Activa" && p.estatus !== "Activa";
      const ahora = new Date().toISOString();
      return {
        ...p,
        estatus: nuevoEstado,
        // Al activarse por primera vez se registra la fecha de publicación.
        publicadaEl: activandose ? ahora : p.publicadaEl,
        ultimaActividad: ahora,
        eventos: [
          ...(p.eventos ?? []),
          { id: `ev-${Date.now()}`, fecha: ahora, tipo: "Estado" as const, descripcion: descripcionEvento },
        ],
      };
    });
    setPropiedades(next);
    const cambiada = next.find((p) => p.id === propiedadId);
    if (cambiada) upsertPropiedad(cambiada);
  };

  // --- Acciones del Detalle de Propiedad ---
  const guardarInformacionPropiedad = (propiedadId: string, cambios: Partial<Propiedad>) => {
    const next = propiedades.map((p) => (p.id === propiedadId ? { ...p, ...cambios } : p));
    setPropiedades(next);
    const cambiada = next.find((p) => p.id === propiedadId);
    if (cambiada) upsertPropiedad(cambiada);
  };

  const agregarComparable = (propiedadId: string, comparable: Omit<Comparable, "id">) => {
    const next = propiedades.map((p) =>
      p.id === propiedadId
        ? { ...p, comparables: [...(p.comparables ?? []), { id: `cmp-${Date.now()}`, ...comparable }] }
        : p,
    );
    setPropiedades(next);
    const cambiada = next.find((p) => p.id === propiedadId);
    if (cambiada) upsertPropiedad(cambiada);
  };

  const resolverOferta = (leadId: string, resultado: "Aceptada" | "Rechazada") => {
    const next = leads.map((l) =>
      l.id === leadId
        ? {
            ...l,
            etapa: resultado === "Aceptada" ? ("Cierre" as LeadStage) : ("Visitado" as LeadStage),
            nota: resultado === "Aceptada" ? `${l.nota} — Oferta aceptada.` : `${l.nota} — Oferta rechazada.`,
          }
        : l,
    );
    setLeads(next);
    const cambiado = next.find((l) => l.id === leadId);
    if (cambiado) upsertLead(cambiado);
  };

  const irADetalle = (propiedadId: string) => {
    setPropiedadSeleccionadaId(propiedadId);
    setVista("detalle");
  };

  const guardarNuevaPropiedad = (nueva: Propiedad) => {
    setPropiedades((prev) => [...prev, nueva]);
    upsertPropiedad(nueva);
    irADetalle(nueva.id);
  };

  // --- Importación masiva (CSV/Excel) ---
  const importarPropiedades = (nuevas: Propiedad[]) => {
    setPropiedades((prev) => [...prev, ...nuevas]);
    bulkUpsertPropiedades(nuevas);
  };

  const importarLeads = (nuevos: Lead[]) => {
    setLeads((prev) => [...prev, ...nuevos]);
    bulkUpsertLeads(nuevos);
  };

  // --- Acciones de la pantalla Asesores ---
  const invitarAsesor = (nombre: string, correo: string) => {
    const nuevo: Usuario = {
      id: `user-${Date.now()}`,
      nombre,
      correo,
      telefono: "",
      rol: "asesor_equipo",
      puesto: "Asesor Inmobiliario",
      iniciales: inicialesDe(nombre),
      estadoCuenta: "Invitado",
      puedeVerOtrasPropiedades: permisoEquipoVerTodas,
    };
    setUsuarios((prev) => [...prev, nuevo]);
    upsertUsuario(nuevo);
  };

  // --- Acciones de Configuración ---
  const guardarAgencia = (nueva: AgenciaInfo) => {
    setAgencia(nueva);
    upsertAgencia(nueva);
  };
  const guardarPermisoEquipo = (valor: boolean) => {
    setPermisoEquipoVerTodas(valor);
    upsertConfiguracion(valor, notificaciones);
  };
  const guardarNotificaciones = (valor: Record<string, boolean>) => {
    setNotificaciones(valor);
    upsertConfiguracion(permisoEquipoVerTodas, valor);
  };

  const guardarPerfilPersonal = (id: string, cambios: Partial<Usuario>) => {
    const next = usuarios.map((u) => (u.id === id ? { ...u, ...cambios } : u));
    setUsuarios(next);
    const cambiado = next.find((u) => u.id === id);
    if (cambiado) upsertUsuario(cambiado);
  };

  const desactivarAsesor = (asesorId: string, reasignarAId: string) => {
    const usuariosNext = usuarios.map((u) =>
      u.id === asesorId ? { ...u, estadoCuenta: "Inactivo" as const } : u,
    );
    const propiedadesNext = propiedades.map((p) =>
      p.asesorId === asesorId ? { ...p, asesorId: reasignarAId } : p,
    );
    const leadsNext = leads.map((l) => (l.asesorId === asesorId ? { ...l, asesorId: reasignarAId } : l));
    setUsuarios(usuariosNext);
    setPropiedades(propiedadesNext);
    setLeads(leadsNext);
    const usuarioCambiado = usuariosNext.find((u) => u.id === asesorId);
    if (usuarioCambiado) upsertUsuario(usuarioCambiado);
    bulkUpsertPropiedades(propiedadesNext.filter((p) => p.asesorId === reasignarAId));
    bulkUpsertLeads(leadsNext.filter((l) => l.asesorId === reasignarAId));
  };

  const reactivarAsesor = (asesorId: string) => {
    const next = usuarios.map((u) => (u.id === asesorId ? { ...u, estadoCuenta: "Activo" as const } : u));
    setUsuarios(next);
    const cambiado = next.find((u) => u.id === asesorId);
    if (cambiado) upsertUsuario(cambiado);
  };

  const editarPermisosAsesor = (asesorId: string, puedeVerOtras: boolean) => {
    const next = usuarios.map((u) =>
      u.id === asesorId ? { ...u, puedeVerOtrasPropiedades: puedeVerOtras } : u,
    );
    setUsuarios(next);
    const cambiado = next.find((u) => u.id === asesorId);
    if (cambiado) upsertUsuario(cambiado);
  };

  const irAPerfil = (asesorId: string) => {
    setAsesorSeleccionadoId(asesorId);
    setVista("perfil");
  };

  // --- Acciones del Portal del Cliente ---
  const subirDocumentoCliente = (leadId: string, nombreDoc: string) => {
    const next = leads.map((l) =>
      l.id === leadId && l.cierre
        ? {
            ...l,
            cierre: {
              ...l.cierre,
              documentos: l.cierre.documentos.map((d) =>
                d.nombre === nombreDoc ? { ...d, estado: "Cargado" as const, motivoRechazo: undefined } : d,
              ),
            },
          }
        : l,
    );
    setLeads(next);
    const cambiado = next.find((l) => l.id === leadId);
    if (cambiado) upsertLead(cambiado);
  };

  const confirmarCitaCliente = (leadId: string, citaId: string) => {
    const next = leads.map((l) =>
      l.id === leadId && l.cierre
        ? {
            ...l,
            cierre: {
              ...l.cierre,
              citas: l.cierre.citas.map((c) =>
                c.id === citaId ? { ...c, estado: "Confirmada" as const } : c,
              ),
            },
          }
        : l,
    );
    setLeads(next);
    const cambiado = next.find((l) => l.id === leadId);
    if (cambiado) upsertLead(cambiado);
  };

  return (
    <div className="min-h-screen">
      {/* Barra superior con cambio de rol/vista */}
      <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-black text-white">
              H
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900">
                Hábitat Bienes Raíces
              </p>
              <p className="text-[11px] uppercase tracking-widest text-slate-400">
                HABITAT México RS
              </p>
            </div>
            <span
              title={
                isCloudEnabled
                  ? "Conectado a la base de datos compartida (Supabase)"
                  : "Modo local: los datos solo se guardan en este navegador"
              }
              className={`ml-2 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                isCloudEnabled && !avisoNube
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
              }`}
            >
              {isCloudEnabled && !avisoNube ? "● Piloto en vivo" : <><CloudOff className="size-3" /> Modo local</>}
            </span>
            <a
              href="/descargas/habitat-piloto.zip"
              download
              title="Descargar la app para correrla localmente (requiere Node.js instalado)"
              className="ml-1 flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-slate-700"
            >
              <Upload className="size-3 rotate-180" /> Descargar app
            </a>
            <button
              onClick={() =>
                exportarSnapshotJSON({
                  propiedades,
                  leads,
                  usuarios,
                  agencia,
                  permisoEquipoVerTodas,
                  notificaciones,
                })
              }
              title="Descargar un respaldo JSON de todos los datos capturados"
              className="ml-1 rounded-full px-2 py-1 text-[10px] font-semibold text-slate-400 underline decoration-dotted hover:text-slate-600"
            >
              Exportar respaldo
            </button>
          </div>

          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setVista("broker")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                vista === "broker"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <ShieldCheck className="size-3.5" />
              Dashboard Broker
            </button>
            <button
              onClick={() => {
                setUsuarioActivoId(jean.id);
                setVista("propiedades");
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                vista === "propiedades"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Building2 className="size-3.5" />
              Propiedades
            </button>
            <button
              onClick={() => setVista("asesores")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                vista === "asesores"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Users className="size-3.5" />
              Asesores
            </button>
            <button
              onClick={() => setVista("asesor")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                vista === "asesor"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <LayoutDashboard className="size-3.5" />
              Dashboard Asesor
            </button>
            <button
              onClick={() => setVista("mi-perfil")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                vista === "mi-perfil"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <UserIcon className="size-3.5" />
              Mi Perfil
            </button>
            <button
              onClick={() => setVista("propietario")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                vista === "propietario"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Home className="size-3.5" />
              Portal Propietario
            </button>
            <button
              onClick={() => setVista("cliente")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                vista === "cliente"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <UserIcon className="size-3.5" />
              Portal Cliente
            </button>
            <button
              onClick={() => setVista("intake")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                vista === "intake"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <ClipboardCheck className="size-3.5" />
              Validación de Propiedades
            </button>
            <button
              onClick={() => setVista("reportes")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                vista === "reportes"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <BarChart3 className="size-3.5" />
              Reportes
            </button>
            <button
              onClick={() => setVista("importar")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                vista === "importar"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Upload className="size-3.5" />
              Importar Datos
            </button>
            <button
              onClick={() => setVista("configuracion")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                vista === "configuracion"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Settings className="size-3.5" />
              Configuración
            </button>
          </div>
        </div>
      </nav>

      {avisoNube && (
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-6 pt-3 text-xs text-amber-700">
          <CloudOff className="size-3.5" /> {avisoNube}
        </div>
      )}

      {cargandoNube ? (
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
          Conectando con la base de datos compartida…
        </div>
      ) : (
        <>
      {vista === "broker" && (
        <BrokerDashboard
          broker={jean}
          usuarios={usuarios}
          propiedades={propiedades}
          leads={leads}
          onVerAsesor={irAPerfil}
        />
      )}
      {vista === "propiedades" && (
        <ListadoPropiedades
          usuario={usuarioActivo}
          usuarios={usuarios}
          propiedades={propiedades}
          leads={leads}
          onCambiarEstado={cambiarEstadoPropiedad}
          onVerDetalle={irADetalle}
          onNuevaPropiedad={() => setVista("nueva")}
        />
      )}
      {vista === "nueva" && (
        <NuevaPropiedad
          usuario={usuarioActivo}
          propiedades={propiedades}
          onCancelar={() => setVista("propiedades")}
          onGuardar={guardarNuevaPropiedad}
        />
      )}
      {vista === "detalle" && propiedadSeleccionadaId && (
        <DetalleDePropiedad
          propiedad={propiedades.find((p) => p.id === propiedadSeleccionadaId)!}
          usuario={usuarioActivo}
          usuarios={usuarios}
          leads={leads}
          onVolver={() => setVista("propiedades")}
          onCambiarEstado={cambiarEstadoPropiedad}
          onGuardarInformacion={guardarInformacionPropiedad}
          onAgregarEvento={(id, desc) => registrarEvento(id, "Nota", desc)}
          onAgregarComparable={agregarComparable}
          onResolverOferta={resolverOferta}
        />
      )}
      {vista === "asesores" && (
        <Asesores
          usuarios={usuarios}
          propiedades={propiedades}
          leads={leads}
          onInvitar={invitarAsesor}
          onDesactivar={desactivarAsesor}
          onReactivar={reactivarAsesor}
          onEditarPermisos={editarPermisosAsesor}
          onVerDesempeno={irAPerfil}
        />
      )}
      {vista === "perfil" && asesorSeleccionadoId && (
        <PerfilDesempeno
          asesor={usuarios.find((u) => u.id === asesorSeleccionadoId)!}
          propiedades={propiedades}
          leads={leads}
          onVolver={() => setVista("asesores")}
          onEditarPermisos={editarPermisosAsesor}
          onVerDetallePropiedad={irADetalle}
        />
      )}
      {vista === "asesor" && (
        <AsesorDashboard
          asesor={lulu}
          leads={leads}
          propiedades={propiedades}
          onMoveLead={moverLead}
          onVerPropiedades={() => {
            setUsuarioActivoId(lulu.id);
            setVista("propiedades");
          }}
        />
      )}
      {vista === "mi-perfil" && (
        <PerfilPersonal usuario={lulu} onGuardar={guardarPerfilPersonal} />
      )}
      {vista === "propietario" && (
        <PropietarioPortal
          propiedadesPropietario={propiedadesDeAnaBeltran}
          usuarios={usuarios}
          leads={leads}
        />
      )}
      {vista === "cliente" && (
        <ClientePortal
          lead={leads.find((l) => l.id === "lead-006")!}
          propiedad={propiedades.find((p) => p.id === "prop-005")}
          onSubirDocumento={subirDocumentoCliente}
          onConfirmarCita={confirmarCitaCliente}
        />
      )}
      {vista === "intake" && (
        <IntakeValidacion
          propiedades={propiedades}
          usuarios={usuarios}
          onEnviarValidacion={enviarAValidacion}
          onToggleDocumento={toggleDocumento}
          onActivar={activarPropiedad}
        />
      )}
      {vista === "reportes" && (
        <Reportes usuarios={usuarios} propiedades={propiedades} leads={leads} />
      )}
      {vista === "importar" && (
        <ImportarDatos
          usuarios={usuarios}
          usuarioActivoId={usuarioActivoId}
          onImportarPropiedades={importarPropiedades}
          onImportarLeads={importarLeads}
        />
      )}
      {vista === "configuracion" && (
        <Configuracion
          agencia={agencia}
          onGuardarAgencia={guardarAgencia}
          permisoEquipoVerTodas={permisoEquipoVerTodas}
          onGuardarPermisoEquipo={guardarPermisoEquipo}
          notificaciones={notificaciones}
          onGuardarNotificaciones={guardarNotificaciones}
        />
      )}
      </>
      )}
    </div>
  );
}
