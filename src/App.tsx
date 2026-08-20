import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  Calculator,
  ClipboardCheck,
  Contact,
  Download,
  Home,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  ShieldQuestion,
  Upload,
  User as UserIcon,
  Users,
} from "lucide-react";
import db from "./data/db.json";
import { NOTIFICACIONES_DEFAULT } from "./data/configuracionOpciones";
import type {
  AgenciaInfo,
  CalificacionBANT,
  CitaAgenda,
  EstadoCitaAgenda,
  Comparable,
  DocumentName,
  Interaccion,
  Lead,
  LeadStage,
  PropertyStatus,
  Propiedad,
  SolicitudEstado,
  TipoInteraccion,
  UserRole,
  Usuario,
} from "./types";
import {
  ETAPAS_QUE_EXIGEN_BANT,
  clasificarLead,
  puedeCargarPropiedades,
  tieneAgenda,
  totalBant,
  esLeadOperativo,
} from "./types";
import Agenda from "./views/Agenda";
import SaludInmobiliaria from "./views/SaludInmobiliaria";
import AsesorDashboard from "./views/AsesorDashboard";
import Asesores from "./views/Asesores";
import CalculadoraComisiones from "./views/CalculadoraComisiones";
import Clientes from "./views/Clientes";
import AuthScreen from "./views/AuthScreen";
import BrokerDashboard from "./views/BrokerDashboard";
import Configuracion from "./views/Configuracion";
import DetalleDePropiedad from "./views/DetalleDePropiedad";
import ImportarDatos from "./views/ImportarDatos";
import IntakeValidacion from "./views/IntakeValidacion";
import ListadoPropiedades from "./views/ListadoPropiedades";
import NuevaPropiedad from "./views/NuevaPropiedad";
import PendienteAprobacion from "./views/PendienteAprobacion";
import PerfilDesempeno from "./views/PerfilDesempeno";
import PerfilPersonal from "./views/PerfilPersonal";
import ClientePortal from "./views/ClientePortal";
import PropietarioPortal from "./views/PropietarioPortal";
import Reportes from "./views/Reportes";
import SolicitudesAcceso from "./views/SolicitudesAcceso";
import AppShell, { type NavItem } from "./components/AppShell";
import CampanaNotificaciones from "./components/CampanaNotificaciones";
import AgendarVisitaModal from "./components/AgendarVisitaModal";
import {
  construirNotificaciones,
  guardarVistas,
  leerVistas,
  type Notificacion,
} from "./lib/notificaciones";
import { citasDeHoy } from "./lib/agenda";
import type { NivelAntiguedad } from "./lib/antiguedad";
import { claseParaFiltro, type NivelCartera } from "./lib/cartera";
import type { RangoRespuesta } from "./lib/respuesta";
import { useAuth } from "./lib/authContext";
import { isCloudEnabled } from "./lib/supabaseClient";
import {
  bulkUpsertLeads,
  bulkUpsertPropiedades,
  cargarSnapshotLocal,
  crearSolicitudEstado,
  eliminarCita,
  exportarSnapshotJSON,
  fetchInitialData,
  fetchSolicitudes,
  guardarSnapshotLocal,
  obtenerTokenAgenda,
  reemplazarEnArreglo,
  resolverSolicitudEstado,
  rotarTokenAgenda,
  sembrarDatosDeEjemplo,
  suscribirCambiosEnVivo,
  upsertAgencia,
  upsertCita,
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
  | "solicitudes"
  | "perfil"
  | "asesor"
  | "mi-perfil"
  | "propietario"
  | "cliente"
  | "intake"
  | "reportes"
  | "importar"
  | "comisiones"
  | "salud"
  | "clientes"
  | "agenda"
  | "configuracion";

const ETIQUETAS_ROL: Record<UserRole, string> = {
  broker: "Broker / Admin",
  asesor_independiente: "Asesor independiente",
  asesor_equipo: "Asesor de equipo",
  propietario: "Propietario",
  cliente: "Cliente",
};

// Vista inicial de cada rol al entrar.
const VISTA_INICIAL: Record<UserRole, Vista> = {
  broker: "broker",
  asesor_independiente: "asesor",
  asesor_equipo: "asesor",
  propietario: "propietario",
  cliente: "cliente",
};

// Snapshot de fábrica (datos de ejemplo): siembra Supabase la primera vez o
// alimenta el modo local de demostración.
const snapshotDeFabrica: EstadoCompleto = {
  propiedades: db.propiedades as Propiedad[],
  leads: db.leads as Lead[],
  usuarios: db.usuarios as Usuario[],
  // La agenda arranca vacia: sembrar citas de ejemplo con fechas fijas se ve
  // roto a los pocos dias y no ensena nada.
  citas: [],
  agencia: db.agencia as AgenciaInfo,
  permisoEquipoVerTodas: false,
  notificaciones: NOTIFICACIONES_DEFAULT,
};

const DEMO_KEY = "habitat-demo-usuario";

export default function App() {
  const { sesion, perfil, cargando: cargandoAuth, cerrarSesion, enRecuperacion } = useAuth();

  // --- Estado de datos ---
  const snapshotLocal = !isCloudEnabled ? cargarSnapshotLocal() : null;
  const inicial: EstadoCompleto = { ...snapshotDeFabrica, ...snapshotLocal };

  const [propiedades, setPropiedades] = useState<Propiedad[]>(inicial.propiedades);
  const [leads, setLeads] = useState<Lead[]>(inicial.leads);
  // El estado `leads` guarda TODO lo que hay en la tabla: embudo activo,
  // histórico y directorio importado de EasyBroker. Los tableros y KPIs
  // consumen `leadsOperativos`; solo la pantalla de Clientes ve la lista
  // completa (con su propio filtro). Ver esLeadOperativo en types.ts.
  const leadsOperativos = useMemo(() => leads.filter(esLeadOperativo), [leads]);
  const [usuarios, setUsuarios] = useState<Usuario[]>(inicial.usuarios);
  const [citas, setCitas] = useState<CitaAgenda[]>(inicial.citas ?? []);
  // Solicitudes de cambio de estado (pendientes + resueltas recientes).
  const [solicitudes, setSolicitudes] = useState<SolicitudEstado[]>([]);
  const [agencia, setAgencia] = useState<AgenciaInfo>(inicial.agencia);
  const [permisoEquipoVerTodas, setPermisoEquipoVerTodas] = useState(inicial.permisoEquipoVerTodas);
  const [notificaciones, setNotificaciones] = useState<Record<string, boolean>>(
    inicial.notificaciones,
  );

  // Modo demo local (sin Supabase): se elige un usuario de ejemplo para probar.
  const [demoUsuarioId, setDemoUsuarioId] = useState<string | null>(() =>
    !isCloudEnabled ? window.localStorage.getItem(DEMO_KEY) : null,
  );

  // Usuario con el que se navega: el perfil real (nube) o el elegido en demo.
  const usuarioActual: Usuario | null = isCloudEnabled
    ? perfil
    : usuarios.find((u) => u.id === demoUsuarioId) ?? null;

  const sesionActiva = isCloudEnabled
    ? Boolean(sesion && perfil && perfil.estadoCuenta === "Activo")
    : Boolean(usuarioActual);

  // --- Sincronización con Supabase (solo con sesión activa: RLS filtra por rol) ---
  const [cargandoNube, setCargandoNube] = useState(false);
  const [avisoNube, setAvisoNube] = useState<string | null>(null);
  const yaSembrado = useRef(false);

  useEffect(() => {
    if (!isCloudEnabled || !sesionActiva) return;
    let vivo = true;
    setCargandoNube(true);
    (async () => {
      try {
        let datos = await fetchInitialData();
        const vacio = datos && datos.propiedades.length === 0 && datos.leads.length === 0;
        // Solo el broker siembra los datos de ejemplo (RLS bloquea al resto).
        if (datos && vacio && usuarioActual?.rol === "broker" && !yaSembrado.current) {
          yaSembrado.current = true;
          await sembrarDatosDeEjemplo(snapshotDeFabrica);
          datos = await fetchInitialData();
        }
        if (!vivo || !datos) return;
        fetchSolicitudes().then((s) => vivo && setSolicitudes(s));
        setPropiedades(datos.propiedades);
        setLeads(datos.leads);
        setUsuarios(datos.usuarios);
        setCitas(datos.citas);
        setAgencia(datos.agencia);
        setPermisoEquipoVerTodas(datos.permisoEquipoVerTodas);
        setNotificaciones(datos.notificaciones);
        setAvisoNube(null);
      } catch (err) {
        console.error("[Supabase] fetchInitialData", err);
        if (vivo) setAvisoNube("No se pudo conectar con la base de datos. Intenta recargar.");
      } finally {
        if (vivo) setCargandoNube(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [sesionActiva]);

  useEffect(() => {
    if (!isCloudEnabled || !sesionActiva) return;
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
      onCita: (c) => setCitas((prev) => reemplazarEnArreglo(prev, c)),
      onCitaEliminada: (id) => setCitas((prev) => prev.filter((c) => c.id !== id)),
      onSolicitud: (s) => setSolicitudes((prev) => reemplazarEnArreglo(prev, s)),
    });
  }, [sesionActiva]);

  // Modo local: autoguarda en el navegador.
  useEffect(() => {
    if (isCloudEnabled) return;
    guardarSnapshotLocal({
      propiedades,
      leads,
      usuarios,
      citas,
      agencia,
      permisoEquipoVerTodas,
      notificaciones,
    });
  }, [propiedades, leads, usuarios, citas, agencia, permisoEquipoVerTodas, notificaciones]);

  // --- Navegación ---
  const [vista, setVista] = useState<Vista | null>(null);
  const [propiedadSeleccionadaId, setPropiedadSeleccionadaId] = useState<string | null>(null);
  const [asesorSeleccionadoId, setAsesorSeleccionadoId] = useState<string | null>(null);
  // Desde dónde se abrió la calculadora, para saber a dónde regresar.
  const [origenCalculadora, setOrigenCalculadora] = useState<Vista | null>(null);
  // Aviso cuando alguien intenta avanzar un prospecto sin calificarlo.
  const [avisoBant, setAvisoBant] = useState<string | null>(null);
  // Cliente y filtro con los que debe abrirse la vista de Clientes.
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState<string | null>(null);
  const [etapaClientes, setEtapaClientes] = useState<LeadStage | null>(null);
  // Filtros con los que aterriza el asesor cuando toca una gráfica de Salud
  // inmobiliaria. Se guardan aquí (y no dentro de cada vista) porque el
  // origen del filtro es otra pantalla.
  const [claseClientes, setClaseClientes] = useState<NivelCartera | null>(null);
  const [respuestaClientes, setRespuestaClientes] = useState<RangoRespuesta | null>(null);
  const [antiguedadPropiedades, setAntiguedadPropiedades] = useState<NivelAntiguedad | null>(null);
  // Notificaciones ya vistas (por usuario, en este navegador).
  const [vistasNotif, setVistasNotif] = useState<Set<string>>(new Set());
  // Modal de agendar: null = cerrado. Se abre desde la Agenda y desde la ficha
  // de un prospecto, por eso vive aquí y no dentro de una vista.
  const [agendando, setAgendando] = useState<{
    cita?: CitaAgenda | null;
    leadId?: string | null;
    fecha?: Date | null;
  } | null>(null);
  // Token del feed ICS. Se pide una sola vez, cuando el usuario abre la agenda.
  const [tokenAgenda, setTokenAgenda] = useState<string | null>(null);

  // Al entrar (o cambiar de cuenta), aterriza en la vista inicial de su rol.
  useEffect(() => {
    if (usuarioActual) setVista(VISTA_INICIAL[usuarioActual.rol]);
    else setVista(null);
  }, [usuarioActual?.id, usuarioActual?.rol]);

  // --- Historial del navegador ---
  // Cada cambio de vista se registra en window.history para que el botón
  // "atrás" (del navegador o del teléfono) regrese a la vista anterior en
  // vez de cerrar la aplicación. `desdePopstate` evita registrar de nuevo
  // la vista cuando el cambio vino precisamente de ese botón.
  const desdePopstate = useRef(false);

  useEffect(() => {
    if (!vista) return;
    if (desdePopstate.current) {
      desdePopstate.current = false;
      return;
    }
    const estadoActual = (window.history.state ?? {}) as { vista?: Vista };
    if (estadoActual.vista === vista) return;
    if (estadoActual.vista == null) {
      // Primera vista de la sesión: se reemplaza la entrada actual.
      window.history.replaceState({ vista }, "");
    } else {
      window.history.pushState({ vista }, "");
    }
  }, [vista]);

  useEffect(() => {
    const alRegresar = (e: PopStateEvent) => {
      const anterior = (e.state as { vista?: Vista } | null)?.vista;
      if (anterior) {
        desdePopstate.current = true;
        setVista(anterior);
      }
    };
    window.addEventListener("popstate", alRegresar);
    return () => window.removeEventListener("popstate", alRegresar);
  }, []);

  const rol = usuarioActual?.rol;
  const solicitudesPendientes = usuarios.filter((u) => u.estadoCuenta === "Pendiente").length;

  // --- Avisos de la campana: se derivan de los datos, no de una tabla aparte.
  // (Ojo: `notificaciones` es otra cosa — son las preferencias de Configuración.)
  const avisos: Notificacion[] = useMemo(
    () =>
      usuarioActual
        ? construirNotificaciones(usuarioActual, leadsOperativos, propiedades, solicitudes, usuarios)
        : [],
    [usuarioActual, leadsOperativos, propiedades, solicitudes, usuarios],
  );

  useEffect(() => {
    setVistasNotif(usuarioActual ? leerVistas(usuarioActual.id) : new Set());
  }, [usuarioActual?.id]);

  // El token del feed ICS se pide la primera vez que alguien abre la Agenda,
  // no al iniciar sesión: crear una fila de suscripción para quien nunca va a
  // usar la sincronización es basura en la base.
  useEffect(() => {
    if (vista !== "agenda" || !isCloudEnabled || tokenAgenda) return;
    obtenerTokenAgenda().then(setTokenAgenda);
  }, [vista, tokenAgenda]);

  const marcarNotifVista = (id: string) => {
    if (!usuarioActual) return;
    setVistasNotif((prev) => {
      const next = new Set(prev).add(id);
      guardarVistas(usuarioActual.id, next);
      return next;
    });
  };

  const marcarTodasVistas = () => {
    if (!usuarioActual) return;
    const next = new Set<string>(avisos.map((n) => n.id));
    setVistasNotif(next);
    guardarVistas(usuarioActual.id, next);
  };

  // Citas de hoy todavía abiertas — es el badge de la Agenda.
  // Usa la MISMA función que la franja "tu día" del dashboard: si cada una
  // contara por su cuenta, el badge diría 3 y el dashboard 2.
  const citasHoy = useMemo(() => {
    if (!usuarioActual) return 0;
    // El broker ve la agenda de toda la oficina; el asesor, solo la suya.
    const soloDe = usuarioActual.rol === "broker" ? undefined : usuarioActual.id;
    return citasDeHoy(citas, soloDe).length;
  }, [citas, usuarioActual]);

  // Menú según rol: nadie ve destinos ajenos.
  const navItems: NavItem[] = useMemo(() => {
    switch (rol) {
      case "broker":
        return [
          { id: "broker", etiqueta: "Dashboard", Icono: ShieldCheck },
          { id: "propiedades", etiqueta: "Propiedades", Icono: Building2 },
          { id: "clientes", etiqueta: "Clientes", Icono: Contact },
          { id: "agenda", etiqueta: "Agenda", Icono: CalendarDays, badge: citasHoy || undefined },
          { id: "intake", etiqueta: "Validación", Icono: ClipboardCheck },
          { id: "asesores", etiqueta: "Asesores", Icono: Users },
          {
            id: "solicitudes",
            etiqueta: "Solicitudes",
            Icono: ShieldQuestion,
            badge: solicitudesPendientes || undefined,
          },
          { id: "reportes", etiqueta: "Reportes", Icono: BarChart3 },
          { id: "importar", etiqueta: "Importar", Icono: Upload },
          { id: "configuracion", etiqueta: "Configuración", Icono: Settings },
          { id: "mi-perfil", etiqueta: "Mi Perfil", Icono: UserIcon },
        ];
      case "asesor_independiente":
        return [
          { id: "asesor", etiqueta: "Dashboard", Icono: LayoutDashboard },
          // La agenda va en la barra inferior a propósito: es lo que un asesor
          // en campo abre varias veces al día.
          { id: "agenda", etiqueta: "Agenda", Icono: CalendarDays, badge: citasHoy || undefined },
          { id: "clientes", etiqueta: "Clientes", Icono: Contact },
          { id: "propiedades", etiqueta: "Propiedades", Icono: Building2 },
          { id: "comisiones", etiqueta: "Comisiones", Icono: Calculator },
          { id: "reportes", etiqueta: "Reportes", Icono: BarChart3 },
          { id: "mi-perfil", etiqueta: "Mi Perfil", etiquetaCorta: "Perfil", Icono: UserIcon },
          { id: "importar", etiqueta: "Importar", Icono: Upload },
        ];
      case "asesor_equipo":
        return [
          { id: "asesor", etiqueta: "Dashboard", Icono: LayoutDashboard },
          { id: "agenda", etiqueta: "Agenda", Icono: CalendarDays, badge: citasHoy || undefined },
          { id: "clientes", etiqueta: "Clientes", Icono: Contact },
          { id: "propiedades", etiqueta: "Propiedades", Icono: Building2 },
          { id: "comisiones", etiqueta: "Comisiones", Icono: Calculator },
          { id: "mi-perfil", etiqueta: "Mi Perfil", etiquetaCorta: "Perfil", Icono: UserIcon },
        ];
      case "propietario":
        return [
          { id: "propietario", etiqueta: "Mi Propiedad", Icono: Home },
          { id: "mi-perfil", etiqueta: "Mi Perfil", etiquetaCorta: "Perfil", Icono: UserIcon },
        ];
      case "cliente":
        return [
          { id: "cliente", etiqueta: "Mi Proceso", Icono: Home },
          { id: "mi-perfil", etiqueta: "Mi Perfil", etiquetaCorta: "Perfil", Icono: UserIcon },
        ];
      default:
        return [];
    }
  }, [rol, solicitudesPendientes, citasHoy]);

  // Guardia: si la vista actual no pertenece al rol, regresa a su inicio.
  const vistasPermitidas = useMemo(() => {
    const base = new Set(navItems.map((i) => i.id as Vista));
    // Vistas internas alcanzables desde el menú:
    if (base.has("propiedades")) {
      base.add("detalle");
      // Dar de alta inventario es del broker y del independiente: el asesor
      // de equipo no puede llegar a esta pantalla ni por navegación interna.
      if (rol && puedeCargarPropiedades(rol)) base.add("nueva");
    }
    if (base.has("asesores")) base.add("perfil");
    // Salud inmobiliaria: se abre desde la tarjeta del dashboard del asesor,
    // sin icono propio en el menú (decisión de diseño).
    if (base.has("comisiones")) base.add("salud");
    return base;
  }, [navItems, rol]);

  useEffect(() => {
    if (usuarioActual && vista && !vistasPermitidas.has(vista)) {
      setVista(VISTA_INICIAL[usuarioActual.rol]);
    }
  }, [vista, vistasPermitidas, usuarioActual]);

  // ============================================================
  // Compuertas de acceso
  // ============================================================
  if (isCloudEnabled) {
    if (cargandoAuth) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-white text-sm text-slate-400">
          Cargando…
        </div>
      );
    }
    if (!sesion || enRecuperacion) return <AuthScreen />;
    if (!perfil || perfil.estadoCuenta !== "Activo") return <PendienteAprobacion />;
  } else if (!usuarioActual) {
    // Modo local sin backend: selector de usuario de demostración.
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-900 text-sm font-black tracking-tight text-white">
            RE
          </div>
          <h1 className="mt-4 text-center text-lg font-bold text-slate-900">Modo demostración</h1>
          <p className="mt-1 text-center text-sm text-slate-500">
            No hay conexión a la nube configurada. Elige con qué usuario de ejemplo quieres probar
            la app (los datos solo viven en este navegador).
          </p>
          <div className="mt-5 space-y-2">
            {usuarios
              .filter((u) => u.estadoCuenta === "Activo")
              .map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    window.localStorage.setItem(DEMO_KEY, u.id);
                    setDemoUsuarioId(u.id);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-slate-400"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                    {u.iniciales}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{u.nombre}</span>
                    <span className="block text-xs text-slate-500">{ETIQUETAS_ROL[u.rol]}</span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      </div>
    );
  }

  const yo = usuarioActual!;

  // ============================================================
  // Acciones (idénticas a antes; RLS valida cada escritura en la nube)
  // ============================================================
  // Agrega un evento a la bitácora del prospecto. El historial solo crece:
  // nunca se reescribe ni se borra (la base también lo impide con un trigger).
  const conHistorial = (l: Lead, tipo: TipoInteraccion, descripcion: string): Lead => {
    const evento: Interaccion = {
      id: `int-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fecha: new Date().toISOString(),
      tipo,
      descripcion,
      autor: usuarioActual?.nombre ?? "Sistema",
    };
    return { ...l, historial: [...(l.historial ?? []), evento] };
  };

  const guardarLead = (next: Lead[], leadId: string) => {
    setLeads(next);
    const cambiado = next.find((l) => l.id === leadId);
    if (cambiado) upsertLead(cambiado);
  };

  const moverLead = (leadId: string, etapa: LeadStage) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    // Regla dura: no se avanza a Visitado, Negociación o Cierre sin calificación.
    // Está también en la base de datos; aquí se replica para explicar el porqué
    // en vez de mostrar un error técnico de Postgres.
    if (ETAPAS_QUE_EXIGEN_BANT.includes(etapa) && !lead.bant) {
      setAvisoBant(
        `Antes de mover a ${lead.nombre} necesitas calificarlo. Ve a Clientes y responde las cuatro preguntas: toma menos de un minuto.`,
      );
      return;
    }

    const next = leads.map((l) =>
      l.id === leadId
        ? conHistorial(
            { ...l, etapa },
            "Etapa",
            `Pasó de "${l.etapa}" a "${etapa}"`,
          )
        : l,
    );
    guardarLead(next, leadId);
  };

  // Guarda la calificación BANT y la deja registrada en el historial.
  const guardarCalificacion = (leadId: string, bant: CalificacionBANT) => {
    const total = totalBant(bant);
    const next = leads.map((l) =>
      l.id === leadId
        ? conHistorial(
            { ...l, bant },
            "Calificacion",
            `Calificado en ${total}/100 puntos — nivel ${clasificarLead(total)}`,
          )
        : l,
    );
    guardarLead(next, leadId);
  };

  const registrarInteraccion = (
    leadId: string,
    tipo: TipoInteraccion,
    descripcion: string,
  ) => {
    const next = leads.map((l) => {
      if (l.id !== leadId) return l;
      // El primer contacto registrado alimenta el KPI de tiempo de respuesta.
      const base = l.primerContactoEn ? l : { ...l, primerContactoEn: new Date().toISOString() };
      return conHistorial(base, tipo, descripcion);
    });
    guardarLead(next, leadId);
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

  // Aprobación de documentos completada: la propiedad sale al mercado.
  const activarPropiedad = (propiedadId: string) => {
    cambiarEstadoPropiedad(propiedadId, "Publicada", "Documentos validados por el broker");
  };

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

  const cambiarEstadoPropiedad = (
    propiedadId: string,
    nuevoEstado: PropertyStatus,
    motivo?: string,
  ) => {
    const descripcionEvento = motivo
      ? `Cambió a estado "${nuevoEstado}" — motivo: ${motivo}`
      : `Cambió a estado "${nuevoEstado}"`;
    const next = propiedades.map((p) => {
      if (p.id !== propiedadId) return p;
      const publicandose = nuevoEstado === "Publicada" && p.estatus !== "Publicada";
      const ahora = new Date().toISOString();
      return {
        ...p,
        estatus: nuevoEstado,
        publicadaEl: publicandose ? ahora : p.publicadaEl,
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

  // --- Flujo de solicitudes (asesor de equipo → broker) ---------------------
  // El asesor no escribe el estatus: crea una solicitud. En la nube, el broker
  // la aprueba y un trigger aplica el cambio; en modo local se simula igual.
  const solicitarCambioEstado = async (
    propiedadId: string,
    nuevoEstado: PropertyStatus,
    motivo?: string,
  ) => {
    const propiedad = propiedades.find((p) => p.id === propiedadId);
    if (!propiedad || !usuarioActual) return;
    const solicitud: SolicitudEstado = {
      id: (crypto.randomUUID?.() ?? `sol-${Date.now()}`) as string,
      propiedadId,
      solicitanteId: usuarioActual.id,
      estadoActual: propiedad.estatus,
      estadoSolicitado: nuevoEstado,
      motivo,
      estatus: "pendiente",
      creadoEn: new Date().toISOString(),
    };
    if (isCloudEnabled) {
      const error = await crearSolicitudEstado(solicitud);
      if (error) {
        setAvisoBant(error);
        return;
      }
    }
    setSolicitudes((prev) => reemplazarEnArreglo(prev, solicitud));
    // Queda en la cronología de la propiedad desde el momento de pedirlo.
    registrarEvento(
      propiedadId,
      "Estado",
      `${usuarioActual.nombre} solicitó cambiar el estado a "${nuevoEstado}"${
        motivo ? ` — motivo: ${motivo}` : ""
      } (en revisión del broker)`,
    );
  };

  // Solo broker. Al aprobar, el cambio de estado se aplica de inmediato.
  // (Ojo: `resolverSolicitud`, más abajo, es otra cosa — solicitudes de acceso
  // de cuentas nuevas. Estas son de cambio de estado de una propiedad.)
  const resolverSolicitudCambio = async (
    solicitud: SolicitudEstado,
    resultado: "aprobada" | "rechazada",
  ) => {
    if (isCloudEnabled) {
      const error = await resolverSolicitudEstado(solicitud.id, resultado);
      if (error) {
        setAvisoBant(error);
        return;
      }
    }
    setSolicitudes((prev) =>
      reemplazarEnArreglo(prev, {
        ...solicitud,
        estatus: resultado,
        resueltoPor: usuarioActual?.id,
        resueltoEn: new Date().toISOString(),
      }),
    );
    if (resultado === "aprobada") {
      cambiarEstadoPropiedad(
        solicitud.propiedadId,
        solicitud.estadoSolicitado,
        `solicitud aprobada por ${usuarioActual?.nombre ?? "el broker"}`,
      );
    } else {
      registrarEvento(
        solicitud.propiedadId,
        "Estado",
        `Solicitud de cambio a "${solicitud.estadoSolicitado}" rechazada por ${
          usuarioActual?.nombre ?? "el broker"
        }`,
      );
    }
  };

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

  // Abre la vista de Clientes en un cliente concreto (un solo toque desde
  // el dashboard o desde una notificación: nunca "búscalo en la lista").
  const irACliente = (leadId: string) => {
    setClienteSeleccionadoId(leadId);
    setEtapaClientes(null);
    setClaseClientes(null);
    setRespuestaClientes(null);
    setVista("clientes");
  };

  // Abre Clientes filtrado por etapa (al tocar un número del embudo).
  const irAClientes = (etapa?: LeadStage) => {
    setClienteSeleccionadoId(null);
    setClaseClientes(null);
    setRespuestaClientes(null);
    setEtapaClientes(etapa ?? null);
    setVista("clientes");
  };

  // --- Navegación desde las gráficas de Salud inmobiliaria -------------------
  // Cada gráfica aterriza en la lista real que la compone. Se limpia siempre
  // el resto de filtros para que el conteo de la barra y el de la lista
  // coincidan: si no coinciden, el asesor deja de confiar en el número.

  /** Toca un nivel de calificación (Hot / Warm / Cold / sin calificar). */
  const irAClientesPorNivel = (nivel: NivelCartera) => {
    setClienteSeleccionadoId(null);
    setEtapaClientes(null);
    setRespuestaClientes(null);
    setClaseClientes(nivel);
    setVista("clientes");
  };

  /** Toca una barra de velocidad de primer contacto. */
  const irAClientesPorRespuesta = (rango: RangoRespuesta) => {
    setClienteSeleccionadoId(null);
    setEtapaClientes(null);
    setClaseClientes(null);
    setRespuestaClientes(rango);
    setVista("clientes");
  };

  /** Toca una barra del termómetro de antigüedad de inventario. */
  const irAPropiedadesPorAntiguedad = (nivel: NivelAntiguedad) => {
    setAntiguedadPropiedades(nivel);
    setVista("propiedades");
  };

  /** Lista completa de propiedades, sin filtro de antigüedad heredado. */
  const irAPropiedades = () => {
    setAntiguedadPropiedades(null);
    setVista("propiedades");
  };

  /** Abre Salud inmobiliaria limpiando los filtros de la visita anterior. */
  const irASalud = () => {
    setClaseClientes(null);
    setRespuestaClientes(null);
    setAntiguedadPropiedades(null);
    setVista("salud");
  };

  const crearCliente = (nuevo: Lead) => {
    const conAlta = conHistorial(nuevo, "Nota", "Cliente dado de alta");
    setLeads((prev) => [...prev, conAlta]);
    upsertLead(conAlta);
  };

  // --- Agenda ---------------------------------------------------------------
  // Toda cita queda registrada también en la bitácora del prospecto. Sin eso,
  // la agenda sería un calendario aparte y el historial del cliente seguiría
  // incompleto — que es justo el problema que se quiere resolver.
  const guardarCita = (cita: CitaAgenda) => {
    const existe = citas.some((c) => c.id === cita.id);
    setCitas((prev) => reemplazarEnArreglo(prev, cita));
    upsertCita(cita);
    if (!existe && cita.leadId) {
      const cuando = new Date(cita.inicio).toLocaleString("es-MX", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });
      registrarInteraccion(cita.leadId, "Nota", `Cita agendada para el ${cuando}`);
    }
  };

  const cambiarEstadoCita = (citaId: string, estado: EstadoCitaAgenda) => {
    const cita = citas.find((c) => c.id === citaId);
    if (!cita) return;
    const actualizada = { ...cita, estado };
    setCitas((prev) => reemplazarEnArreglo(prev, actualizada));
    upsertCita(actualizada);
    if (cita.leadId && (estado === "Realizada" || estado === "No asistió")) {
      registrarInteraccion(
        cita.leadId,
        estado === "Realizada" ? "Visita" : "Nota",
        estado === "Realizada" ? "Visita realizada" : "El cliente no asistió a la cita",
      );
    }
  };

  const borrarCita = (citaId: string) => {
    setCitas((prev) => prev.filter((c) => c.id !== citaId));
    eliminarCita(citaId);
  };

  // Abre la calculadora de comisiones con una propiedad precargada.
  const irACalculadora = (propiedadId: string) => {
    setPropiedadSeleccionadaId(propiedadId);
    setOrigenCalculadora("detalle");
    setVista("comisiones");
  };

  const guardarNuevaPropiedad = (nueva: Propiedad) => {
    setPropiedades((prev) => [...prev, nueva]);
    upsertPropiedad(nueva);
    irADetalle(nueva.id);
  };

  const importarPropiedades = (nuevas: Propiedad[]) => {
    setPropiedades((prev) => [...prev, ...nuevas]);
    bulkUpsertPropiedades(nuevas);
  };

  const importarLeads = (nuevos: Lead[]) => {
    setLeads((prev) => [...prev, ...nuevos]);
    bulkUpsertLeads(nuevos);
  };

  const invitarAsesor = (nombre: string, correo: string) => {
    const nuevo: Usuario = {
      id: `user-${Date.now()}`,
      nombre,
      correo: correo.trim().toLowerCase(),
      telefono: "",
      rol: "asesor_equipo",
      puesto: "Asesor Inmobiliario",
      iniciales: ((nombre.trim().split(/\s+/)[0]?.[0] ?? "") + (nombre.trim().split(/\s+/)[1]?.[0] ?? "")).toUpperCase(),
      estadoCuenta: "Invitado",
      puedeVerOtrasPropiedades: permisoEquipoVerTodas,
    };
    setUsuarios((prev) => [...prev, nuevo]);
    upsertUsuario(nuevo);
  };

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

  // Aprobar/rechazar solicitudes de acceso (solo broker).
  const resolverSolicitud = (usuarioId: string, cambios: Partial<Usuario>) => {
    guardarPerfilPersonal(usuarioId, cambios);
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

  const salir = async () => {
    if (isCloudEnabled) {
      await cerrarSesion();
    } else {
      window.localStorage.removeItem(DEMO_KEY);
      setDemoUsuarioId(null);
    }
  };

  // Datos del portal según la cuenta (además del filtro duro de RLS).
  const correoYo = yo.correo.toLowerCase();
  const propiedadesDelPropietario = propiedades.filter(
    (p) => (p.propietario.correo ?? "").toLowerCase() === correoYo,
  );
  const leadsDelCliente = leads.filter((l) => (l.correo ?? "").toLowerCase() === correoYo);
  const leadCliente =
    leadsDelCliente.find((l) => l.cierre) ??
    [...leadsDelCliente].sort((a, b) => (b.creado ?? "").localeCompare(a.creado ?? ""))[0];

  const propiedadSeleccionada = propiedades.find((p) => p.id === propiedadSeleccionadaId);

  return (
    <AppShell
      items={navItems}
      vistaActiva={vista ?? ""}
      onNavegar={(id) => {
        setOrigenCalculadora(null);
        // Entrar por el menú siempre muestra la lista completa, sin filtros
        // heredados de la última vez.
        if (id === "clientes") {
          setClienteSeleccionadoId(null);
          setEtapaClientes(null);
          setClaseClientes(null);
          setRespuestaClientes(null);
        }
        if (id === "propiedades") setAntiguedadPropiedades(null);
        setVista(id as Vista);
      }}
      campana={
        <CampanaNotificaciones
          notificaciones={avisos}
          vistas={vistasNotif}
          onMarcarTodasLeidas={marcarTodasVistas}
          onAbrir={(n) => {
            marcarNotifVista(n.id);
            if (n.destino === "cliente") irACliente(n.refId);
            else irADetalle(n.refId);
          }}
        />
      }
      nombreUsuario={yo.nombre}
      iniciales={yo.iniciales || yo.nombre.slice(0, 2).toUpperCase()}
      etiquetaRol={ETIQUETAS_ROL[yo.rol]}
      modoNube={isCloudEnabled}
      avisoNube={avisoNube}
      onCerrarSesion={salir}
      accionesExtra={
        yo.rol === "broker" ? (
          <button
            onClick={() =>
              exportarSnapshotJSON({
                propiedades,
                leads,
                usuarios,
                citas,
                agencia,
                permisoEquipoVerTodas,
                notificaciones,
              })
            }
            title="Descargar un respaldo JSON de todos los datos"
            className="hidden items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700 md:flex"
          >
            <Download className="size-3" /> Respaldo
          </button>
        ) : null
      }
    >
      {/* Aviso de calificación obligatoria antes de avanzar en el embudo. */}
      {avisoBant && (
        <div className="fixed inset-x-0 bottom-20 z-50 mx-auto max-w-md px-4 md:bottom-6">
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-lg">
            <p className="flex-1 text-sm font-medium text-amber-900">{avisoBant}</p>
            <button
              onClick={() => setAvisoBant(null)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Agendar: disponible desde cualquier vista de un rol con agenda. */}
      {agendando && tieneAgenda(yo.rol) && (
        <AgendarVisitaModal
          usuario={yo}
          usuarios={usuarios}
          leads={leadsOperativos}
          propiedades={propiedades}
          citas={citas}
          citaExistente={agendando.cita ?? null}
          leadInicialId={agendando.leadId ?? null}
          fechaInicial={agendando.fecha ?? null}
          onGuardar={guardarCita}
          onCerrar={() => setAgendando(null)}
        />
      )}

      {cargandoNube ? (
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
          Cargando tu información…
        </div>
      ) : (
        <>
          {vista === "broker" && yo.rol === "broker" && (
            <BrokerDashboard
              broker={yo}
              usuarios={usuarios}
              propiedades={propiedades}
              leads={leadsOperativos}
              onVerAsesor={irAPerfil}
              onVerClientes={irAClientes}
            />
          )}
          {vista === "propiedades" && (
            <ListadoPropiedades
              usuario={yo}
              usuarios={usuarios}
              propiedades={propiedades}
              leads={leadsOperativos}
              solicitudes={solicitudes}
              onCambiarEstado={cambiarEstadoPropiedad}
              onSolicitarCambio={solicitarCambioEstado}
              onVerDetalle={irADetalle}
              onNuevaPropiedad={() => setVista("nueva")}
              antiguedadInicial={antiguedadPropiedades}
            />
          )}
          {vista === "nueva" && puedeCargarPropiedades(yo.rol) && (
            <NuevaPropiedad
              usuario={yo}
              propiedades={propiedades}
              onCancelar={irAPropiedades}
              onGuardar={guardarNuevaPropiedad}
            />
          )}
          {vista === "detalle" && propiedadSeleccionada && (
            <DetalleDePropiedad
              propiedad={propiedadSeleccionada}
              usuario={yo}
              usuarios={usuarios}
              leads={leadsOperativos}
              citas={citas}
              solicitudes={solicitudes}
              onVolver={irAPropiedades}
              onCambiarEstado={cambiarEstadoPropiedad}
              onSolicitarCambio={solicitarCambioEstado}
              onResolverSolicitud={resolverSolicitudCambio}
              onGuardarInformacion={guardarInformacionPropiedad}
              onAgregarEvento={(id, desc) => registrarEvento(id, "Nota", desc)}
              onAgregarComparable={agregarComparable}
              onResolverOferta={resolverOferta}
              onCalcularComision={
                yo.rol === "asesor_independiente" || yo.rol === "asesor_equipo"
                  ? irACalculadora
                  : undefined
              }
            />
          )}
          {vista === "asesores" && yo.rol === "broker" && (
            <Asesores
              usuarios={usuarios}
              propiedades={propiedades}
              leads={leadsOperativos}
              onInvitar={invitarAsesor}
              onDesactivar={desactivarAsesor}
              onReactivar={reactivarAsesor}
              onEditarPermisos={editarPermisosAsesor}
              onVerDesempeno={irAPerfil}
            />
          )}
          {vista === "solicitudes" && yo.rol === "broker" && (
            <SolicitudesAcceso usuarios={usuarios} onResolver={resolverSolicitud} />
          )}
          {vista === "perfil" && yo.rol === "broker" && asesorSeleccionadoId && (
            <PerfilDesempeno
              asesor={usuarios.find((u) => u.id === asesorSeleccionadoId)!}
              propiedades={propiedades}
              leads={leadsOperativos}
              onVolver={() => setVista("asesores")}
              onEditarPermisos={editarPermisosAsesor}
              onVerDetallePropiedad={irADetalle}
            />
          )}
          {vista === "asesor" && (
            <AsesorDashboard
              asesor={yo}
              leads={leadsOperativos}
              propiedades={propiedades}
              citas={citas}
              onVerPropiedades={irAPropiedades}
              onVerPropiedad={irADetalle}
              onVerClientes={irAClientes}
              onVerCliente={irACliente}
              onNuevaPropiedad={() => setVista("nueva")}
              onVerSalud={irASalud}
              onVerAgenda={() => setVista("agenda")}
            />
          )}
          {/* Salud inmobiliaria: exclusiva de asesores. No se edita nada, pero
              cada gráfica lleva a la lista de clientes o propiedades que la
              compone. */}
          {vista === "salud" &&
            (yo.rol === "asesor_independiente" || yo.rol === "asesor_equipo") && (
              <SaludInmobiliaria
                asesor={yo}
                leads={leadsOperativos}
                propiedades={propiedades}
                onVolver={() => setVista("asesor")}
                onVerClientesPorEtapa={irAClientes}
                onVerClientesPorRespuesta={irAClientesPorRespuesta}
                onVerClientesPorNivel={irAClientesPorNivel}
                onVerPropiedadesPorAntiguedad={irAPropiedadesPorAntiguedad}
              />
            )}
          {/* Clientes: asesores y broker. Propietarios y clientes nunca la ven. */}
          {vista === "clientes" &&
            (yo.rol === "broker" ||
              yo.rol === "asesor_independiente" ||
              yo.rol === "asesor_equipo") && (
              <Clientes
                usuario={yo}
                usuarios={usuarios}
                leads={leads}
                propiedades={propiedades}
                onGuardarCalificacion={guardarCalificacion}
                onRegistrarInteraccion={registrarInteraccion}
                onCambiarEtapa={moverLead}
                onCrearCliente={crearCliente}
                onAgendarVisita={(leadId) => setAgendando({ leadId })}
                clienteInicialId={clienteSeleccionadoId}
                etapaInicial={etapaClientes}
                claseInicial={claseClientes ? claseParaFiltro(claseClientes) : null}
                respuestaInicial={respuestaClientes}
              />
            )}
          {vista === "agenda" && tieneAgenda(yo.rol) && (
            <Agenda
              usuario={yo}
              usuarios={usuarios}
              citas={citas}
              leads={leadsOperativos}
              propiedades={propiedades}
              onNueva={(fecha) => setAgendando({ fecha: fecha ?? null })}
              onEditar={(cita) => setAgendando({ cita })}
              onCambiarEstado={cambiarEstadoCita}
              onEliminar={borrarCita}
              onVerCliente={irACliente}
              tokenAgenda={tokenAgenda}
              urlSupabase={import.meta.env.VITE_SUPABASE_URL ?? null}
              onRotarToken={() => rotarTokenAgenda().then(setTokenAgenda)}
            />
          )}
          {/* Calculadora de comisiones: exclusiva de asesores. */}
          {vista === "comisiones" &&
            (yo.rol === "asesor_independiente" || yo.rol === "asesor_equipo") && (
              <CalculadoraComisiones
                key={origenCalculadora === "detalle" ? propiedadSeleccionadaId ?? "libre" : "libre"}
                usuario={yo}
                propiedades={propiedades}
                propiedadInicialId={
                  origenCalculadora === "detalle" ? propiedadSeleccionadaId : null
                }
                onVolver={
                  origenCalculadora === "detalle"
                    ? () => {
                        setOrigenCalculadora(null);
                        setVista("detalle");
                      }
                    : undefined
                }
              />
            )}
          {vista === "mi-perfil" && <PerfilPersonal usuario={yo} onGuardar={guardarPerfilPersonal} />}
          {vista === "propietario" && yo.rol === "propietario" && (
            <PropietarioPortal
              propiedadesPropietario={propiedadesDelPropietario}
              usuarios={usuarios}
              leads={leadsOperativos}
            />
          )}
          {vista === "cliente" && yo.rol === "cliente" && (
            leadCliente ? (
              <ClientePortal
                lead={leadCliente}
                propiedad={propiedades.find((p) => p.id === leadCliente.interesPropiedadId)}
                onSubirDocumento={subirDocumentoCliente}
                onConfirmarCita={confirmarCitaCliente}
              />
            ) : (
              <main className="mx-auto max-w-xl px-4 py-16 text-center">
                <Home className="mx-auto size-8 text-slate-300" />
                <h1 className="mt-3 text-lg font-bold text-slate-900">Aún no hay un proceso activo</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Cuando tu asesor registre tu proceso de compra o renta con el correo{" "}
                  <span className="font-semibold text-slate-700">{yo.correo}</span>, aparecerá aquí
                  automáticamente.
                </p>
              </main>
            )
          )}
          {vista === "intake" && yo.rol === "broker" && (
            <IntakeValidacion
              propiedades={propiedades}
              usuarios={usuarios}
              onToggleDocumento={toggleDocumento}
              onActivar={activarPropiedad}
            />
          )}
          {vista === "reportes" && (yo.rol === "broker" || yo.rol === "asesor_independiente") && (
            <Reportes usuarios={usuarios} propiedades={propiedades} leads={leadsOperativos} />
          )}
          {vista === "importar" && (yo.rol === "broker" || yo.rol === "asesor_independiente") && (
            <ImportarDatos
              usuarios={usuarios}
              usuarioActivoId={yo.id}
              onImportarPropiedades={importarPropiedades}
              onImportarLeads={importarLeads}
            />
          )}
          {vista === "configuracion" && yo.rol === "broker" && (
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
    </AppShell>
  );
}
