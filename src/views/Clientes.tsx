// Vista de Clientes — visible solo para asesores y broker.
//
// Es la misma persona que vive en el pipeline (Lead), pero vista como ficha:
// quién es, qué tan calificado está y todo lo que ha pasado con él.
//
// Regla de la interfaz: todo lo que el asesor captura se muestra resumido.
// Nada de volver a leer el cuestionario completo para entender al cliente —
// la ficha responde en tres segundos: ¿qué tan bueno es y qué sigue?
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Clock,
  Mail,
  Phone,
  Plus,
  Search,
  Sparkles,
  Target,
  User as UserIcon,
} from "lucide-react";
import BotonWhatsApp from "../components/BotonWhatsApp";
import CalificarProspectoModal from "../components/CalificarProspectoModal";
import NuevoClienteModal from "../components/NuevoClienteModal";
import { etiquetaEtapa } from "../lib/metrics";
import type {
  CalificacionBANT,
  ClasificacionLead,
  Interaccion,
  Lead,
  LeadStage,
  Propiedad,
  TipoInteraccion,
  Usuario,
} from "../types";
import {
  ACCION_POR_CLASIFICACION,
  BANT_AUTORIDAD,
  BANT_NECESIDAD,
  BANT_PLAZO,
  catalogoPresupuesto,
  clasificarLead,
  formatoMXN,
  puntajeBant,
  totalBant,
} from "../types";

const COLOR: Record<ClasificacionLead, string> = {
  Hot: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Warm: "border-amber-200 bg-amber-50 text-amber-700",
  Cold: "border-slate-200 bg-slate-100 text-slate-600",
};

const TIPOS_INTERACCION: { valor: TipoInteraccion; etiqueta: string }[] = [
  { valor: "Nota", etiqueta: "Nota" },
  { valor: "Llamada", etiqueta: "Llamada" },
  { valor: "WhatsApp", etiqueta: "WhatsApp" },
  { valor: "Correo", etiqueta: "Correo" },
  { valor: "Visita", etiqueta: "Visita" },
];

const fmtFechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

const etiquetaDe = (catalogo: { valor: string; etiqueta: string }[], valor?: string) =>
  catalogo.find((o) => o.valor === valor)?.etiqueta ?? "—";

/** Insignia de calificación reutilizada en la lista y en la ficha. */
function Insignia({ lead }: { lead: Lead }) {
  if (!lead.bant) {
    return (
      <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
        Sin calificar
      </span>
    );
  }
  const total = totalBant(lead.bant);
  const clase = clasificarLead(total);
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${COLOR[clase]}`}>
      {clase} · {total} pts
    </span>
  );
}

interface Props {
  usuario: Usuario;
  usuarios: Usuario[];
  leads: Lead[];
  propiedades: Propiedad[];
  onGuardarCalificacion: (leadId: string, bant: CalificacionBANT) => void;
  onRegistrarInteraccion: (
    leadId: string,
    tipo: TipoInteraccion,
    descripcion: string,
  ) => void;
  onCambiarEtapa: (leadId: string, etapa: LeadStage) => void;
  onCrearCliente: (lead: Lead) => void;
  /** Cliente que se debe abrir al entrar (desde el dashboard o una notificación). */
  clienteInicialId?: string | null;
  /** Filtro de etapa precargado (al tocar un número del embudo). */
  etapaInicial?: LeadStage | null;
}

export default function Clientes({
  usuario,
  usuarios,
  leads,
  propiedades,
  onGuardarCalificacion,
  onRegistrarInteraccion,
  onCambiarEtapa,
  onCrearCliente,
  clienteInicialId,
  etapaInicial,
}: Props) {
  // El asesor de equipo ve su cartera; el broker y el independiente, todo su alcance.
  const visibles = useMemo(() => {
    const todos =
      usuario.rol === "broker" ||
      usuario.rol === "asesor_independiente" ||
      usuario.puedeVerOtrasPropiedades;
    return todos ? leads : leads.filter((l) => l.asesorId === usuario.id);
  }, [leads, usuario]);

  const [busqueda, setBusqueda] = useState("");
  const [filtroClase, setFiltroClase] = useState<"Todas" | ClasificacionLead | "Sin calificar">(
    "Todas",
  );
  const [filtroEtapa, setFiltroEtapa] = useState<"Todas" | LeadStage>(etapaInicial ?? "Todas");
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(clienteInicialId ?? null);
  const [calificando, setCalificando] = useState(false);
  const [creando, setCreando] = useState(false);
  // En pantalla chica no caben lista y ficha a la vez: se muestra una u otra.
  // En pantalla grande esta variable no hace nada (ambas conviven).
  const [panelMovil, setPanelMovil] = useState<"lista" | "ficha">("lista");

  // Abrir un cliente: en móvil cambia de panel y sube el scroll, para que el
  // toque tenga una respuesta visible en lugar de "no pasó nada".
  const abrirCliente = (id: string) => {
    setSeleccionadoId(id);
    setPanelMovil("ficha");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const [tipoEvento, setTipoEvento] = useState<TipoInteraccion>("Nota");
  const [textoEvento, setTextoEvento] = useState("");

  // Si llegan desde el dashboard o una notificación pidiendo un cliente
  // concreto, se abre ese y se limpian los filtros que podrían esconderlo.
  useEffect(() => {
    if (!clienteInicialId) return;
    setSeleccionadoId(clienteInicialId);
    setPanelMovil("ficha");
    setBusqueda("");
    setFiltroClase("Todas");
    setFiltroEtapa("Todas");
  }, [clienteInicialId]);

  useEffect(() => {
    if (etapaInicial) {
      setFiltroEtapa(etapaInicial);
      setPanelMovil("lista");
    }
  }, [etapaInicial]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return visibles
      .filter((l) => {
        const coincide =
          q === "" ||
          l.nombre.toLowerCase().includes(q) ||
          (l.correo ?? "").toLowerCase().includes(q) ||
          l.telefono.includes(q);
        const clase = l.bant ? clasificarLead(totalBant(l.bant)) : "Sin calificar";
        const coincideClase = filtroClase === "Todas" || clase === filtroClase;
        const coincideEtapa = filtroEtapa === "Todas" || l.etapa === filtroEtapa;
        return coincide && coincideClase && coincideEtapa;
      })
      .sort((a, b) => {
        // Los calificados alto primero: la cartera se lee por prioridad de cierre.
        const pa = a.bant ? totalBant(a.bant) : -1;
        const pb = b.bant ? totalBant(b.bant) : -1;
        return pb - pa;
      });
  }, [visibles, busqueda, filtroClase, filtroEtapa]);

  const seleccionado = filtrados.find((l) => l.id === seleccionadoId) ?? filtrados[0] ?? null;
  const propiedadInteres = propiedades.find((p) => p.id === seleccionado?.interesPropiedadId);
  const asesor = usuarios.find((u) => u.id === seleccionado?.asesorId);

  const sinCalificar = visibles.filter((l) => !l.bant).length;
  const calientes = visibles.filter(
    (l) => l.bant && clasificarLead(totalBant(l.bant)) === "Hot",
  ).length;

  const registrar = () => {
    if (!seleccionado || !textoEvento.trim()) return;
    onRegistrarInteraccion(seleccionado.id, tipoEvento, textoEvento.trim());
    setTextoEvento("");
  };

  // Historial ordenado del más reciente al más viejo.
  const historial: Interaccion[] = [...(seleccionado?.historial ?? [])].sort((a, b) =>
    b.fecha.localeCompare(a.fecha),
  );

  const bant = seleccionado?.bant;
  const total = bant ? totalBant(bant) : 0;
  const clase = bant ? clasificarLead(total) : null;
  const desglose = bant ? puntajeBant(bant) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Clientes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tu cartera ordenada por qué tan cerca está cada persona de comprar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
            {calientes} listos para cerrar
          </span>
          {sinCalificar > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
              {sinCalificar} sin calificar
            </span>
          )}
          <button
            onClick={() => setCreando(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="size-3.5" /> Agregar cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* ============ Lista ============ */}
        <div
          className={`space-y-3 lg:col-span-5 lg:block xl:col-span-4 ${
            panelMovil === "ficha" ? "hidden" : ""
          }`}
        >
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-slate-500">
              <Search className="size-4 shrink-0 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, correo o teléfono"
                className="w-full py-2 text-sm text-slate-900 outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={filtroClase}
                onChange={(e) => setFiltroClase(e.target.value as typeof filtroClase)}
                className="rounded-lg border border-slate-300 px-2 py-2 text-xs text-slate-700 outline-none focus:border-slate-500"
              >
                <option value="Todas">Todas las calificaciones</option>
                <option value="Hot">Hot — listos para cerrar</option>
                <option value="Warm">Warm — en seguimiento</option>
                <option value="Cold">Cold — aún no listos</option>
                <option value="Sin calificar">Sin calificar</option>
              </select>
              <select
                value={filtroEtapa}
                onChange={(e) => setFiltroEtapa(e.target.value as typeof filtroEtapa)}
                className="rounded-lg border border-slate-300 px-2 py-2 text-xs text-slate-700 outline-none focus:border-slate-500"
              >
                <option value="Todas">Todas las etapas</option>
                {(["Nuevo", "Contactado", "Visitado", "Negociacion", "Cierre"] as LeadStage[]).map(
                  (e) => (
                    <option key={e} value={e}>
                      {etiquetaEtapa(e)}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
            {filtrados.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                No hay clientes que coincidan con lo que buscas.
              </p>
            )}

            {filtrados.map((l) => {
              const prop = propiedades.find((p) => p.id === l.interesPropiedadId);
              const activo = seleccionado?.id === l.id;
              const ultimo = [...(l.historial ?? [])].sort((a, b) =>
                b.fecha.localeCompare(a.fecha),
              )[0];
              return (
                <div
                  key={l.id}
                  className={`rounded-xl border bg-white transition ${
                    activo
                      ? "border-slate-900 ring-1 ring-slate-900"
                      : "border-slate-200 hover:border-slate-400"
                  }`}
                >
                  <button
                    onClick={() => abrirCliente(l.id)}
                    className="w-full p-4 pb-2 text-left"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                          {l.nombre.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-900">
                            {l.nombre}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {l.ocupacion || l.telefono || "Sin datos de contacto"}
                          </span>
                        </span>
                      </span>
                      <Insignia lead={l} />
                    </span>

                    <span className="mt-3 block space-y-1 border-t border-slate-100 pt-3 text-xs">
                      <span className="flex items-center justify-between gap-2 text-slate-500">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Building2 className="size-3.5 shrink-0" />
                          <span className="truncate">
                            {prop?.titulo ?? "Sin propiedad de interés"}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                          {etiquetaEtapa(l.etapa)}
                        </span>
                      </span>
                      <span className="flex items-start gap-1.5 text-slate-400">
                        <Clock className="mt-0.5 size-3.5 shrink-0" />
                        <span className="line-clamp-1">
                          {ultimo
                            ? `${ultimo.tipo}: ${ultimo.descripcion}`
                            : l.nota || "Sin actividad registrada"}
                        </span>
                      </span>
                    </span>
                  </button>

                  {/* Contactar sin entrar a la ficha: un toque desde la lista. */}
                  <div className="flex justify-end px-4 pb-3">
                    <BotonWhatsApp
                      lead={l}
                      propiedad={prop}
                      nombreAsesor={usuario.nombre}
                      compacto
                      onContactar={() =>
                        onRegistrarInteraccion(l.id, "WhatsApp", "Se le escribió por WhatsApp")
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============ Ficha ============ */}
        <div
          className={`space-y-4 lg:col-span-7 lg:block xl:col-span-8 ${
            panelMovil === "lista" ? "hidden" : ""
          }`}
        >
          {/* Regreso a la lista: solo existe en móvil, donde hubo un cambio de panel. */}
          <button
            onClick={() => setPanelMovil("lista")}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 lg:hidden"
          >
            <ArrowLeft className="size-4" /> Volver a la lista
          </button>

          {!seleccionado ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-12 text-center">
              <UserIcon className="mx-auto size-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-400">
                Selecciona un cliente para ver su ficha completa.
              </p>
            </div>
          ) : (
            <>
              {/* --- Identidad --- */}
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                      {seleccionado.nombre.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-slate-900">
                        {seleccionado.nombre}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {seleccionado.ocupacion || "Cliente particular"} ·{" "}
                        {bant?.perfil === "Inquilino" ? "Busca rentar" : null}
                        {bant?.perfil === "Comprador" ? "Busca comprar" : null}
                        {bant?.perfil ? " · " : ""}
                        Registrado el {fmtFecha(seleccionado.creado)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <BotonWhatsApp
                      lead={seleccionado}
                      propiedad={propiedadInteres}
                      nombreAsesor={usuario.nombre}
                      onContactar={() =>
                        onRegistrarInteraccion(
                          seleccionado.id,
                          "WhatsApp",
                          "Se le escribió por WhatsApp",
                        )
                      }
                    />
                    <button
                      onClick={() => setCalificando(true)}
                      className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                        bant
                          ? "border border-slate-300 text-slate-700 hover:bg-slate-50"
                          : "bg-slate-900 text-white hover:bg-slate-800"
                      }`}
                    >
                      {bant ? "Volver a calificar" : "Calificar prospecto"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Teléfono
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-slate-800">
                      <Phone className="size-3.5 text-slate-400" />
                      {seleccionado.telefono || "Sin teléfono"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Correo
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate font-semibold text-slate-800">
                      <Mail className="size-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{seleccionado.correo || "Sin correo"}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Etapa
                    </p>
                    <select
                      value={seleccionado.etapa}
                      onChange={(e) => onCambiarEtapa(seleccionado.id, e.target.value as LeadStage)}
                      className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-800 outline-none focus:border-slate-500"
                    >
                      {(["Nuevo", "Contactado", "Visitado", "Negociacion", "Cierre"] as LeadStage[]).map(
                        (e) => (
                          <option key={e} value={e}>
                            {etiquetaEtapa(e)}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                </div>

                {(propiedadInteres || asesor) && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    {propiedadInteres && (
                      <span className="flex items-center gap-1.5">
                        <Building2 className="size-3.5" /> Interesado en{" "}
                        <span className="font-semibold text-slate-700">
                          {propiedadInteres.titulo}
                        </span>{" "}
                        ({formatoMXN(propiedadInteres.precio)})
                      </span>
                    )}
                    {asesor && <span>Atiende: {asesor.nombre}</span>}
                  </div>
                )}
              </section>

              {/* --- Calificación --- */}
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Target className="size-4 text-slate-400" /> Qué tan listo está para comprar
                </h3>

                {!bant || !desglose || !clase ? (
                  <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center">
                    <Sparkles className="mx-auto size-6 text-amber-500" />
                    <p className="mt-2 text-sm font-bold text-slate-900">Todavía sin calificar</p>
                    <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                      Son cuatro preguntas: cómo va a pagar, quién decide, qué tan claro tiene lo
                      que busca y para cuándo lo necesita. Toma menos de un minuto y el sistema
                      calcula el resultado solo.
                    </p>
                    <button
                      onClick={() => setCalificando(true)}
                      className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Calificar ahora
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className={`rounded-xl border p-4 ${COLOR[clase]}`}>
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                            Calificación
                          </p>
                          <p className="text-3xl font-black">{total}/100</p>
                        </div>
                        <span className="rounded-full bg-white/70 px-3 py-1 text-sm font-bold">
                          {clase} · {ACCION_POR_CLASIFICACION[clase].titulo}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">
                        {ACCION_POR_CLASIFICACION[clase].accion}
                      </p>
                    </div>

                    {/* Resumen de las 4 respuestas, en una línea cada una. */}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {[
                        {
                          etiqueta:
                            bant.perfil === "Inquilino" ? "Solvencia" : "Cómo va a pagar",
                          texto: etiquetaDe(
                            catalogoPresupuesto(bant.perfil ?? "Comprador"),
                            bant.presupuesto,
                          ),
                          puntos: desglose.presupuesto,
                          max: 30,
                        },
                        {
                          etiqueta: "Quién decide",
                          texto: etiquetaDe(BANT_AUTORIDAD, bant.autoridad),
                          puntos: desglose.autoridad,
                          max: 20,
                        },
                        {
                          etiqueta: "Qué tan claro lo tiene",
                          texto: etiquetaDe(BANT_NECESIDAD, bant.necesidad),
                          puntos: desglose.necesidad,
                          max: 30,
                        },
                        {
                          etiqueta: "Para cuándo",
                          texto: etiquetaDe(BANT_PLAZO, bant.plazo),
                          puntos: desglose.plazo,
                          max: 20,
                        },
                      ].map((f) => (
                        <div key={f.etiqueta} className="rounded-lg bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              {f.etiqueta}
                            </p>
                            <span className="shrink-0 text-[11px] font-bold text-slate-500">
                              {f.puntos}/{f.max}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm font-semibold text-slate-800">{f.texto}</p>
                          <div className="mt-1.5 h-1 rounded-full bg-slate-200">
                            <div
                              className="h-1 rounded-full bg-slate-700"
                              style={{ width: `${(f.puntos / f.max) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Datos de apoyo capturados en el cuestionario. */}
                    {(bant.montoMaximo ||
                      bant.formaPago ||
                      bant.quienMasDecide ||
                      bant.requisitos ||
                      bant.observaciones) && (
                      <div className="space-y-1 rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
                        {bant.montoMaximo ? (
                          <p>
                            <span className="font-semibold text-slate-800">
                              {bant.perfil === "Inquilino"
                                ? "Renta máxima:"
                                : "Puede pagar hasta:"}
                            </span>{" "}
                            {formatoMXN(bant.montoMaximo)}
                            {propiedadInteres && bant.montoMaximo < propiedadInteres.precio && (
                              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">
                                Por debajo del precio de la propiedad que le interesa
                              </span>
                            )}
                          </p>
                        ) : null}
                        {bant.formaPago && (
                          <p>
                            <span className="font-semibold text-slate-800">
                              {bant.perfil === "Inquilino" ? "Respaldo:" : "Forma de pago:"}
                            </span>{" "}
                            {bant.formaPago}
                          </p>
                        )}
                        {bant.quienMasDecide && (
                          <p>
                            <span className="font-semibold text-slate-800">También decide:</span>{" "}
                            {bant.quienMasDecide}
                          </p>
                        )}
                        {bant.requisitos && (
                          <p>
                            <span className="font-semibold text-slate-800">No puede faltar:</span>{" "}
                            {bant.requisitos}
                          </p>
                        )}
                        {bant.observaciones && (
                          <p>
                            <span className="font-semibold text-slate-800">Notas del asesor:</span>{" "}
                            {bant.observaciones}
                          </p>
                        )}
                      </div>
                    )}

                    <p className="text-[11px] text-slate-400">
                      Calificado por {bant.calificadoPor} el {fmtFechaHora(bant.calificadoEl)}.
                    </p>
                  </div>
                )}
              </section>

              {/* --- Historial --- */}
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Clock className="size-4 text-slate-400" /> Historial del cliente
                  </h3>
                  <span className="text-xs text-slate-400">
                    {historial.length} {historial.length === 1 ? "evento" : "eventos"}
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <select
                    value={tipoEvento}
                    onChange={(e) => setTipoEvento(e.target.value as TipoInteraccion)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500 sm:w-36"
                  >
                    {TIPOS_INTERACCION.map((t) => (
                      <option key={t.valor} value={t.valor}>
                        {t.etiqueta}
                      </option>
                    ))}
                  </select>
                  <input
                    value={textoEvento}
                    onChange={(e) => setTextoEvento(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && registrar()}
                    placeholder="¿Qué pasó con este cliente?"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                  />
                  <button
                    onClick={registrar}
                    disabled={!textoEvento.trim()}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    Registrar
                  </button>
                </div>

                <div className="mt-4">
                  {historial.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                      Todavía no hay nada registrado. Cada llamada, visita o mensaje que anotes aquí
                      queda como evidencia del seguimiento.
                    </p>
                  ) : (
                    <ol className="space-y-3">
                      {historial.map((h) => (
                        <li key={h.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className="mt-1.5 size-2 rounded-full bg-slate-300" />
                            <span className="w-px flex-1 bg-slate-200" />
                          </div>
                          <div className="min-w-0 flex-1 pb-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                {h.tipo}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {fmtFechaHora(h.fecha)} · {h.autor}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-700">{h.descripcion}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {creando && (
        <NuevoClienteModal
          propiedades={propiedades}
          asesorId={usuario.id}
          onCancelar={() => setCreando(false)}
          onGuardar={(nuevo) => {
            onCrearCliente(nuevo);
            setCreando(false);
            // Se abre su ficha de inmediato: el asesor acaba de capturarlo,
            // lo siguiente que quiere es calificarlo o escribirle.
            abrirCliente(nuevo.id);
            setBusqueda("");
            setFiltroClase("Todas");
            setFiltroEtapa("Todas");
          }}
        />
      )}

      {calificando && seleccionado && (
        <CalificarProspectoModal
          lead={seleccionado}
          propiedad={propiedadInteres}
          nombreAsesor={usuario.nombre}
          onCancelar={() => setCalificando(false)}
          onGuardar={(b) => {
            onGuardarCalificacion(seleccionado.id, b);
            setCalificando(false);
          }}
        />
      )}
    </div>
  );
}
