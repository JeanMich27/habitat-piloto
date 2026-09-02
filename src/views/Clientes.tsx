import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  ContactRound,
  Filter,
  FolderArchive,
  Mail,
  MoreHorizontal,
  Phone,
  Sparkles,
  Target,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import type { ProgramarSeguimientoInput } from "../app/application/taskActions";
import BotonWhatsApp from "../components/BotonWhatsApp";
import CalificarProspectoModal from "../components/CalificarProspectoModal";
import DescartarLeadModal, { type ResultadoDescarte } from "../components/DescartarLeadModal";
import NuevoClienteModal from "../components/NuevoClienteModal";
import OperacionModal from "../components/OperacionModal";
import ProgramarSeguimientoModal from "../components/ProgramarSeguimientoModal";
import ReasignarClienteModal from "../components/ReasignarClienteModal";
import {
  construirBandejaClientes,
  textoMotivoAtencion,
  type BandejaCliente,
  type ClienteClasificado,
} from "../domain/clients/attention";
import { evaluarBant } from "../domain/leads/qualification";
import { etiquetaEtapa } from "../lib/metrics";
import {
  RANGOS_RESPUESTA,
  etiquetaRango,
  rangoDeLead,
  type RangoRespuesta,
} from "../lib/respuesta";
import type { ReportarOperacionInput, ResolverOperacionInput } from "../repositories/operationsRepository";
import type {
  CalificacionBANT,
  AsignacionLead,
  ClasificacionLead,
  Interaccion,
  Lead,
  LeadStage,
  Operacion,
  Propiedad,
  Tarea,
  TipoInteraccion,
  Usuario,
} from "../types";
import {
  ACCION_POR_CLASIFICACION,
  BANT_AUTORIDAD,
  BANT_NECESIDAD,
  BANT_PLAZO,
  catalogoPresupuesto,
  formatoMXN,
  motivoPerdidaEtiqueta,
  puntajeBant,
  sugiereDescarte,
} from "../types";
import { ClientsHeader } from "./clientes/ClientsHeader";
import { QualificationBadge } from "./clientes/QualificationBadge";

type VistaClientes = BandejaCliente | "resultados";
type TabDetalle = "resumen" | "actividad" | "intereses";
type FiltroRapido = "ninguno" | "vencidos" | "alta_prioridad" | "cierres_por_validar";

const TIPOS_INTERACCION: { valor: TipoInteraccion; etiqueta: string }[] = [
  { valor: "Nota", etiqueta: "Nota" },
  { valor: "Llamada", etiqueta: "Llamada" },
  { valor: "WhatsApp", etiqueta: "WhatsApp" },
  { valor: "Correo", etiqueta: "Correo" },
  { valor: "Visita", etiqueta: "Visita" },
];

const COLOR_CLASE: Record<ClasificacionLead, string> = {
  Hot: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Warm: "border-amber-200 bg-amber-50 text-amber-800",
  Cold: "border-sky-200 bg-sky-50 text-sky-800",
};

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
const fmtFechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const haceCuanto = (iso: string): string => {
  const ms = Date.now() - (Date.parse(iso) || Date.now());
  if (ms < 0) return "ahora";
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 60) return minutos <= 1 ? "hace un momento" : `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 31) return `hace ${dias} día${dias === 1 ? "" : "s"}`;
  return fmtFecha(iso);
};

const etiquetaDe = (catalogo: { valor: string; etiqueta: string }[], valor?: string) =>
  catalogo.find((opcion) => opcion.valor === valor)?.etiqueta ?? "—";

const noopBoolean = async () => false;

interface Props {
  usuario: Usuario;
  usuarios: Usuario[];
  leads: Lead[];
  propiedades: Propiedad[];
  tareas?: Tarea[];
  operaciones?: Operacion[];
  onGuardarCalificacion: (leadId: string, bant: CalificacionBANT) => Promise<boolean> | boolean | void;
  onRegistrarInteraccion: (leadId: string, tipo: TipoInteraccion, descripcion: string) => Promise<boolean> | boolean | void;
  onCambiarEtapa: (leadId: string, etapa: LeadStage) => Promise<boolean> | boolean | void;
  onCrearCliente: (lead: Lead) => Promise<boolean> | boolean | void;
  onAgendarVisita: (leadId: string) => void;
  onRegistrarIntento?: (leadId: string) => Promise<boolean>;
  onDescartarLead?: (leadId: string, resultado: ResultadoDescarte) => Promise<boolean>;
  onReactivarLead?: (leadId: string) => Promise<boolean>;
  onReportarOperacion?: (input: ReportarOperacionInput) => Promise<boolean>;
  onResolverOperacion?: (input: ResolverOperacionInput) => Promise<boolean>;
  onProgramarSeguimiento?: (input: ProgramarSeguimientoInput) => Promise<boolean>;
  onCompletarProximaTarea?: (leadId: string) => Promise<boolean>;
  onReasignarCliente?: (input: { leadId: string; nuevoAsesorId: string; motivo: string; version?: number }) => Promise<boolean>;
  onCargarHistorialAsignaciones?: (leadId: string) => Promise<AsignacionLead[]>;
  clienteInicialId?: string | null;
  etapaInicial?: LeadStage | null;
  claseInicial?: ClasificacionLead | "Sin calificar" | null;
  respuestaInicial?: RangoRespuesta | null;
}

export default function Clientes({
  usuario,
  usuarios,
  leads,
  propiedades,
  tareas = [],
  operaciones = [],
  onGuardarCalificacion,
  onRegistrarInteraccion,
  onCambiarEtapa,
  onCrearCliente,
  onAgendarVisita,
  onRegistrarIntento = noopBoolean,
  onDescartarLead = noopBoolean,
  onReactivarLead = noopBoolean,
  onReportarOperacion = noopBoolean,
  onResolverOperacion = noopBoolean,
  onProgramarSeguimiento = noopBoolean,
  onCompletarProximaTarea = noopBoolean,
  onReasignarCliente = noopBoolean,
  onCargarHistorialAsignaciones = async () => [],
  clienteInicialId,
  etapaInicial,
  claseInicial,
  respuestaInicial,
}: Props) {
  const bandeja = useMemo(
    () => construirBandejaClientes({ leads, tareas, operaciones, usuario }),
    [leads, tareas, operaciones, usuario],
  );
  const [vista, setVista] = useState<VistaClientes>("por_atender");
  const [busqueda, setBusqueda] = useState("");
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>("ninguno");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [filtroClase, setFiltroClase] = useState<"Todas" | ClasificacionLead | "Sin calificar">(claseInicial ?? "Todas");
  const [filtroEtapa, setFiltroEtapa] = useState<"Todas" | LeadStage>(etapaInicial ?? "Todas");
  const [filtroRespuesta, setFiltroRespuesta] = useState<"Todas" | RangoRespuesta>(respuestaInicial ?? "Todas");
  const [filtroAsesor, setFiltroAsesor] = useState("todos");
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(clienteInicialId ?? null);
  const [panelMovil, setPanelMovil] = useState<"lista" | "ficha">("lista");
  const [tab, setTab] = useState<TabDetalle>("resumen");
  const [tipoEvento, setTipoEvento] = useState<TipoInteraccion>("Nota");
  const [textoEvento, setTextoEvento] = useState("");
  const [creando, setCreando] = useState(false);
  const [calificando, setCalificando] = useState(false);
  const [programando, setProgramando] = useState(false);
  const [descartando, setDescartando] = useState<Lead | null>(null);
  const [modalOperacion, setModalOperacion] = useState<"reportar" | "validar" | null>(null);
  const [reasignando, setReasignando] = useState(false);

  const seleccionarVista = (siguiente: VistaClientes) => {
    setVista(siguiente);
    setFiltroRapido("ninguno");
    setSeleccionadoId(null);
    setPanelMovil("lista");
  };

  useEffect(() => {
    if (!clienteInicialId) return;
    setVista("resultados");
    setSeleccionadoId(clienteInicialId);
    setPanelMovil("ficha");
    setFiltroRapido("ninguno");
  }, [clienteInicialId]);

  useEffect(() => {
    if (!etapaInicial && !claseInicial && !respuestaInicial) return;
    setVista("resultados");
    setPanelMovil("lista");
    setFiltroEtapa(etapaInicial ?? "Todas");
    setFiltroClase(claseInicial ?? "Todas");
    setFiltroRespuesta(respuestaInicial ?? "Todas");
  }, [etapaInicial, claseInicial, respuestaInicial]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return bandeja.clientes.filter((item) => {
      const lead = item.lead;
      const coincideBusqueda = !q || lead.nombre.toLowerCase().includes(q) ||
        (lead.correo ?? "").toLowerCase().includes(q) || lead.telefono.includes(q);
      if (!coincideBusqueda) return false;
      if (!q && vista !== "resultados" && item.bandeja !== vista) return false;
      if (filtroRapido === "vencidos" && item.motivo !== "seguimiento_vencido") return false;
      if (filtroRapido === "alta_prioridad" && !item.altaPrioridad) return false;
      if (filtroRapido === "cierres_por_validar" && item.motivo !== "cierre_por_validar") return false;
      const clase = evaluarBant(lead.bant).clasificacion ?? "Sin calificar";
      if (filtroClase !== "Todas" && clase !== filtroClase) return false;
      if (filtroEtapa !== "Todas" && lead.etapa !== filtroEtapa) return false;
      if (filtroRespuesta !== "Todas" && rangoDeLead(lead) !== filtroRespuesta) return false;
      if (filtroAsesor !== "todos" && lead.asesorId !== filtroAsesor) return false;
      return true;
    });
  }, [bandeja.clientes, busqueda, vista, filtroRapido, filtroClase, filtroEtapa, filtroRespuesta, filtroAsesor]);

  // Una interacción puede mover al cliente de "Por atender" a "En seguimiento".
  // La ficha permanece abierta para confirmar lo que se guardó; cambiar de
  // sección explícitamente sí limpia la selección mediante `seleccionarVista`.
  const seleccionadoItem =
    (seleccionadoId ? bandeja.clientes.find((item) => item.lead.id === seleccionadoId) : null) ??
    filtrados[0] ??
    null;
  const seleccionado = seleccionadoItem?.lead ?? null;
  const propiedadInteres = propiedades.find((propiedad) => propiedad.id === seleccionado?.interesPropiedadId);
  const asesor = usuarios.find((item) => item.id === seleccionado?.asesorId);
  const operacionSeleccionada = seleccionadoItem?.operacion;
  const historial: Interaccion[] = [...(seleccionado?.historial ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const abrirCliente = (id: string) => {
    setSeleccionadoId(id);
    setPanelMovil("ficha");
    setTab("resumen");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const registrar = async () => {
    if (!seleccionado || !textoEvento.trim()) return;
    // El primer evento convierte un lead nuevo en contactado y puede moverlo
    // de bandeja; fijar la selección evita que la ficha salte al siguiente.
    setSeleccionadoId(seleccionado.id);
    const guardado = await onRegistrarInteraccion(seleccionado.id, tipoEvento, textoEvento.trim());
    if (guardado === false) return;
    if (tipoEvento !== "Nota") await onCompletarProximaTarea(seleccionado.id);
    setTextoEvento("");
  };

  const registrarWhatsApp = async () => {
    if (!seleccionado) return;
    const guardado = await onRegistrarInteraccion(seleccionado.id, "WhatsApp", "Se le escribió por WhatsApp");
    if (guardado !== false) await onCompletarProximaTarea(seleccionado.id);
  };

  const registrarSinRespuesta = async () => {
    if (!seleccionado || !(await onRegistrarIntento(seleccionado.id))) return;
    await onCompletarProximaTarea(seleccionado.id);
    setProgramando(true);
  };

  const limpiarFiltros = () => {
    setFiltroClase("Todas");
    setFiltroEtapa("Todas");
    setFiltroRespuesta("Todas");
    setFiltroAsesor("todos");
    setFiltroRapido("ninguno");
    setVista("por_atender");
  };

  const filtrosActivos = [
    filtroClase !== "Todas",
    filtroEtapa !== "Todas",
    filtroRespuesta !== "Todas",
    filtroAsesor !== "todos",
    filtroRapido !== "ninguno",
  ].filter(Boolean).length;

  const abrirFiltroRapido = (filtro: FiltroRapido) => {
    setVista(filtro === "alta_prioridad" ? "resultados" : "por_atender");
    setFiltroRapido(filtro);
    setPanelMovil("lista");
    setSeleccionadoId(null);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <div className={`${panelMovil === "ficha" ? "hidden" : "block"} space-y-5 lg:block`}>
        <ClientsHeader search={busqueda} onSearch={setBusqueda} onCreate={() => setCreando(true)} />

        <section aria-label="Trabajo de hoy" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <IndicadorHoy icon={<Users className="size-4" />} label="Por atender" value={bandeja.conteos.porAtender} tone="violet" onClick={() => seleccionarVista("por_atender")} />
        <IndicadorHoy icon={<AlertCircle className="size-4" />} label="Seguimientos vencidos" value={bandeja.conteos.vencidos} tone="rose" onClick={() => abrirFiltroRapido("vencidos")} vacio={bandeja.sinSeguimientosRegistrados} textoVacio="Aún sin seguimientos programados" />
        <IndicadorHoy icon={<Sparkles className="size-4" />} label="Alta prioridad" value={bandeja.conteos.altaPrioridad} tone="emerald" onClick={() => abrirFiltroRapido("alta_prioridad")} />
        {usuario.rol === "broker" ? (
          <IndicadorHoy icon={<CheckCircle2 className="size-4" />} label="Cierres por validar" value={bandeja.conteos.cierresPorValidar} tone="amber" onClick={() => abrirFiltroRapido("cierres_por_validar")} />
        ) : (
          <IndicadorHoy icon={<CalendarClock className="size-4" />} label="Seguimientos para hoy" value={bandeja.conteos.paraHoy} tone="amber" onClick={() => seleccionarVista("por_atender")} vacio={bandeja.sinSeguimientosRegistrados} textoVacio="Empieza a programar seguimientos" />
        )}
        </section>

        <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Estado de los clientes" className="grid grid-cols-3 rounded-2xl bg-slate-100 p-1 lg:flex">
          <BotonVista active={vista === "por_atender"} label="Por atender" count={bandeja.conteos.porAtender} onClick={() => seleccionarVista("por_atender")} />
          <BotonVista active={vista === "en_seguimiento"} label="En seguimiento" count={bandeja.conteos.enSeguimiento} onClick={() => seleccionarVista("en_seguimiento")} />
          <BotonVista active={vista === "cerrados"} label="Cerrados" count={bandeja.conteos.cerrados} onClick={() => seleccionarVista("cerrados")} />
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => seleccionarVista("contactos")} aria-pressed={vista === "contactos"} className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold ${vista === "contactos" ? "bg-violet-100 text-violet-800" : "text-slate-600 hover:bg-slate-100"}`}><ContactRound className="size-4" /> Contactos <span className="text-slate-400">{bandeja.conteos.contactos}</span></button>
          <button onClick={() => seleccionarVista("archivo")} aria-pressed={vista === "archivo"} className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold ${vista === "archivo" ? "bg-violet-100 text-violet-800" : "text-slate-600 hover:bg-slate-100"}`}><FolderArchive className="size-4" /> Archivo <span className="text-slate-400">{bandeja.conteos.archivo}</span></button>
          <button onClick={() => setFiltrosAbiertos((actual) => !actual)} aria-expanded={filtrosAbiertos} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Filter className="size-4" /> Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ""}</button>
        </div>
        </div>

        {filtrosAbiertos && (
        <section className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filtros de clientes">
          <select aria-label="Filtrar por calificación" value={filtroClase} onChange={(e) => setFiltroClase(e.target.value as typeof filtroClase)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs">
            <option value="Todas">Cualquier prioridad</option><option value="Hot">Hot · alta prioridad</option><option value="Warm">Warm</option><option value="Cold">Cold</option><option value="Sin calificar">Sin calificar</option>
          </select>
          <select aria-label="Filtrar por etapa" value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value as typeof filtroEtapa)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs">
            <option value="Todas">Cualquier etapa</option>{(["Nuevo", "Contactado", "Visitado", "Negociacion", "Cierre"] as LeadStage[]).map((etapa) => <option key={etapa} value={etapa}>{etiquetaEtapa(etapa)}</option>)}
          </select>
          <select aria-label="Filtrar por velocidad de primer contacto" value={filtroRespuesta} onChange={(e) => setFiltroRespuesta(e.target.value as typeof filtroRespuesta)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs">
            <option value="Todas">Cualquier respuesta</option>{RANGOS_RESPUESTA.map((rango) => <option key={rango.clave} value={rango.clave}>{rango.etiqueta}</option>)}
          </select>
          {usuario.rol === "broker" ? <select aria-label="Filtrar por asesor" value={filtroAsesor} onChange={(e) => setFiltroAsesor(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="todos">Todo el equipo</option>{usuarios.filter((item) => item.rol.includes("asesor")).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select> : <span />}
          <button onClick={limpiarFiltros} className="flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"><X className="size-3.5" /> Limpiar filtros</button>
        </section>
        )}

        {(busqueda || vista === "resultados" || filtroRapido !== "ninguno") && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold">{filtrados.length} resultado{filtrados.length === 1 ? "" : "s"}</span>
          {filtroRespuesta !== "Todas" && <button onClick={() => setFiltroRespuesta("Todas")} className="flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">Respuesta: {etiquetaRango(filtroRespuesta)} <X className="size-3" /></button>}
          <button onClick={limpiarFiltros} className="font-semibold text-violet-700 hover:underline">Volver a Por atender</button>
        </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <aside className={`${panelMovil === "ficha" ? "hidden" : "block"} lg:col-span-5 lg:block xl:col-span-4`}>
          <div className="space-y-2 lg:max-h-[72vh] lg:overflow-y-auto lg:pr-1">
            {filtrados.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><UserIcon className="mx-auto size-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No hay clientes aquí</p><p className="mt-1 text-xs text-slate-500">Prueba otra sección o limpia los filtros.</p></div>
            ) : filtrados.map((item) => (
              <TarjetaCliente key={item.lead.id} item={item} propiedad={propiedades.find((propiedad) => propiedad.id === item.lead.interesPropiedadId)} active={seleccionado?.id === item.lead.id} onClick={() => abrirCliente(item.lead.id)} />
            ))}
          </div>
        </aside>

        <main className={`${panelMovil === "lista" ? "hidden" : "block"} space-y-4 lg:col-span-7 lg:block xl:col-span-8`}>
          <button onClick={() => setPanelMovil("lista")} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 lg:hidden"><ArrowLeft className="size-4" /> Volver a la lista</button>
          {!seleccionado || !seleccionadoItem ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center"><UserIcon className="mx-auto size-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">Selecciona un cliente para ver qué sigue.</p></div>
          ) : (
            <>
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 text-sm font-bold text-white">{seleccionado.nombre.slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0"><h2 className="truncate text-xl font-bold text-slate-950">{seleccionado.nombre}</h2><p className="mt-0.5 text-xs text-slate-500">{asesor ? `Responsable: ${asesor.nombre}` : "Sin responsable"} · Captado por {usuarios.find((item) => item.id === (seleccionado.captadoPorId ?? seleccionado.asesorId))?.nombre ?? "sin registro"} · Registrado {fmtFecha(seleccionado.creado)}</p></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AccionPrincipal item={seleccionadoItem} lead={seleccionado} propiedad={propiedadInteres} usuario={usuario} onWhatsApp={registrarWhatsApp} onCalificar={() => setCalificando(true)} onActividad={() => setTab("actividad")} onProgramar={() => setProgramando(true)} onValidar={() => setModalOperacion("validar")} onCorregir={() => setModalOperacion("reportar")} />
                    <details className="relative"><summary aria-label="Más acciones" className="flex size-10 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><MoreHorizontal className="size-5" /></summary><div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 text-sm shadow-xl">
                      <button onClick={() => setProgramando(true)} className="w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50">Programar seguimiento</button>
                      <button onClick={() => onAgendarVisita(seleccionado.id)} className="w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50">Agendar visita</button>
                      {usuario.rol === "broker" && <button onClick={() => setReasignando(true)} className="w-full rounded-xl px-3 py-2 text-left hover:bg-violet-50">Reasignar responsable</button>}
                      {seleccionado.estado !== "Ganado" && seleccionado.estado !== "Descartado" && <><button onClick={registrarSinRespuesta} className="w-full rounded-xl px-3 py-2 text-left hover:bg-amber-50">Registrar que no contestó</button><button onClick={() => setModalOperacion("reportar")} className="w-full rounded-xl px-3 py-2 text-left hover:bg-emerald-50">Reportar operación</button><button onClick={() => setDescartando(seleccionado)} className="w-full rounded-xl px-3 py-2 text-left text-rose-700 hover:bg-rose-50">Descartar prospecto</button></>}
                      {seleccionado.estado === "Descartado" && <button onClick={() => onReactivarLead(seleccionado.id)} className="w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50">Reactivar prospecto</button>}
                    </div></details>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
                  <p className="flex items-center gap-2 text-slate-700"><Phone className="size-4 text-slate-400" /> {seleccionado.telefono || "Sin teléfono"}</p>
                  <p className="flex min-w-0 items-center gap-2 text-slate-700"><Mail className="size-4 shrink-0 text-slate-400" /><span className="truncate">{seleccionado.correo || "Sin correo"}</span></p>
                  <p className="flex items-center gap-2 text-slate-700"><Building2 className="size-4 text-slate-400" /><span className="truncate">{propiedadInteres?.titulo ?? "Sin propiedad asociada"}</span></p>
                </div>
              </section>

              <nav aria-label="Información del cliente" className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1">
                {(["resumen", "actividad", "intereses"] as TabDetalle[]).map((item) => <button key={item} onClick={() => setTab(item)} aria-pressed={tab === item} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold capitalize ${tab === item ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{item === "actividad" ? `Actividad (${historial.length})` : item}</button>)}
              </nav>

              {tab === "resumen" && <ResumenCliente item={seleccionadoItem} propiedad={propiedadInteres} onCambiarEtapa={onCambiarEtapa} onProgramar={() => setProgramando(true)} onCalificar={() => setCalificando(true)} />}
              {tab === "actividad" && <ActividadCliente historial={historial} tipo={tipoEvento} texto={textoEvento} onTipo={setTipoEvento} onTexto={setTextoEvento} onRegistrar={registrar} />}
              {tab === "intereses" && <InteresesCliente lead={seleccionado} propiedad={propiedadInteres} />}

              {operacionSeleccionada?.estadoValidacion === "reportada" && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Operación reportada.</strong> {usuario.rol === "broker" ? "Revísala para confirmar el cierre." : "Está esperando validación del broker."}</div>}
              {operacionSeleccionada?.estadoValidacion === "devuelta" && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><strong>El broker pidió una corrección.</strong> {operacionSeleccionada.observacionBroker}</div>}
            </>
          )}
        </main>
      </div>

      {creando && <NuevoClienteModal propiedades={propiedades} asesorId={usuario.id} onCancelar={() => setCreando(false)} onGuardar={async (nuevo) => { const ok = await onCrearCliente(nuevo); if (ok === false) return false; setCreando(false); abrirCliente(nuevo.id); return true; }} />}
      {calificando && seleccionado && <CalificarProspectoModal lead={seleccionado} propiedad={propiedadInteres} nombreAsesor={usuario.nombre} onCancelar={() => setCalificando(false)} onGuardar={async (bant) => { const ok = await onGuardarCalificacion(seleccionado.id, bant); if (ok !== false) setCalificando(false); }} onNoContesta={async () => { await registrarSinRespuesta(); setCalificando(false); }} onDescartar={() => { setCalificando(false); setDescartando(seleccionado); }} />}
      {programando && seleccionado && <ProgramarSeguimientoModal lead={seleccionado} tarea={seleccionadoItem?.proximaTarea} onCerrar={() => setProgramando(false)} onGuardar={onProgramarSeguimiento} />}
      {descartando && <DescartarLeadModal lead={descartando} onCancelar={() => setDescartando(null)} onDescartar={async (resultado) => { if (await onDescartarLead(descartando.id, resultado)) setDescartando(null); }} />}
      {modalOperacion === "reportar" && seleccionado && <OperacionModal modo="reportar" lead={seleccionado} propiedades={propiedades} operacion={operacionSeleccionada} onCerrar={() => setModalOperacion(null)} onEnviar={onReportarOperacion} />}
      {modalOperacion === "validar" && seleccionado && operacionSeleccionada && <OperacionModal modo="validar" lead={seleccionado} propiedades={propiedades} operacion={operacionSeleccionada} onCerrar={() => setModalOperacion(null)} onEnviar={onResolverOperacion} />}
      {reasignando && seleccionado && usuario.rol === "broker" && <ReasignarClienteModal lead={seleccionado} usuarios={usuarios} onCerrar={() => setReasignando(false)} onConfirmar={onReasignarCliente} onCargarHistorial={onCargarHistorialAsignaciones} />}
    </div>
  );
}

function IndicadorHoy({ icon, label, value, tone, onClick, vacio, textoVacio }: { icon: React.ReactNode; label: string; value: number; tone: "violet" | "rose" | "emerald" | "amber" | "slate"; onClick: () => void; vacio?: boolean; textoVacio?: string }) {
  const colors = { violet: "text-violet-700 bg-violet-50", rose: "text-rose-700 bg-rose-50", emerald: "text-emerald-700 bg-emerald-50", amber: "text-amber-700 bg-amber-50", slate: "text-slate-500 bg-slate-100" };
  const toneEfectivo = vacio ? "slate" : tone;
  // "0" en un indicador de urgencia se lee como "todo al día". Cuando nadie ha
  // usado "Programar seguimiento" todavía, ese 0 es en realidad "sin datos" —
  // se muestra distinto para no prometer una cartera sana que no se midió.
  return <button onClick={onClick} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-violet-300"><span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${colors[toneEfectivo]}`}>{icon}</span><span className="min-w-0"><strong className="block text-lg leading-none text-slate-950">{vacio ? "—" : value}</strong><span className="mt-1 block truncate text-[11px] font-medium text-slate-500 sm:text-xs">{vacio && textoVacio ? textoVacio : label}</span></span></button>;
}

function BotonVista({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return <button onClick={onClick} aria-pressed={active} className={`rounded-xl px-3 py-2 text-xs font-semibold sm:px-4 sm:text-sm ${active ? "bg-white text-violet-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{label} <span className="ml-1 opacity-60">{count}</span></button>;
}

function TarjetaCliente({ item, propiedad, active, onClick }: { item: ClienteClasificado; propiedad?: Propiedad; active: boolean; onClick: () => void }) {
  const urgency = item.motivo === "seguimiento_vencido" || item.motivo === "cierre_devuelto" ? "text-rose-700" : item.motivo === "cierre_por_validar" || item.motivo === "seguimiento_hoy" ? "text-amber-700" : "text-slate-600";
  return <button onClick={onClick} className={`w-full rounded-2xl border bg-white p-4 text-left transition ${active ? "border-violet-400 ring-2 ring-violet-100" : "border-slate-200 hover:border-violet-300"}`}><span className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-xs font-bold text-violet-700">{item.lead.nombre.slice(0, 2).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-950">{item.lead.nombre}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{propiedad?.titulo ?? item.lead.telefono ?? "Sin propiedad asociada"}</span></span></span>{item.altaPrioridad && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Alta prioridad</span>}</span><span className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${urgency}`}><Clock className="size-3.5" /> {textoMotivoAtencion(item)}</span><span className="mt-1.5 block text-[11px] text-slate-400">{item.proximaTarea ? fmtFechaHora(item.proximaTarea.venceEn) : `Registrado ${haceCuanto(item.lead.creado)}`}</span></button>;
}

function AccionPrincipal({ item, lead, propiedad, usuario, onWhatsApp, onCalificar, onActividad, onProgramar, onValidar, onCorregir }: { item: ClienteClasificado; lead: Lead; propiedad?: Propiedad; usuario: Usuario; onWhatsApp: () => void; onCalificar: () => void; onActividad: () => void; onProgramar: () => void; onValidar: () => void; onCorregir: () => void }) {
  if (item.motivo === "cierre_por_validar" && usuario.rol === "broker") return <button onClick={onValidar} className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600">Revisar cierre</button>;
  if (item.motivo === "cierre_devuelto") return <button onClick={onCorregir} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700">Corregir cierre</button>;
  if (lead.estado === "Ganado" || lead.estado === "Descartado" || item.bandeja === "archivo") return <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{textoMotivoAtencion(item)}</span>;
  if (!lead.primerContactoEn && item.bandeja !== "contactos") return <BotonWhatsApp lead={lead} propiedad={propiedad} nombreAsesor={usuario.nombre} onContactar={onWhatsApp} />;
  if (!evaluarBant(lead.bant).calificado && item.bandeja !== "contactos") return <button onClick={onCalificar} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">Calificar cliente</button>;
  if (item.motivo === "seguimiento_vencido" || item.motivo === "seguimiento_hoy") return <button onClick={onActividad} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700">Registrar seguimiento</button>;
  return <button onClick={onProgramar} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700">Programar seguimiento</button>;
}

function ResumenCliente({ item, propiedad, onCambiarEtapa, onProgramar, onCalificar }: { item: ClienteClasificado; propiedad?: Propiedad; onCambiarEtapa: Props["onCambiarEtapa"]; onProgramar: () => void; onCalificar: () => void }) {
  const lead = item.lead;
  const evaluacion = evaluarBant(lead.bant);
  const clase = evaluacion.clasificacion;
  const desglose = lead.bant ? puntajeBant(lead.bant) : null;
  return <div className="grid gap-4 xl:grid-cols-2">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-violet-600">Siguiente paso</p><h3 className="mt-2 text-lg font-bold text-slate-950">{textoMotivoAtencion(item)}</h3><p className="mt-1 text-sm text-slate-500">{item.proximaTarea ? `Programado para ${fmtFechaHora(item.proximaTarea.venceEn)}` : "Define una fecha para que este cliente no se pierda."}</p></div><CalendarClock className="size-6 text-violet-500" /></div><button onClick={onProgramar} className="mt-5 rounded-xl border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">{item.proximaTarea ? "Cambiar fecha" : "Programar seguimiento"}</button></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Etapa comercial</p><select value={lead.etapa} onChange={(e) => onCambiarEtapa(lead.id, e.target.value as LeadStage)} className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">{(["Nuevo", "Contactado", "Visitado", "Negociacion", "Cierre"] as LeadStage[]).map((etapa) => <option key={etapa} value={etapa}>{etiquetaEtapa(etapa)}</option>)}</select></div><QualificationBadge lead={lead} /></div>{lead.estado === "Descartado" && <p className="mt-3 text-xs text-rose-700">Descartado: {motivoPerdidaEtiqueta(lead.motivoPerdida)}</p>}</section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"><div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-950"><Target className="size-4 text-slate-400" /> Prioridad del cliente</h3>{!evaluacion.calificado && <button onClick={onCalificar} className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white">Calificar</button>}</div>{!evaluacion.calificado || !clase ? <p className="mt-3 text-sm text-slate-500">Aún no hay suficiente información. Son cuatro preguntas y toma menos de un minuto.</p> : <><div className={`mt-3 rounded-2xl border p-4 ${COLOR_CLASE[clase]}`}><div className="flex items-center justify-between gap-3"><div><strong className="text-2xl">{evaluacion.puntaje}/100</strong><p className="text-sm font-semibold">{clase === "Hot" ? "Alta prioridad" : ACCION_POR_CLASIFICACION[clase].titulo}</p></div><Sparkles className="size-6" /></div><p className="mt-2 text-sm">{ACCION_POR_CLASIFICACION[clase].accion}</p></div>{lead.bant && desglose && <details className="mt-3 rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Ver respuestas de la calificación</summary><div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><p><strong>Pago:</strong> {etiquetaDe(catalogoPresupuesto(lead.bant.perfil ?? "Comprador"), lead.bant.presupuesto)}</p><p><strong>Decisión:</strong> {etiquetaDe(BANT_AUTORIDAD, lead.bant.autoridad)}</p><p><strong>Necesidad:</strong> {etiquetaDe(BANT_NECESIDAD, lead.bant.necesidad)}</p><p><strong>Plazo:</strong> {etiquetaDe(BANT_PLAZO, lead.bant.plazo)}</p></div></details>}</>}</section>
    {propiedad && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Interés principal</p><p className="mt-2 font-bold text-slate-950">{propiedad.titulo}</p><p className="mt-1 text-sm text-slate-500">{propiedad.ubicacion} · {formatoMXN(propiedad.precio)}</p></section>}
    {sugiereDescarte(lead) && <p className="xl:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{lead.intentosContacto} intentos sin respuesta. Considera descartar el prospecto y registrar el motivo.</p>}
  </div>;
}

function ActividadCliente({ historial, tipo, texto, onTipo, onTexto, onRegistrar }: { historial: Interaccion[]; tipo: TipoInteraccion; texto: string; onTipo: (tipo: TipoInteraccion) => void; onTexto: (texto: string) => void; onRegistrar: () => void }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-950"><Clock className="size-4 text-slate-400" /> Actividad del cliente</h3><span className="text-xs text-slate-400">{historial.length} eventos</span></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><select value={tipo} onChange={(e) => onTipo(e.target.value as TipoInteraccion)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-36">{TIPOS_INTERACCION.map((item) => <option key={item.valor} value={item.valor}>{item.etiqueta}</option>)}</select><input value={texto} onChange={(e) => onTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onRegistrar()} placeholder="¿Qué pasó con este cliente?" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" /><button onClick={onRegistrar} disabled={!texto.trim()} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-200">Registrar</button></div>{historial.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Todavía no hay actividad registrada.</p> : <ol className="mt-5 space-y-4">{historial.map((evento) => <li key={evento.id} className="flex gap-3"><span className="mt-2 size-2 shrink-0 rounded-full bg-violet-400" /><div><p className="text-sm text-slate-800">{evento.descripcion}</p><p className="mt-1 text-[11px] text-slate-400">{evento.tipo} · {fmtFechaHora(evento.fecha)} · {evento.autor}</p></div></li>)}</ol>}</section>;
}

function InteresesCliente({ lead, propiedad }: { lead: Lead; propiedad?: Propiedad }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-950"><Building2 className="size-4 text-slate-400" /> Propiedad de interés</h3>{propiedad ? <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="font-bold text-slate-950">{propiedad.titulo}</p><p className="mt-1 text-sm text-slate-500">{propiedad.ubicacion}</p><p className="mt-3 text-lg font-bold text-violet-700">{formatoMXN(propiedad.precio)}</p></div> : <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{lead.ebPropertyId ? `La propiedad ${lead.ebPropertyId} ya no está en el catálogo, pero conservamos la referencia.` : "Este cliente todavía no tiene una propiedad asociada."}</p>}</section>;
}
