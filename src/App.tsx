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
  FamiliaPerdida,
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
  INTENTOS_PARA_SUGERIR_DESCARTE,
  motivoPerdidaEtiqueta,
  puedeCargarPropiedades,
  tieneAgenda,
  totalBant,
  esLeadEnSeguimiento,
  esLeadOperativo,
} from "./types";
import { evaluarBant, puedeAvanzarAEtapa } from "./domain/leads/qualification";
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
import { configurationError, isCloudEnabled, isDemoMode } from "./lib/supabaseClient";
import {
  bulkUpsertLeads,
  bulkUpsertPropiedades,
  cargarSnapshotLocal,
  confirmarCitaClienteEnNube,
  crearSolicitudEstado,
  desactivarAsesorAtomico,
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
  upsertUsuarioConError,
  type EstadoCompleto,
  type MetricasPropietario,
  type OperationResult,
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
  if (configurationError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-rose-400/30 bg-slate-900 p-7">
          <p className="text-xs font-bold uppercase tracking-widest text-rose-300">Configuración requerida</p>
          <h1 className="mt-2 text-xl font-bold">La aplicación está bloqueada de forma segura</h1>
          <p role="alert" className="mt-3 text-sm text-slate-300">{configurationError}</p>
          <p className="mt-3 text-xs text-slate-400">
            Configura el backend y reinicia el despliegue. No se cargarán datos de demostración ni se permitirán operaciones.
          </p>
        </div>
      </div>
    );
  }
  return <AplicacionConfigurada />;
}

function AplicacionConfigurada() {
  const {
    sesion,
    perfil,
    cargando: cargandoAuth,
    cerrarSesion,
    enRecuperacion,
    cambiarContrasenaActual,
    cambiarCorreo,
  } = useAuth();

  // --- Estado de datos ---
  const snapshotLocal = isDemoMode ? cargarSnapshotLocal() : null;
  const inicial: EstadoCompleto = { ...snapshotDeFabrica, ...snapshotLocal };

  const [propiedades, setPropiedades] = useState<Propiedad[]>(inicial.propiedades);
  const [leads, setLeads] = useState<Lead[]>(inicial.leads);
  // El estado `leads` guarda TODO lo que hay en la tabla: embudo activo,
  // histórico y directorio importado de EasyBroker. Los tableros y KPIs
  // consumen `leadsOperativos`; solo la pantalla de Clientes ve la lista
  // completa (con su propio filtro). Ver esLeadOperativo en types.ts.
  const leadsOperativos = useMemo(() => leads.filter(esLeadOperativo), [leads]);
  // Lo que sigue en juego. Alimenta las pantallas de TRABAJO (tableros del día,
  // agenda, avisos): un lead descartado ahí es ruido que hace que el asesor
  // deje de confiar en su propia lista de pendientes. Las pantallas de
  // MEDICIÓN (Reportes, Salud inmobiliaria, desempeño) siguen con
  // leadsOperativos: un lead perdido sí ocurrió y debe contar en el
  // denominador, o la tasa de conversión se infla sola.
  const leadsEnSeguimiento = useMemo(() => leads.filter(esLeadEnSeguimiento), [leads]);
  const [usuarios, setUsuarios] = useState<Usuario[]>(inicial.usuarios);
  const [citas, setCitas] = useState<CitaAgenda[]>(inicial.citas ?? []);
  const [metricasPropietario, setMetricasPropietario] = useState<Record<string, MetricasPropietario>>(
    inicial.metricasPropietario ?? {},
  );
  const [errorMetricasPropietario, setErrorMetricasPropietario] = useState<string | null>(
    inicial.errorMetricasPropietario ?? null,
  );
  // Solicitudes de cambio de estado (pendientes + resueltas recientes).
  const [solicitudes, setSolicitudes] = useState<SolicitudEstado[]>([]);
  const [agencia, setAgencia] = useState<AgenciaInfo>(inicial.agencia);
  const [permisoEquipoVerTodas, setPermisoEquipoVerTodas] = useState(inicial.permisoEquipoVerTodas);
  const [notificaciones, setNotificaciones] = useState<Record<string, boolean>>(
    inicial.notificaciones,
  );

  // Modo demo local (sin Supabase): se elige un usuario de ejemplo para probar.
  const [demoUsuarioId, setDemoUsuarioId] = useState<string | null>(() =>
    isDemoMode ? window.localStorage.getItem(DEMO_KEY) : null,
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
          const siembra = await sembrarDatosDeEjemplo(snapshotDeFabrica);
          if (!siembra.ok) throw new Error(siembra.error.message);
          datos = await fetchInitialData();
        }
        if (!vivo || !datos) return;
        fetchSolicitudes().then((s) => vivo && setSolicitudes(s));
        setPropiedades(datos.propiedades);
        setLeads(datos.leads);
        setUsuarios(datos.usuarios);
        setCitas(datos.citas);
        setMetricasPropietario(datos.metricasPropietario ?? {});
        setErrorMetricasPropietario(datos.errorMetricasPropietario ?? null);
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

  // Realtime empuja los cambios en vivo, pero solo mientras la pestaña está
  // conectada: si la laptop se durmió o el celular se quedó sin señal, los
  // eventos de ese rato NO se reenvían al reconectar. Sin esto, el asesor
  // vuelve a una lista congelada que se ve perfectamente normal — que es la
  // peor forma de estar desactualizado. Al volver a la pestaña después de más
  // de dos minutos, se vuelve a leer todo.
  useEffect(() => {
    if (!isCloudEnabled || !sesionActiva) return;
    let ultimaLectura = Date.now();
    const alVolver = async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaLectura < 120_000) return;
      ultimaLectura = Date.now();
      try {
        const datos = await fetchInitialData();
        if (!datos) return;
        setPropiedades(datos.propiedades);
        setLeads(datos.leads);
        setUsuarios(datos.usuarios);
        setCitas(datos.citas);
        setMetricasPropietario(datos.metricasPropietario ?? {});
        setErrorMetricasPropietario(datos.errorMetricasPropietario ?? null);
        fetchSolicitudes().then(setSolicitudes);
      } catch (err) {
        console.warn("[Supabase] no se pudo refrescar al volver a la pestaña", err);
      }
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
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
        ? construirNotificaciones(usuarioActual, leadsEnSeguimiento, propiedades, solicitudes, usuarios)
        : [],
    [usuarioActual, leadsEnSeguimiento, propiedades, solicitudes, usuarios],
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
            etiqueta: "Equipo",
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
        <div className="flex min-h-screen items-center justify-center bg-white text-sm text-slate-500">
          Cargando…
        </div>
      );
    }
    if (!sesion || enRecuperacion) return <AuthScreen />;
    if (!perfil || perfil.estadoCuenta !== "Activo") return <PendienteAprobacion />;
  } else if (isDemoMode && !usuarioActual) {
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
  const confirmarPersistencia = async (
    operacion: () => Promise<OperationResult>,
    aplicar: () => void,
  ): Promise<boolean> => {
    if (!isCloudEnabled) {
      aplicar();
      return true;
    }
    const resultado = await operacion();
    if (!resultado.ok) {
      setAvisoNube(resultado.error.message);
      return false;
    }
    aplicar();
    setAvisoNube(null);
    return true;
  };

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

  const guardarLead = async (next: Lead[], leadId: string) => {
    const cambiado = next.find((l) => l.id === leadId);
    if (!cambiado) return false;
    return confirmarPersistencia(() => upsertLead(cambiado), () => setLeads(next));
  };

  const moverLead = async (leadId: string, etapa: LeadStage): Promise<boolean> => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return false;

    // Regla dura: no se avanza a Visitado, Negociación o Cierre sin calificación.
    // Está también en la base de datos; aquí se replica para explicar el porqué
    // en vez de mostrar un error técnico de Postgres.
    if (!puedeAvanzarAEtapa(lead.bant, etapa)) {
      setAvisoBant(
        `Antes de mover a ${lead.nombre} necesitas calificarlo. Ve a Clientes y responde las cuatro preguntas: toma menos de un minuto.`,
      );
      return false;
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
    return guardarLead(next, leadId);
  };

  // Guarda la calificación BANT y la deja registrada en el historial.
  // Se acepta parcial a propósito: media calificación guardada vale más que
  // cero, que es lo que había cuando el cuestionario exigía las cuatro
  // respuestas y el cliente colgaba a la segunda.
  const guardarCalificacion = (leadId: string, bant: CalificacionBANT): Promise<boolean> => {
    const evaluacion = evaluarBant(bant);
    const total = evaluacion.puntaje ?? totalBant(bant);
    const completo = evaluacion.calificado;
    const faltan = evaluacion.faltantes.length;
    const next = leads.map((l) =>
      l.id === leadId
        ? conHistorial(
            // Calificar es haber hablado con la persona: si estaba marcado como
            // "Sin respuesta", vuelve a estar en juego.
            { ...l, bant, estado: l.estado === "Sin respuesta" ? "Activo" : l.estado },
            "Calificacion",
            completo
              ? `Calificado en ${total}/100 puntos — nivel ${evaluacion.clasificacion}`
              : `Calificación parcial: ${total} pts con ${4 - faltan} de 4 respuestas`,
          )
        : l,
    );
    return guardarLead(next, leadId);
  };

  // --- Desenlace del lead ---------------------------------------------------
  // Un intento sin respuesta NO es un descarte: es información. Se cuenta, se
  // fecha, y a los 4 intentos la app SUGIERE cerrar (nunca cierra sola: un
  // lead que contesta al cuarto intento es un lead ganado que un automatismo
  // habría tirado a la basura).
  const registrarIntentoSinRespuesta = (leadId: string): Promise<boolean> => {
    const ahora = new Date().toISOString();
    const next = leads.map((l) => {
      if (l.id !== leadId) return l;
      const intentos = (l.intentosContacto ?? 0) + 1;
      return conHistorial(
        {
          ...l,
          intentosContacto: intentos,
          ultimoIntentoEn: ahora,
          estado: l.estado === "Descartado" || l.estado === "Ganado" ? l.estado : "Sin respuesta",
          // El intento cuenta como primer contacto: el asesor SÍ trabajó el
          // lead. Si no, el KPI de tiempo de respuesta castiga al asesor por
          // un teléfono que nadie levanta.
          primerContactoEn: l.primerContactoEn ?? ahora,
        },
        "Llamada",
        `Intento de contacto sin respuesta (${intentos}${
          intentos >= INTENTOS_PARA_SUGERIR_DESCARTE ? " — se sugiere cerrarlo" : ""
        })`,
      );
    });
    return guardarLead(next, leadId);
  };

  const descartarLead = (
    leadId: string,
    r: { familia: FamiliaPerdida; motivo: string; detalle?: string },
  ): Promise<boolean> => {
    const ahora = new Date().toISOString();
    const next = leads.map((l) =>
      l.id === leadId
        ? conHistorial(
            {
              ...l,
              estado: "Descartado" as const,
              familiaPerdida: r.familia,
              motivoPerdida: r.motivo,
              detallePerdida: r.detalle,
              cerradoEn: ahora,
              cerradoPor: usuarioActual?.nombre ?? "",
            },
            "Nota",
            `Cerrado: ${motivoPerdidaEtiqueta(r.motivo)}${r.detalle ? ` — ${r.detalle}` : ""}`,
          )
        : l,
    );
    return guardarLead(next, leadId);
  };

  const reactivarLead = (leadId: string): Promise<boolean> => {
    const next = leads.map((l) =>
      l.id === leadId
        ? conHistorial(
            {
              ...l,
              estado: "Activo" as const,
              familiaPerdida: undefined,
              motivoPerdida: undefined,
              detallePerdida: undefined,
              cerradoEn: undefined,
              cerradoPor: undefined,
              // Los intentos se ponen en cero: reactivar es empezar de nuevo,
              // y si arrastrara los 4 anteriores la app sugeriría cerrarlo otra
              // vez de inmediato.
              intentosContacto: 0,
            },
            "Nota",
            "Prospecto reactivado",
          )
        : l,
    );
    return guardarLead(next, leadId);
  };

  const registrarInteraccion = (
    leadId: string,
    tipo: TipoInteraccion,
    descripcion: string,
  ): Promise<boolean> => {
    const next = leads.map((l) => {
      if (l.id !== leadId) return l;
      // El primer contacto registrado alimenta el KPI de tiempo de respuesta.
      const base = l.primerContactoEn ? l : { ...l, primerContactoEn: new Date().toISOString() };
      return conHistorial(base, tipo, descripcion);
    });
    return guardarLead(next, leadId);
  };

  const toggleDocumento = async (propiedadId: string, documento: DocumentName) => {
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
    const cambiada = next.find((p) => p.id === propiedadId);
    if (cambiada) await confirmarPersistencia(() => upsertPropiedad(cambiada), () => setPropiedades(next));
  };

  // Aprobación de documentos completada: la propiedad sale al mercado.
  const activarPropiedad = (propiedadId: string) => {
    cambiarEstadoPropiedad(propiedadId, "Publicada", "Documentos validados por el broker");
  };

  const registrarEvento = async (
    propiedadId: string,
    tipo: "Estado" | "Documento" | "Nota" | "Publicacion",
    descripcion: string,
  ): Promise<boolean> => {
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
    const cambiada = next.find((p) => p.id === propiedadId);
    if (!cambiada) return false;
    return confirmarPersistencia(() => upsertPropiedad(cambiada), () => setPropiedades(next));
  };

  const cambiarEstadoPropiedad = async (
    propiedadId: string,
    nuevoEstado: PropertyStatus,
    motivo?: string,
  ): Promise<boolean> => {
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
    const cambiada = next.find((p) => p.id === propiedadId);
    if (!cambiada) return false;
    return confirmarPersistencia(() => upsertPropiedad(cambiada), () => setPropiedades(next));
  };

  // --- Flujo de solicitudes (asesor de equipo → broker) ---------------------
  // El asesor no escribe el estatus: crea una solicitud. En la nube, el broker
  // la aprueba y un trigger aplica el cambio; en modo local se simula igual.
  const solicitarCambioEstado = async (
    propiedadId: string,
    nuevoEstado: PropertyStatus,
    motivo?: string,
  ): Promise<boolean> => {
    const propiedad = propiedades.find((p) => p.id === propiedadId);
    if (!propiedad || !usuarioActual) return false;
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
        return false;
      }
    }
    setSolicitudes((prev) => reemplazarEnArreglo(prev, solicitud));
    // Queda en la cronología de la propiedad desde el momento de pedirlo.
    await registrarEvento(
      propiedadId,
      "Estado",
      `${usuarioActual.nombre} solicitó cambiar el estado a "${nuevoEstado}"${
        motivo ? ` — motivo: ${motivo}` : ""
      } (en revisión del broker)`,
    );
    return true;
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
      await cambiarEstadoPropiedad(
        solicitud.propiedadId,
        solicitud.estadoSolicitado,
        `solicitud aprobada por ${usuarioActual?.nombre ?? "el broker"}`,
      );
    } else {
      await registrarEvento(
        solicitud.propiedadId,
        "Estado",
        `Solicitud de cambio a "${solicitud.estadoSolicitado}" rechazada por ${
          usuarioActual?.nombre ?? "el broker"
        }`,
      );
    }
  };

  const guardarInformacionPropiedad = async (
    propiedadId: string,
    cambios: Partial<Propiedad>,
  ): Promise<boolean> => {
    const next = propiedades.map((p) => (p.id === propiedadId ? { ...p, ...cambios } : p));
    const cambiada = next.find((p) => p.id === propiedadId);
    if (!cambiada) return false;
    return confirmarPersistencia(() => upsertPropiedad(cambiada), () => setPropiedades(next));
  };

  const agregarComparable = async (
    propiedadId: string,
    comparable: Omit<Comparable, "id">,
  ): Promise<boolean> => {
    const next = propiedades.map((p) =>
      p.id === propiedadId
        ? { ...p, comparables: [...(p.comparables ?? []), { id: `cmp-${Date.now()}`, ...comparable }] }
        : p,
    );
    const cambiada = next.find((p) => p.id === propiedadId);
    if (!cambiada) return false;
    return confirmarPersistencia(() => upsertPropiedad(cambiada), () => setPropiedades(next));
  };

  const resolverOferta = async (
    leadId: string,
    resultado: "Aceptada" | "Rechazada",
  ): Promise<boolean> => {
    const next = leads.map((l) =>
      l.id === leadId
        ? {
            ...l,
            etapa: resultado === "Aceptada" ? ("Cierre" as LeadStage) : ("Visitado" as LeadStage),
            nota: resultado === "Aceptada" ? `${l.nota} — Oferta aceptada.` : `${l.nota} — Oferta rechazada.`,
          }
        : l,
    );
    return guardarLead(next, leadId);
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

  const crearCliente = async (nuevo: Lead): Promise<boolean> => {
    const conAlta = conHistorial(nuevo, "Nota", "Cliente dado de alta");
    return confirmarPersistencia(() => upsertLead(conAlta), () => setLeads((prev) => [...prev, conAlta]));
  };

  // --- Agenda ---------------------------------------------------------------
  // Toda cita queda registrada también en la bitácora del prospecto. Sin eso,
  // la agenda sería un calendario aparte y el historial del cliente seguiría
  // incompleto — que es justo el problema que se quiere resolver.
  const guardarCita = async (cita: CitaAgenda): Promise<boolean> => {
    const existe = citas.some((c) => c.id === cita.id);
    const guardada = await confirmarPersistencia(
      () => upsertCita(cita),
      () => setCitas((prev) => reemplazarEnArreglo(prev, cita)),
    );
    if (!guardada) return false;
    if (!existe && cita.leadId) {
      const cuando = new Date(cita.inicio).toLocaleString("es-MX", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });
      await registrarInteraccion(cita.leadId, "Nota", `Cita agendada para el ${cuando}`);
    }
    return true;
  };

  const cambiarEstadoCita = async (citaId: string, estado: EstadoCitaAgenda): Promise<boolean> => {
    const cita = citas.find((c) => c.id === citaId);
    if (!cita) return false;
    const actualizada = { ...cita, estado };
    const guardada = await confirmarPersistencia(
      () => upsertCita(actualizada),
      () => setCitas((prev) => reemplazarEnArreglo(prev, actualizada)),
    );
    if (!guardada) return false;
    if (cita.leadId && (estado === "Realizada" || estado === "No asistió")) {
      await registrarInteraccion(
        cita.leadId,
        estado === "Realizada" ? "Visita" : "Nota",
        estado === "Realizada" ? "Visita realizada" : "El cliente no asistió a la cita",
      );
    }
    return true;
  };

  const borrarCita = async (citaId: string): Promise<boolean> => {
    return confirmarPersistencia(
      () => eliminarCita(citaId),
      () => setCitas((prev) => prev.filter((c) => c.id !== citaId)),
    );
  };

  // Abre la calculadora de comisiones con una propiedad precargada.
  const irACalculadora = (propiedadId: string) => {
    setPropiedadSeleccionadaId(propiedadId);
    setOrigenCalculadora("detalle");
    setVista("comisiones");
  };

  const guardarNuevaPropiedad = async (nueva: Propiedad): Promise<boolean> => {
    const guardada = await confirmarPersistencia(
      () => upsertPropiedad(nueva),
      () => setPropiedades((prev) => [...prev, nueva]),
    );
    if (guardada) irADetalle(nueva.id);
    return guardada;
  };

  const importarPropiedades = async (nuevas: Propiedad[]): Promise<boolean> => {
    return confirmarPersistencia(
      () => bulkUpsertPropiedades(nuevas),
      () => setPropiedades((prev) => [...prev, ...nuevas]),
    );
  };

  const importarLeads = async (nuevos: Lead[]): Promise<boolean> => {
    return confirmarPersistencia(
      () => bulkUpsertLeads(nuevos),
      () => setLeads((prev) => [...prev, ...nuevos]),
    );
  };

  // Alta de una persona del equipo por parte del broker.
  //
  // Queda "Invitada": existe su ficha, su rol y su cartera, pero todavía no
  // tiene contraseña. Cuando cree su cuenta con ESE correo, el trigger
  // `manejar_nuevo_registro` la engancha a esta oficina y la pasa a "Activa".
  // Por eso el correo tiene que ser exactamente el que va a usar para entrar.
  //
  // Devuelve el mensaje de error, o null si salió bien. Lo que rechaza la base
  // (tope de brokers, oficina equivocada) llega hasta la pantalla; no se
  // guarda en el estado local algo que la base no aceptó.
  const altaDeUsuario = async (datos: {
    nombre: string;
    correo: string;
    telefono: string;
    rol: UserRole;
  }): Promise<string | null> => {
    const iniciales = (
      (datos.nombre.trim().split(/\s+/)[0]?.[0] ?? "") + (datos.nombre.trim().split(/\s+/)[1]?.[0] ?? "")
    ).toUpperCase();
    const nuevo: Usuario = {
      id: `user-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      nombre: datos.nombre.trim(),
      correo: datos.correo.trim().toLowerCase(),
      telefono: datos.telefono.trim(),
      rol: datos.rol,
      puesto:
        datos.rol === "broker"
          ? "Broker / Administrador"
          : datos.rol === "propietario"
            ? "Propietario"
            : datos.rol === "cliente"
              ? "Cliente"
              : "Asesor Inmobiliario",
      iniciales,
      estadoCuenta: "Invitado",
      puedeVerOtrasPropiedades: datos.rol === "asesor_equipo" ? permisoEquipoVerTodas : true,
      agenciaId: agencia.id,
    };
    const error = await upsertUsuarioConError(nuevo);
    if (error) return error;
    setUsuarios((prev) => [...prev, nuevo]);
    return null;
  };

  const invitarAsesor = async (nombre: string, correo: string): Promise<boolean> => {
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
    return confirmarPersistencia(() => upsertUsuario(nuevo), () => setUsuarios((prev) => [...prev, nuevo]));
  };

  const guardarAgencia = async (nueva: AgenciaInfo): Promise<boolean> => {
    return confirmarPersistencia(() => upsertAgencia(nueva), () => setAgencia(nueva));
  };
  const guardarPermisoEquipo = async (valor: boolean): Promise<boolean> => {
    return confirmarPersistencia(
      () => upsertConfiguracion(valor, notificaciones),
      () => setPermisoEquipoVerTodas(valor),
    );
  };
  const guardarNotificaciones = async (valor: Record<string, boolean>): Promise<boolean> => {
    return confirmarPersistencia(
      () => upsertConfiguracion(permisoEquipoVerTodas, valor),
      () => setNotificaciones(valor),
    );
  };

  const guardarPerfilPersonal = async (id: string, cambios: Partial<Usuario>) => {
    const next = usuarios.map((u) => (u.id === id ? { ...u, ...cambios } : u));
    const cambiado = next.find((u) => u.id === id);
    if (!cambiado) return false;
    return confirmarPersistencia(() => upsertUsuario(cambiado), () => setUsuarios(next));
  };

  // Aprobar/rechazar solicitudes de acceso (solo broker).
  const resolverSolicitud = (usuarioId: string, cambios: Partial<Usuario>) => {
    return guardarPerfilPersonal(usuarioId, cambios);
  };

  const desactivarAsesor = async (asesorId: string, reasignarAId: string): Promise<boolean> => {
    const usuariosNext = usuarios.map((u) =>
      u.id === asesorId ? { ...u, estadoCuenta: "Inactivo" as const } : u,
    );
    const propiedadesNext = propiedades.map((p) =>
      p.asesorId === asesorId ? { ...p, asesorId: reasignarAId } : p,
    );
    const leadsNext = leads.map((l) => (l.asesorId === asesorId ? { ...l, asesorId: reasignarAId } : l));
    const citasNext = citas.map((c) =>
      c.asesorId === asesorId && (c.estado === "Agendada" || c.estado === "Confirmada")
        ? { ...c, asesorId: reasignarAId }
        : c,
    );
    const usuarioCambiado = usuariosNext.find((u) => u.id === asesorId);
    if (!usuarioCambiado) return false;
    return confirmarPersistencia(
      () => desactivarAsesorAtomico(asesorId, reasignarAId),
      () => {
        setUsuarios(usuariosNext);
        setPropiedades(propiedadesNext);
        setLeads(leadsNext);
        setCitas(citasNext);
      },
    );
  };

  const reactivarAsesor = async (asesorId: string): Promise<boolean> => {
    const next = usuarios.map((u) => (u.id === asesorId ? { ...u, estadoCuenta: "Activo" as const } : u));
    const cambiado = next.find((u) => u.id === asesorId);
    if (!cambiado) return false;
    return confirmarPersistencia(() => upsertUsuario(cambiado), () => setUsuarios(next));
  };

  const editarPermisosAsesor = async (asesorId: string, puedeVerOtras: boolean): Promise<boolean> => {
    const next = usuarios.map((u) =>
      u.id === asesorId ? { ...u, puedeVerOtrasPropiedades: puedeVerOtras } : u,
    );
    const cambiado = next.find((u) => u.id === asesorId);
    if (!cambiado) return false;
    return confirmarPersistencia(() => upsertUsuario(cambiado), () => setUsuarios(next));
  };

  const irAPerfil = (asesorId: string) => {
    setAsesorSeleccionadoId(asesorId);
    setVista("perfil");
  };

  const confirmarCitaCliente = async (leadId: string, citaId: string): Promise<string | null> => {
    if (isCloudEnabled) {
      const error = await confirmarCitaClienteEnNube(leadId, citaId);
      if (error) return error;
    }
    setCitas((prev) =>
      prev.map((c) => c.id === citaId && c.leadId === leadId ? { ...c, estado: "Confirmada" } : c),
    );
    return null;
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
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-lg">
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
          leads={leadsEnSeguimiento}
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
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
          Cargando tu información…
        </div>
      ) : (
        <>
          {vista === "broker" && yo.rol === "broker" && (
            <BrokerDashboard
              broker={yo}
              usuarios={usuarios}
              propiedades={propiedades}
              leads={leadsEnSeguimiento}
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
            <SolicitudesAcceso
              usuarios={usuarios}
              agencia={agencia}
              onResolver={resolverSolicitud}
              onInvitar={altaDeUsuario}
            />
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
              leads={leadsEnSeguimiento}
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
                onRegistrarIntento={registrarIntentoSinRespuesta}
                onDescartarLead={descartarLead}
                onReactivarLead={reactivarLead}
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
              leads={leadsEnSeguimiento}
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
          {vista === "mi-perfil" && (
            <PerfilPersonal
              usuario={yo}
              onGuardar={guardarPerfilPersonal}
              onCambiarCorreo={async (nuevo) => {
                if (!isCloudEnabled)
                  return { error: "Función todavía no disponible en modo demostración." };
                return cambiarCorreo(nuevo);
              }}
              onCambiarContrasena={async (actual, nueva) => {
                if (!isCloudEnabled) return "Función todavía no disponible en modo demostración.";
                const resultado = await cambiarContrasenaActual(actual, nueva);
                return resultado.error ?? null;
              }}
            />
          )}
          {vista === "propietario" && yo.rol === "propietario" && (
            <PropietarioPortal
              propiedadesPropietario={propiedadesDelPropietario}
              usuarios={usuarios}
              leads={leadsOperativos}
              metricas={metricasPropietario}
              errorMetricas={errorMetricasPropietario}
            />
          )}
          {vista === "cliente" && yo.rol === "cliente" && (
            leadCliente ? (
              <ClientePortal
                lead={leadCliente}
                propiedad={propiedades.find((p) => p.id === leadCliente.interesPropiedadId)}
                citas={citas}
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
