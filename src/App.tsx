import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
// Los iconos del menú viven en `app/navigation/navigation.tsx`, junto a los
// elementos que los usan. Aquí sólo quedan los que usa el cuerpo de la app.
import { Download, Home } from "lucide-react";
import type {
  CitaAgenda,
  LeadStage,
} from "./types";
import {
  puedeCargarPropiedades,
  tieneAgenda,
} from "./types";
const Agenda = lazy(() => import("./views/Agenda"));
const SaludInmobiliaria = lazy(() => import("./views/SaludInmobiliaria"));
const AsesorDashboard = lazy(() => import("./views/AsesorDashboard"));
const Asesores = lazy(() => import("./views/Asesores"));
const CalculadoraComisiones = lazy(() => import("./views/CalculadoraComisiones"));
const Clientes = lazy(() => import("./views/Clientes"));
import AuthScreen from "./views/AuthScreen";
const BrokerDashboard = lazy(() => import("./views/BrokerDashboard"));
const Configuracion = lazy(() => import("./views/Configuracion"));
const DetalleDePropiedad = lazy(() => import("./views/DetalleDePropiedad"));
const ImportarDatos = lazy(() => import("./views/ImportarDatos"));
const IntakeValidacion = lazy(() => import("./views/IntakeValidacion"));
const ListadoPropiedades = lazy(() => import("./views/ListadoPropiedades"));
const NuevaPropiedad = lazy(() => import("./views/NuevaPropiedad"));
import PendienteAprobacion from "./views/PendienteAprobacion";
const PerfilDesempeno = lazy(() => import("./views/PerfilDesempeno"));
const PerfilPersonal = lazy(() => import("./views/PerfilPersonal"));
const ClientePortal = lazy(() => import("./views/ClientePortal"));
const PropietarioPortal = lazy(() => import("./views/PropietarioPortal"));
const PublicSharedDocument = lazy(() => import("./views/PublicSharedDocument"));
const MicrositioPublico = lazy(() => import("./views/MicrositioPublico"));
const PropiedadPublica = lazy(() => import("./views/PropiedadPublica"));
const Reportes = lazy(() => import("./views/Reportes"));
const SolicitudesAcceso = lazy(() => import("./views/SolicitudesAcceso"));
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
  exportarSnapshotJSON,
} from "./lib/dataStore";
import { useAppData } from "./app/application/useAppData";
import {
  confirmarCitaClienteEnNube, obtenerTokenAgenda, rotarTokenAgenda,
} from "./repositories/appointmentsRepository";
import { createPersistenceCoordinator } from "./app/application/persistence";
import { createLeadActions } from "./app/application/leadActions";
import { createPropertyActions } from "./app/application/propertyActions";
import { createAppointmentActions } from "./app/application/appointmentActions";
import { createTeamSettingsActions } from "./app/application/teamSettingsActions";
import { createDocumentActions } from "./app/application/documentActions";
import { createOperationActions } from "./app/application/operationActions";
import {
  INITIAL_VIEW as VISTA_INICIAL,
  ROLE_LABELS as ETIQUETAS_ROL,
  allowedViews,
  buildNavItems,
  type Vista,
} from "./app/navigation/navigation";

export default function App() {
  const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)\/?$/i);
  if (shareMatch) {
    return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">Abriendo documento…</div>}><PublicSharedDocument token={shareMatch[1].toLowerCase()} /></Suspense>;
  }
  // Micrositio público del asesor: sin sesión, por slug opaco (mismo patrón
  // que /share). Ver decision-perfil-asesor-micrositio.md.
  const micrositioMatch = window.location.pathname.match(/^\/m\/([^/]+)\/?$/i);
  if (micrositioMatch) {
    return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">Abriendo micrositio…</div>}><MicrositioPublico slug={micrositioMatch[1].toLowerCase()} /></Suspense>;
  }
  const propiedadPublicaMatch = window.location.pathname.match(/^\/inmueble\/([^/]+)\/?$/i);
  if (propiedadPublicaMatch) {
    return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-violet-50 text-sm text-violet-700">Abriendo propiedad…</div>}><PropiedadPublica slug={propiedadPublicaMatch[1].toLowerCase()} /></Suspense>;
  }
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

  const {
    propiedades, setPropiedades,
    leads, setLeads, leadsOperativos, leadsEnSeguimiento,
    usuarios, setUsuarios,
    citas, setCitas,
    operaciones, setOperaciones,
    solicitudes, setSolicitudes,
    agencia, setAgencia,
    permisoEquipoVerTodas, setPermisoEquipoVerTodas,
    notificaciones, setNotificaciones,
    metricasPropietario, errorMetricasPropietario,
    usuarioActual, clearDemoUser, selectDemoUser,
    cargandoNube, avisoNube,
  } = useAppData({ perfil, cloudSessionPresent: Boolean(sesion) });

  // --- Navegación ---
  const [vista, setVista] = useState<Vista | null>(null);
  const [propiedadSeleccionadaId, setPropiedadSeleccionadaId] = useState<string | null>(null);
  const [asesorSeleccionadoId, setAsesorSeleccionadoId] = useState<string | null>(null);
  // Desde dónde se abrió la calculadora, para saber a dónde regresar.
  const [origenCalculadora, setOrigenCalculadora] = useState<Vista | null>(null);
  // Aviso cuando alguien intenta avanzar un prospecto sin calificarlo.
  const [avisoBant, setAvisoBant] = useState<string | null>(null);
  // Fallas no fatales al guardar. Se mantienen separadas de `avisoNube`, que
  // representa que la carga inicial completa falló y sustituye la pantalla.
  const [avisoPersistencia, setAvisoPersistencia] = useState<string | null>(null);
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
  }, [usuarioActual]);

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
        ? construirNotificaciones(usuarioActual, leadsEnSeguimiento, propiedades, solicitudes, usuarios, operaciones)
        : [],
    [usuarioActual, leadsEnSeguimiento, propiedades, solicitudes, usuarios, operaciones],
  );

  useEffect(() => {
    setVistasNotif(usuarioActual ? leerVistas(usuarioActual.id) : new Set());
  }, [usuarioActual]);

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

  // El menú y las vistas permitidas viven en `app/navigation/navigation.tsx`.
  // Aquí había una segunda copia mantenida a mano; era la que se pintaba, y por
  // eso "Mi Micrositio" —agregado sólo en la otra— nunca apareció aunque estaba
  // construido y desplegado. No vuelvas a declarar `navItems` en este archivo.
  const navItems: NavItem[] = useMemo(
    () => buildNavItems(rol, solicitudesPendientes, citasHoy),
    [rol, solicitudesPendientes, citasHoy],
  );

  const vistasPermitidas = useMemo(() => allowedViews(navItems, rol), [navItems, rol]);

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
                    selectDemoUser(u.id);
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

  const confirmarPersistencia = createPersistenceCoordinator(isCloudEnabled, setAvisoPersistencia);
  const {
    moverLead, guardarCalificacion, registrarIntentoSinRespuesta, descartarLead,
    reactivarLead, registrarInteraccion, resolverOferta, crearCliente, importarLeads,
  } = createLeadActions({
    leads, setLeads, currentUser: yo, confirmPersistence: confirmarPersistencia,
    setBusinessNotice: setAvisoBant,
  });

  const {
    toggleDocumento, activarPropiedad, registrarEvento, cambiarEstadoPropiedad,
    solicitarCambioEstado, resolverSolicitudCambio, guardarInformacionPropiedad,
    agregarComparable, guardarNuevaPropiedad: persistirNuevaPropiedad, importarPropiedades,
  } = createPropertyActions({
    propiedades, setPropiedades, setSolicitudes, currentUser: yo, cloudEnabled: isCloudEnabled,
    confirmPersistence: confirmarPersistencia, setBusinessNotice: setAvisoBant,
  });
  const { reportarOperacion, resolverOperacion } = createOperationActions({
    operaciones,
    setOperaciones,
    setLeads,
    setPropiedades,
    currentUser: yo,
    cloudEnabled: isCloudEnabled,
    confirmPersistence: confirmarPersistencia,
  });
  const { generatePropertySheet } = createDocumentActions({ currentUserId: yo.id, publicOrigin: window.location.origin });
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

  const { guardarCita, cambiarEstadoCita, borrarCita } = createAppointmentActions({
    appointments: citas, setAppointments: setCitas, confirmPersistence: confirmarPersistencia,
    registerInteraction: registrarInteraccion,
  });
  const irACalculadora = (propiedadId: string) => {
    setPropiedadSeleccionadaId(propiedadId);
    setOrigenCalculadora("detalle");
    setVista("comisiones");
  };

  const guardarNuevaPropiedad = async (nueva: Parameters<typeof persistirNuevaPropiedad>[0]) => {
    const guardada = await persistirNuevaPropiedad(nueva);
    if (guardada) irADetalle(nueva.id);
    return guardada;
  };

  const {
    altaDeUsuario, invitarAsesor, guardarAgencia, subirLogoAgencia, guardarPermisoEquipo,
    guardarNotificaciones, guardarPerfilPersonal, subirFotoPerfil, resolverSolicitud,
    desactivarAsesor, reactivarAsesor, editarPermisosAsesor,
  } = createTeamSettingsActions({
    users: usuarios, setUsers: setUsuarios,
    properties: propiedades, setProperties: setPropiedades,
    leads, setLeads, appointments: citas, setAppointments: setCitas,
    agency: agencia, setAgency: setAgencia,
    teamCanSeeAll: permisoEquipoVerTodas, setTeamCanSeeAll: setPermisoEquipoVerTodas,
    notifications: notificaciones, setNotifications: setNotificaciones,
    confirmPersistence: confirmarPersistencia,
  });
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
      clearDemoUser();
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
                operaciones,
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

      {avisoPersistencia && (
        <div className="fixed inset-x-0 bottom-20 z-50 mx-auto max-w-md px-4 md:bottom-6">
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-lg">
            <p className="flex-1 text-sm font-medium text-rose-900">{avisoPersistencia}</p>
            <button
              onClick={() => setAvisoPersistencia(null)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"
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

      <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Cargando vista…</div>}>
      {cargandoNube ? (
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">
          Cargando tu información…
        </div>
      ) : isCloudEnabled && avisoNube ? (
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
          <h1 className="text-lg font-bold text-slate-900">No pudimos cargar tu información</h1>
          <p className="mt-2 text-sm text-slate-600">No mostraremos resultados vacíos ni datos de demostración mientras exista este error.</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {vista === "broker" && yo.rol === "broker" && (
            <BrokerDashboard
              broker={yo}
              usuarios={usuarios}
              propiedades={propiedades}
              leads={leadsOperativos}
              citas={citas}
              operaciones={operaciones}
              onVerAsesor={irAPerfil}
              onVerPropiedad={irADetalle}
              onVerCliente={irACliente}
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
              agencia={agencia}
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
              onGenerarFicha={generatePropertySheet}
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
                operaciones={operaciones}
                onGuardarCalificacion={guardarCalificacion}
                onRegistrarInteraccion={registrarInteraccion}
                onCambiarEtapa={moverLead}
                onCrearCliente={crearCliente}
                onAgendarVisita={(leadId) => setAgendando({ leadId })}
                onRegistrarIntento={registrarIntentoSinRespuesta}
                onDescartarLead={descartarLead}
                onReactivarLead={reactivarLead}
                onReportarOperacion={reportarOperacion}
                onResolverOperacion={resolverOperacion}
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
              agencia={agencia}
              onGuardar={guardarPerfilPersonal}
              onSubirFoto={subirFotoPerfil}
              onGuardarAgencia={guardarAgencia}
              onSubirLogoAgencia={subirLogoAgencia}
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
            <Reportes usuarios={usuarios} propiedades={propiedades} leads={leadsOperativos} operaciones={operaciones} />
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
      </Suspense>
    </AppShell>
  );
}
