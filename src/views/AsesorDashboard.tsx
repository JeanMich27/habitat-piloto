// Dashboard del asesor.
//
// Criterio de la pantalla (auditoría de duplicados con Jean, ago 2026):
// cada dato aparece UNA sola vez. Antes el total de clientes salía 3 veces,
// los clientes Hot 2 y había 9 caminos distintos a la pantalla de Clientes;
// eso no es "informar de más", es hacer que el asesor tenga que decidir dónde
// mirar.
//
// Orden, de lo inmediato a lo estructural:
//   1. Ahora     — saludo, próxima cita y UN solo siguiente paso.
//   2. Salud     — cuatro signos vitales; abre la radiografía completa.
//   3. Embudo    — cada etapa navega a Clientes filtrado.
//   4. Propiedades — carrusel; va al final porque es el bloque más alto
//                    y el que menos se consulta al abrir la app.
//
// Lo que NO está aquí y es a propósito: botones sueltos a Clientes,
// Propiedades o Agenda. El menú inferior ya los tiene; repetirlos arriba solo
// competía con el siguiente paso.
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarOff,
  ChevronRight,
  Clock,
  Flame,
  Layers,
  Percent,
  Plus,
  Sparkles,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import PropertyCard from "../components/PropertyCard";
import { ETAPAS_LEAD } from "../data/etapasLead";
import { citasDeHoy, etiquetaDia, fmtHora, proximaCita } from "../lib/agenda";
import { antiguedadDe } from "../lib/antiguedad";
import { conteoPorNivel } from "../lib/cartera";
import { formatMin, minutosRespuesta, promedio } from "../lib/metrics";
import type { CitaAgenda, Lead, LeadStage, Propiedad, Usuario } from "../types";
import { TIPOS_CITA, puedeCargarPropiedades } from "../types";

// Estilos por etapa del pipeline. Los colores siguen el acento de ETAPAS_LEAD.
const ESTILO_ETAPA: Record<LeadStage, { pill: string; barra: string; borde: string }> = {
  Nuevo: { pill: "bg-blue-50 text-blue-700", barra: "bg-blue-500", borde: "border-blue-200" },
  Contactado: { pill: "bg-violet-50 text-violet-700", barra: "bg-violet-500", borde: "border-violet-200" },
  Visitado: { pill: "bg-amber-50 text-amber-700", barra: "bg-amber-400", borde: "border-amber-200" },
  Negociacion: { pill: "bg-orange-50 text-orange-700", barra: "bg-orange-500", borde: "border-orange-200" },
  Cierre: { pill: "bg-emerald-50 text-emerald-700", barra: "bg-emerald-500", borde: "border-emerald-200" },
};

// Encabezado de sección: título + una acotación corta + acción a la derecha.
// El subtítulo es opcional a propósito: tres "haz clic para ir a…" seguidos
// eran ruido, no ayuda.
function SeccionHeader({
  Icono,
  titulo,
  nota,
  accion,
}: {
  Icono: LucideIcon;
  titulo: string;
  nota?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900 sm:text-base">
        <Icono className="size-5 shrink-0 text-violet-600" />
        {titulo}
        {nota && (
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-slate-500 shadow-sm">
            {nota}
          </span>
        )}
      </h2>
      {accion}
    </div>
  );
}

// Signo vital: número grande + una línea de contexto. El contexto es el
// denominador (de cuántos), no una repetición del número.
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
      <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {etiqueta}
      </p>
      <p className="mt-0.5 text-2xl font-black text-slate-900">{valor}</p>
      <p className="text-xs text-slate-500">{detalle}</p>
    </div>
  );
}

const etiquetaTipoCita = (tipo: string) =>
  TIPOS_CITA.find((t) => t.valor === tipo)?.etiqueta ?? "Cita";

interface Props {
  asesor: Usuario;
  leads: Lead[];
  propiedades: Propiedad[];
  citas: CitaAgenda[];
  onVerPropiedades: () => void;
  onVerPropiedad: (propiedadId: string) => void;
  onVerClientes: (etapa?: LeadStage) => void;
  onVerCliente: (leadId: string) => void;
  onNuevaPropiedad: () => void;
  /** Abre la pantalla de Salud inmobiliaria (cómo está operando). */
  onVerSalud: () => void;
  /** Abre la Agenda desde la franja "tu día de hoy". */
  onVerAgenda: () => void;
}

export default function AsesorDashboard({
  asesor,
  leads,
  propiedades,
  citas,
  onVerPropiedades,
  onVerPropiedad,
  onVerClientes,
  onNuevaPropiedad,
  onVerSalud,
  onVerAgenda,
}: Props) {
  const misLeads = leads.filter((l) => l.asesorId === asesor.id);
  const misPropiedades = propiedades.filter((p) => p.asesorId === asesor.id);

  const activas = misPropiedades.filter((p) => p.estatus === "Publicada").length;
  // El asesor de equipo no capta inventario: eso lo hace el broker.
  const puedeCaptar = puedeCargarPropiedades(asesor.rol);

  // --- Tu día: misma fuente que el badge de la Agenda ---
  const hoy = new Date();
  const citasHoy = citasDeHoy(citas, asesor.id, hoy);
  const proxima = proximaCita(citas, asesor.id, hoy);
  const leadDeProxima = proxima?.leadId ? leads.find((l) => l.id === proxima.leadId) : undefined;
  const propiedadDeProxima = proxima?.propiedadId
    ? propiedades.find((p) => p.id === proxima.propiedadId)
    : undefined;

  // --- Signos vitales: el mismo cálculo que la pantalla de Salud ---
  const porNivel = conteoPorNivel(misLeads);
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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* ================= 1. Ahora ================= */}
      <section className="glass relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-100/70 via-violet-100/40 to-emerald-100/50" />

        <div className="relative flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-sm font-bold text-white shadow-md shadow-violet-300/50">
            {asesor.iniciales}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
              Hola, {asesor.nombre.split(" ")[0]}
            </h1>
            <p className="text-xs capitalize text-slate-500">
              {hoy.toLocaleDateString("es-MX", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
        </div>

        {/* Tu día de hoy: la pregunta que un asesor en campo se hace varias
            veces al día. Sin esto tenía que entrar a la Agenda a averiguarlo. */}
        <button
          onClick={onVerAgenda}
          aria-label={proxima ? "Abrir agenda: ver tu próxima cita" : "Abrir agenda"}
          className="relative mt-4 flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white/70 px-4 py-3 text-left shadow-sm backdrop-blur transition hover:bg-white"
        >
          {proxima ? (
            <>
              <CalendarDays className="size-4 shrink-0 text-violet-500" />
              <span className="text-xs font-bold text-slate-900">
                {etiquetaDia(new Date(proxima.inicio), hoy)} {fmtHora(proxima.inicio)}
              </span>
              <span className="min-w-0 truncate text-xs text-slate-600">
                {etiquetaTipoCita(proxima.tipo)}
                {leadDeProxima ? ` · ${leadDeProxima.nombre}` : ""}
                {propiedadDeProxima ? ` · ${propiedadDeProxima.titulo}` : ""}
              </span>
              {citasHoy.length > 1 && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                  {citasHoy.length} citas hoy
                </span>
              )}
              <ChevronRight className="ml-auto size-4 shrink-0 text-slate-500" />
            </>
          ) : (
            <>
              <CalendarOff className="size-4 shrink-0 text-slate-500" />
              <span className="text-xs font-medium text-slate-500">
                No tienes citas próximas agendadas
              </span>
              <span className="ml-auto flex items-center gap-1 text-xs font-bold text-violet-700">
                Abrir agenda <ChevronRight className="size-3.5" />
              </span>
            </>
          )}
        </button>

        {/* Un solo siguiente paso, guiado por la plataforma. */}
        <div className="relative mt-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 px-4 py-3 shadow-sm backdrop-blur">
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

      {/* ================= 2. Salud inmobiliaria ================= */}
      <section>
        {/* Un solo control: la franja completa abre el análisis. Un botón
            extra en el encabezado sería el mismo destino dos veces — que es
            justo lo que esta pantalla dejó de hacer. */}
        <SeccionHeader
          Icono={Activity}
          titulo="Salud inmobiliaria"
          nota="Toca para ver el análisis"
        />

        <button
          onClick={onVerSalud}
          aria-label="Abrir Salud inmobiliaria"
          className="grid w-full grid-cols-2 gap-3 rounded-3xl border border-sky-200 bg-white/80 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:grid-cols-4"
        >
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
        </button>
      </section>

      {/* ================= 3. Embudo de ventas ================= */}
      <section>
        <SeccionHeader
          Icono={Layers}
          titulo="Embudo de ventas"
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
                aria-label={`Ver los ${cantidad} clientes en etapa ${titulo}`}
                className={`group rounded-3xl border bg-white/90 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${estilo.borde}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${estilo.pill}`}>
                    {etapa === "Nuevo" ? "Nuevo Lead" : titulo}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
                </div>
                <p className="mt-3 text-3xl font-black text-slate-900">{cantidad}</p>
                <p className="mt-0.5 text-xs text-slate-500">{pct}% del total</p>
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

      {/* ================= 4. Mis propiedades ================= */}
      <section>
        <SeccionHeader
          Icono={Building2}
          titulo="Mis propiedades"
          nota={`${activas} activas`}
          accion={
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
          }
        />

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
              <span className="mt-0.5 text-xs text-slate-500">
                Toca aquí para dar de alta la primera
              </span>
            </button>
          ) : (
            <div className="glass border-dashed p-8 text-center">
              <Building2 className="mx-auto size-6 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">
                Todavía no tienes propiedades asignadas
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
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
    </div>
  );
}
