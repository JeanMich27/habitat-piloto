import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
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
  Comparable,
  DocumentName,
  Interaccion,
  Lead,
  LeadStage,
  PropertyStatus,
  Propiedad,
  TipoInteraccion,
  UserRole,
  Usuario,
} from "./types";
import {
  ETAPAS_QUE_EXIGEN_BANT,
  clasificarLead,
  puedeCargarPropiedades,
  totalBant,
} from "./types";
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
import {
  construirNotificaciones,
  guardarVistas,
  leerVistas,
  type Notificacion,
} from "./lib/notificaciones";
import { useAuth } from "./lib/authContext";
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
  | "clientes"
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
  const [usuarios, setUsuarios] = useState<Usuario[]>(inicial.usuarios);
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
        setPropiedades(datos.propiedades);
        setLeads(datos.leads);
        setUsuarios(datos.usuarios);
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
    });
  }, [sesionActiva]);

  // Modo local: autoguarda en el navegador.
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
  // Notificaciones ya vistas (por usuario, en este navegador).
  const [vistasNotif, setVistasNotif] = useState<Set<string>>(new Set());

  // Al entrar (o cambiar de cuenta), aterriza en la vista inicial de su rol.
  useEffect(() => {
    if (usuarioActual) setVista(VISTA_INICIAL[usuarioActual.rol]);
    else setVista(null);
  }, [usuarioActual?.id, usuarioActual?.rol]);

  const rol = usuarioActual?.rol;
  const solicitudesPendientes = usuarios.filter((u) => u.estadoCuenta === "Pendiente").length;

  // --- Avisos de la campana: se derivan de los datos, no de una tabla aparte.
  // (Ojo: `notificaciones` es otra cosa — son las preferencias de Configuración.)
  const avisos: Notificacion[] = useMemo(
    () => (usuarioActual ? construirNotificaciones(usuarioActual, leads, propiedades) : []),
    [usuarioActual, leads, propiedades],
  );

  useEffect(() => {
    setVistasNotif(usuarioActual ? leerVistas(usuarioActual.id) : new Set());
  }, [usuarioActual?.id]);

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

  // Menú según rol: nadie ve destinos ajenos.
  const navItems: NavItem[] = useMemo(() => {
    switch (rol) {
      case "broker":
        return [
          { id: "broker", etiqueta: "Dashboard", Icono: ShieldCheck },
          { id: "propiedades", etiqueta: "Propiedades", Icono: Building2 },
          { id: "clientes", etiqueta: "Clientes", Icono: Contact },
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
  }, [rol, solicitudesPendientes]);

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
    setVista("clientes");
  };

  // Abre Clientes filtrado por etapa (al tocar un número del embudo).
  const irAClientes = (etapa?: LeadStage) => {
    setClienteSeleccionadoId(null);
    setEtapaClientes(etapa ?? null);
    setVista("clientes");
  };

  const crearCliente = (nuevo: Lead) => {
    const conAlta = conHistorial(nuevo, "Nota", "Cliente dado de alta");
    setLeads((prev) => [...prev, conAlta]);
    upsertLead(conAlta);
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
        }
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
              leads={leads}
              onVerAsesor={irAPerfil}
            />
          )}
          {vista === "propiedades" && (
            <ListadoPropiedades
              usuario={yo}
              usuarios={usuarios}
              propiedades={propiedades}
              leads={leads}
              onCambiarEstado={cambiarEstadoPropiedad}
              onVerDetalle={irADetalle}
              onNuevaPropiedad={() => setVista("nueva")}
            />
          )}
          {vista === "nueva" && puedeCargarPropiedades(yo.rol) && (
            <NuevaPropiedad
              usuario={yo}
              propiedades={propiedades}
              onCancelar={() => setVista("propiedades")}
              onGuardar={guardarNuevaPropiedad}
            />
          )}
          {vista === "detalle" && propiedadSeleccionada && (
            <DetalleDePropiedad
              propiedad={propiedadSeleccionada}
              usuario={yo}
              usuarios={usuarios}
              leads={leads}
              onVolver={() => setVista("propiedades")}
              onCambiarEstado={cambiarEstadoPropiedad}
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
              leads={leads}
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
              leads={leads}
              onVolver={() => setVista("asesores")}
              onEditarPermisos={editarPermisosAsesor}
              onVerDetallePropiedad={irADetalle}
            />
          )}
          {vista === "asesor" && (
            <AsesorDashboard
              asesor={yo}
              leads={leads}
              propiedades={propiedades}
              onVerPropiedades={() => setVista("propiedades")}
              onVerPropiedad={irADetalle}
              onVerClientes={irAClientes}
              onVerCliente={irACliente}
              onNuevaPropiedad={() => setVista("nueva")}
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
                clienteInicialId={clienteSeleccionadoId}
                etapaInicial={etapaClientes}
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
              leads={leads}
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
              onEnviarValidacion={enviarAValidacion}
              onToggleDocumento={toggleDocumento}
              onActivar={activarPropiedad}
            />
          )}
          {vista === "reportes" && (yo.rol === "broker" || yo.rol === "asesor_independiente") && (
            <Reportes usuarios={usuarios} propiedades={propiedades} leads={leads} />
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
