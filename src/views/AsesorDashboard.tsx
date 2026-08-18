// Dashboard del asesor — rediseño Fase 2.
//
// Estructura (en este orden, definida con Jean, ago 2026):
//   1. Panel guía (un solo "siguiente paso").
//   2. Mis propiedades (carrusel con termómetro de antigüedad).
//   3. Embudo de ventas → cada etapa navega a Clientes filtrado.
//   4. Resumen de clientes e historial → navega a Clientes.
//   5. Salud inmobiliaria → abre la radiografía de cómo está operando
//      (embudo de conversión, velocidad de respuesta, salud de cartera,
//      antigüedad de inventario y, al final, el dinero en juego).
//
// El dashboard informa y reparte, no opera: aquí no se editan datos.
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  Clock,
  Contact,
  Flame,
  Layers,
  Percent,
  Plus,
  Sparkles,
  Thermometer,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import PropertyCard from "../components/PropertyCard";
import { ETAPAS_LEAD } from "../data/etapasLead";
import { antiguedadDe } from "../lib/antiguedad";
import { conteoPorNivel } from "../lib/cartera";
import { formatMin, minutosRespuesta, promedio } from "../lib/metrics";
import type { Lead, LeadStage, Propiedad, Usuario } from "../types";
import { puedeCargarPropiedades } from "../types";

// Estilos por etapa del pipeline (pill, barra de progreso y borde de la
// tarjeta). Los colores siguen el acento de ETAPAS_LEAD.
const ESTILO_ETAPA: Record<LeadStage, { pill: string; barra: string; borde: string }> = {
  Nuevo: { pill: "bg-blue-50 text-blue-700", barra: "bg-blue-500", borde: "border-blue-200" },
  Contactado: { pill: "bg-violet-50 text-violet-700", barra: "bg-violet-500", borde: "border-violet-200" },
  Visitado: { pill: "bg-amber-50 text-amber-700", barra: "bg-amber-400", borde: "border-amber-200" },
  Negociacion: { pill: "bg-orange-50 text-orange-700", barra: "bg-orange-500", borde: "border-orange-200" },
  Cierre: { pill: "bg-emerald-50 text-emerald-700", barra: "bg-emerald-500", borde: "border-emerald-200" },
};

// Encabezado de sección: icono + título en mayúsculas + explicación corta.
function SeccionHeader({
  Icono,
  titulo,
  subtitulo,
  accion,
}: {
  Icono: LucideIcon;
  titulo: string;
  subtitulo: string;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900 sm:text-base">
          <Icono className="size-5 shrink-0 text-violet-600" /> {titulo}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{subtitulo}</p>
      </div>
      {accion}
    </div>
  );
}

// Signo vital de la tarjeta de Salud inmobiliaria: número grande + contexto.
function SignoVital({
  Icono,
  etiqueta,
  valor,
  detalle,
  acento,
  circulo,
}: {
  Icono: LucideIcon;
  etiqueta: string;
  valor: string;
  detalle: string;
  acento: string;
  circulo: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <span className={`flex size-9 items-center justify-center rounded-full ${circulo}`}>
        <Icono className={`size-4 ${acento}`} />
      </span>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {etiqueta}
      </p>
      <p className="mt-0.5 text-2xl font-black text-slate-900">{valor}</p>
      <p className="text-xs text-slate-500">{detalle}</p>
    </div>
  );
}

interface Props {
  asesor: Usuario;
  leads: Lead[];
  propiedades: Propiedad[];
  onVerPropiedades: () => void;
  onVerPropiedad: (propiedadId: string) => void;
  onVerClientes: (etapa?: LeadStage) => void;
  onVerCliente: (leadId: string) => void;
  onNuevaPropiedad: () => void;
  /** Abre la pantalla de Salud inmobiliaria (cómo está operando). */
  onVerSalud: () => void;
}

export default function AsesorDashboard({
  asesor,
  leads,
  propiedades,
  onVerPropiedades,
  onVerPropiedad,
  onVerClientes,
  onNuevaPropiedad,
  onVerSalud,
}: Props) {
  const misLeads = leads.filter((l) => l.asesorId === asesor.id);
  const misPropiedades = propiedades.filter((p) => p.asesorId === asesor.id);

  const activas = misPropiedades.filter((p) => p.estatus === "Publicada").length;
  // El asesor de equipo no capta inventario: eso lo hace el broker.
  const puedeCaptar = puedeCargarPropiedades(asesor.rol);

  // --- Resumen de cartera (datos reales, sin escalas inventadas) ---
  const porNivel = conteoPorNivel(misLeads);
  const evaluadosBant = misLeads.length - porNivel.sin;
  const prioridadAlta = porNivel.Hot;

  // --- Signos vitales: el mismo cálculo que la pantalla de Salud ---
  const cierres = misLeads.filter((l) => l.etapa === "Cierre").length;
  const tasaCierre = misLeads.length ? Math.round((cierres / misLeads.length) * 100) : 0;
  const tiempoProm = promedio(
    misLeads.map(minutosRespuesta).filter((m): m is number => m !== null),
  );
  const inventarioEnRiesgo = misPropiedades.filter((p) => {
    const nivel = antiguedadDe(p).nivel;
    return nivel === "naranja" || nivel === "rojo";
  }).length;

  // --- Guía: un solo "siguiente paso", el más valioso ---
  const sinContactar = misLeads.filter((l) => !l.primerContactoEn && l.etapa !== "Cierre");
  const guia =
    sinContactar.length > 0
      ? {
          texto: `Tienes ${sinContactar.length} cliente${sinContactar.length === 1 ? "" : "s"} sin contactar. La velocidad de respuesta define la conversión.`,
          accion: "Contactarlos ahora",
          onClick: () => onVerClientes(),
        }
      : misPropiedades.length === 0 && puedeCaptar
        ? {
            texto: "Empieza dando de alta tu primera propiedad: es la base de todo tu embudo.",
            accion: "Alta de propiedad",
            onClick: onNuevaPropiedad,
          }
        : {
            texto: "Vas al día. Revisa tu embudo y empuja los clientes en negociación.",
            accion: "Abrir clientes",
            onClick: () => onVerClientes(),
          };

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 sm:py-8">
      {/* ---------- Panel guía / bienvenida ---------- */}
      <section className="glass relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-100/70 via-violet-100/40 to-emerald-100/50" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-sm font-bold text-white shadow-md shadow-violet-300/50">
              {asesor.iniciales}
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
                Hola, {asesor.nombre.split(" ")[0]}
              </h1>
              <p className="text-xs text-slate-500">
                {misPropiedades.length} propiedades · {misLeads.length} clientes
              </p>
            </div>
          </div>
          <button
            onClick={() => onVerClientes()}
            className="flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-violet-300/60 hover:bg-violet-700"
          >
            <Contact className="size-3.5" /> Ver mis clientes
          </button>
        </div>

        {/* Un solo siguiente paso, guiado por la plataforma. */}
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 px-4 py-3 shadow-sm backdrop-blur">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <Sparkles className="size-4 shrink-0 text-violet-500" />
            {guia.texto}
          </p>
          <button
            onClick={guia.onClick}
            className="flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-200"
          >
            {guia.accion} <ArrowRight className="size-3.5" />
          </button>
        </div>
      </section>

      {/* ---------- 1. Propiedades ---------- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Building2 className="size-4 text-slate-400" /> Mis propiedades
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-500 shadow-sm">
              {activas} activas
            </span>
          </h2>
          <div className="flex gap-2">
            {puedeCaptar && (
              <button
                onClick={onNuevaPropiedad}
                className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
              >
                <Plus className="size-3.5" /> Nueva
              </button>
            )}
            <button
              onClick={onVerPropiedades}
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Ver todas <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>

        {misPropiedades.length === 0 ? (
          puedeCaptar ? (
            <button
              onClick={onNuevaPropiedad}
              className="glass flex w-full flex-col items-center border-dashed p-8 text-center hover:bg-white/70"
            >
              <Building2 className="size-6 text-slate-300" />
              <span className="mt-2 text-sm font-semibold text-slate-700">
                Todavía no tienes propiedades
              </span>
              <span className="mt-0.5 text-xs text-slate-400">
                Toca aquí para dar de alta la primera
              </span>
            </button>
          ) : (
            <div className="glass border-dashed p-8 text-center">
              <Building2 className="mx-auto size-6 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">
                Todavía no tienes propiedades asignadas
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Tu broker es quien da de alta el inventario y te lo asigna.
              </p>
            </div>
          )
        ) : (
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
            {misPropiedades.map((p) => (
              <button
                key={p.id}
                onClick={() => onVerPropiedad(p.id)}
                className="w-72 shrink-0 snap-start text-left"
                aria-label={`Abrir ${p.titulo}`}
              >
                <PropertyCard propiedad={p} />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ---------- 2. Embudo de ventas ---------- */}
      <section>
        <SeccionHeader
          Icono={Layers}
          titulo="Embudo de ventas"
          subtitulo="Haz clic en cualquier tarjeta de etapa para ir a la sección interactiva del Pipeline."
          accion={
            <button
              onClick={() => onVerClientes()}
              className="flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-violet-300/60 hover:bg-violet-700"
            >
              Abrir embudo <ArrowRight className="size-3.5" />
            </button>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {ETAPAS_LEAD.map(({ etapa, titulo }) => {
            const cantidad = misLeads.filter((l) => l.etapa === etapa).length;
            const pct = misLeads.length ? Math.round((cantidad / misLeads.length) * 100) : 0;
            const estilo = ESTILO_ETAPA[etapa];
            return (
              <button
                key={etapa}
                onClick={() => onVerClientes(etapa)}
                className={`rounded-3xl border bg-white/90 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${estilo.borde}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${estilo.pill}`}>
                    {etapa === "Nuevo" ? "Nuevo Lead" : titulo}
                  </span>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <ArrowRight className="size-4" />
                  </span>
                </div>
                <p className="mt-3 text-3xl font-black text-slate-900">{cantidad}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{pct}% del total</span>
                  <span className="text-slate-400">Leads</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${estilo.barra}`}
                    style={{ width: `${Math.max(pct, cantidad > 0 ? 6 : 2)}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- 3. Resumen de clientes e historial ---------- */}
      <section>
        <SeccionHeader
          Icono={Users}
          titulo="Resumen de clientes e historial"
          subtitulo="Resumen cualitativo de la cartera. Haz clic para ir a la sección detallada de Clientes."
        />

        <div className="rounded-3xl border border-violet-200 bg-white/80 p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700">
              <UserCheck className="size-3.5" /> Resumen de Cartera y BANT
            </span>
            <span className="text-xs text-slate-400">· Calificación inmobiliaria</span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Total leads / clientes
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900">{misLeads.length}</p>
              <p className="text-xs text-slate-500">Registrados en cartera</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600">
                Evaluados con BANT
              </p>
              <p className="mt-1 text-2xl font-black text-violet-700">{evaluadosBant}</p>
              <p className="text-xs text-slate-500">Con calificación completa</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                Prioridad alta (Hot)
              </p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{prioridadAlta}</p>
              <p className="text-xs text-slate-500">Puntaje 80–100: listos para cerrar</p>
            </div>
            <button
              onClick={() => onVerClientes()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-4 text-sm font-bold text-white shadow-md shadow-violet-300/60 transition hover:bg-violet-700"
            >
              Ir a la Sección de Clientes e Historial <ArrowRight className="size-4 shrink-0" />
            </button>
          </div>
        </div>
      </section>

      {/* ---------- 4. Salud inmobiliaria ---------- */}
      <section>
        <SeccionHeader
          Icono={Activity}
          titulo="Salud inmobiliaria"
          subtitulo="Cómo estás operando: embudo, velocidad de respuesta, cartera e inventario. Haz clic para abrir el análisis completo."
        />

        <button
          onClick={onVerSalud}
          aria-label="Abrir Salud inmobiliaria"
          className="w-full rounded-3xl border border-sky-200 bg-white/80 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1.5 text-xs font-bold text-sky-700">
              <Activity className="size-3.5" /> Signos vitales de tu operación
            </span>
            <span className="text-xs text-slate-400">· Solo lectura, todo navegable</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SignoVital
              Icono={Percent}
              etiqueta="Tasa de cierre"
              valor={`${tasaCierre}%`}
              detalle={`${cierres} de ${misLeads.length} clientes`}
              acento="text-violet-600"
              circulo="bg-violet-100"
            />
            <SignoVital
              Icono={Clock}
              etiqueta="Primer contacto"
              valor={formatMin(tiempoProm)}
              detalle="Promedio de tu cartera"
              acento="text-amber-600"
              circulo="bg-amber-100"
            />
            <SignoVital
              Icono={Flame}
              etiqueta="Clientes Hot"
              valor={String(porNivel.Hot)}
              detalle={`${porNivel.sin} sin calificar`}
              acento="text-emerald-600"
              circulo="bg-emerald-100"
            />
            <SignoVital
              Icono={Thermometer}
              etiqueta="Inventario en riesgo"
              valor={String(inventarioEnRiesgo)}
              detalle={`De ${misPropiedades.length} con +4 meses`}
              acento="text-rose-600"
              circulo="bg-rose-100"
            />
            <span className="flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-4 text-sm font-bold text-white shadow-md shadow-sky-300/60">
              Abrir Salud Inmobiliaria <ArrowRight className="size-4 shrink-0" />
            </span>
          </div>
        </button>
      </section>
    </div>
  );
}
