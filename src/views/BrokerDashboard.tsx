// Dashboard del broker — glass + neumórfico.
//
// Criterio: la pantalla muestra SOLO lo esencial y cada dato aparece UNA vez.
// De la auditoría de duplicados (ago 2026) salieron tres cosas:
//   · "Leads del periodo" era la suma de las barras del pipeline.
//   · "Cierres del periodo" era la barra de Cierre del mismo pipeline.
//   · "Alertas" estaba dos veces: el botón guía del panel y una tarjeta.
// Se quedaron las cifras que NO se pueden leer en el pipeline (razones y
// promedios) y el pipeline pasó a ser navegable: cada barra abre Clientes
// filtrado por esa etapa, que es más útil que el modal que sustituye.
//
// Los desgloses que quedan (alertas, ranking, comisiones) NO son pantallas
// nuevas: emergen como tarjetas translúcidas (GlassModal) sobre la pantalla.
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  Percent,
  Trophy,
} from "lucide-react";
import GlassModal from "../components/GlassModal";
import KpiCard from "../components/KpiCard";
import { ETAPAS_LEAD } from "../data/etapasLead";
import { diasDesde, formatMin, minutosRespuesta } from "../lib/metrics";
import type { Lead, LeadStage, Propiedad, Usuario } from "../types";
import { formatoMXN } from "../types";

type Periodo = "hoy" | "semana" | "mes";
type Detalle = "alertas" | "ranking" | "comisiones" | null;

const PERIODOS: { key: Periodo; label: string; dias: number }[] = [
  { key: "hoy", label: "Hoy", dias: 1 },
  { key: "semana", label: "Semana", dias: 7 },
  { key: "mes", label: "Mes", dias: 31 },
];

// Las etapas viven en un solo archivo (src/data/etapasLead.ts) para que el
// embudo del broker y el Kanban del asesor nunca se desincronicen.

interface Props {
  broker: Usuario;
  usuarios: Usuario[];
  propiedades: Propiedad[];
  leads: Lead[];
  onVerAsesor: (asesorId: string) => void;
  /** Abre Clientes filtrado por etapa (al tocar una barra del pipeline). */
  onVerClientes: (etapa?: LeadStage) => void;
}

export default function BrokerDashboard({
  broker,
  usuarios,
  propiedades,
  leads,
  onVerAsesor,
  onVerClientes,
}: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [detalle, setDetalle] = useState<Detalle>(null);
  const ahora = useMemo(() => Date.now(), []);
  const dias = PERIODOS.find((p) => p.key === periodo)!.dias;

  const leadsPeriodo = useMemo(
    () => leads.filter((l) => diasDesde(l.creado, ahora) <= dias),
    [leads, ahora, dias],
  );

  // --- KPIs ---
  const propiedadesActivas = propiedades.filter((p) => p.estatus === "Publicada");
  const cierres = leadsPeriodo.filter((l) => l.etapa === "Cierre");
  const tasaConversion = leadsPeriodo.length
    ? Math.round((cierres.length / leadsPeriodo.length) * 100)
    : 0;

  const tiemposRespuesta = leadsPeriodo
    .map(minutosRespuesta)
    .filter((m): m is number => m !== null);
  const tiempoRespuestaProm = tiemposRespuesta.length
    ? tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length
    : null;

  const leadsComisionables = leadsPeriodo.filter(
    (l) => (l.etapa === "Negociacion" || l.etapa === "Cierre") && l.montoOferta,
  );
  const comisionesProyectadas = leadsComisionables.reduce(
    (sum, l) => sum + (l.montoOferta ?? 0) * 0.03,
    0,
  );

  // --- Pipeline agregado ---
  const pipeline = ETAPAS_LEAD.map((e) => ({
    ...e,
    cantidad: leadsPeriodo.filter((l) => l.etapa === e.etapa).length,
  }));
  const maxPipeline = Math.max(1, ...pipeline.map((p) => p.cantidad));

  // --- Ranking de asesores (excluye al propio broker) ---
  const asesores = usuarios.filter(
    (u) => u.rol === "asesor_equipo" || u.rol === "asesor_independiente",
  );
  const ranking = asesores
    .map((a) => {
      const suyos = leadsPeriodo.filter((l) => l.asesorId === a.id);
      const visitas = suyos.filter((l) =>
        (["Visitado", "Negociacion", "Cierre"] as LeadStage[]).includes(l.etapa),
      ).length;
      const cierresAsesor = suyos.filter((l) => l.etapa === "Cierre").length;
      const tiempos = suyos.map(minutosRespuesta).filter((m): m is number => m !== null);
      const tiempoProm = tiempos.length
        ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length
        : null;
      return { asesor: a, leads: suyos.length, visitas, cierres: cierresAsesor, tiempoProm };
    })
    .sort((a, b) => b.leads - a.leads);

  // --- Alertas ---
  const leadsSinContactar = leads.filter(
    (l) => l.etapa === "Nuevo" && diasDesde(l.creado, ahora) > 1,
  );
  const propiedadesSinActividad = propiedadesActivas.filter(
    (p) => p.ultimaActividad && diasDesde(p.ultimaActividad, ahora) > 7,
  );
  const totalAlertas = leadsSinContactar.length + propiedadesSinActividad.length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
      {/* ---------- Panel guía / bienvenida ---------- */}
      <section className="glass relative overflow-hidden p-5 sm:p-6">
        {/* Gradiente pastel de fondo, sutil */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-100/70 via-violet-100/40 to-amber-100/50" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Hola, {broker.nombre.split(" ")[0]}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Así va tu agencia este {periodo === "hoy" ? "día" : periodo === "semana" ? "semana" : "mes"}.
            </p>

            {/* Guía: el siguiente paso más importante, uno solo. */}
            <button
              onClick={() => totalAlertas > 0 && setDetalle("alertas")}
              className={`mt-4 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-sm backdrop-blur transition ${
                totalAlertas > 0
                  ? "bg-amber-50/90 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                  : "bg-emerald-50/90 text-emerald-700 ring-1 ring-emerald-200"
              }`}
            >
              {totalAlertas > 0 ? (
                <>
                  <AlertTriangle className="size-4" />
                  {totalAlertas} pendiente{totalAlertas === 1 ? "" : "s"} que requieren tu atención — ver detalle
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" /> Todo al día: sin alertas activas
                </>
              )}
            </button>
          </div>

          {/* Selector de periodo */}
          <div className="flex gap-1 rounded-full bg-white/60 p-1 shadow-inner backdrop-blur">
            {PERIODOS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  periodo === p.key
                    ? "bg-violet-600 text-white shadow-md shadow-violet-300/60"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Tarjetas métricas ----------
          Solo razones y promedios: los conteos por etapa (y su total) se leen
          en el pipeline de abajo, no hace falta repetirlos aquí. */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Propiedades activas"
          value={String(propiedadesActivas.length)}
          icon={Building2}
          accent="text-sky-600"
          circulo="bg-sky-100"
        />
        <KpiCard
          label="Tasa de conversión"
          value={`${tasaConversion}%`}
          icon={Percent}
          accent="text-violet-600"
          circulo="bg-violet-100"
        />
        <KpiCard
          label="Tiempo de respuesta"
          value={formatMin(tiempoRespuestaProm)}
          icon={Clock}
          accent="text-amber-600"
          circulo="bg-amber-100"
        />
        <KpiCard
          label="Comisiones proyectadas"
          value={formatoMXN(Math.round(comisionesProyectadas))}
          icon={DollarSign}
          accent="text-emerald-700"
          circulo="bg-emerald-100"
          onClick={() => setDetalle("comisiones")}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        {/* ---------- Pipeline agregado ---------- */}
        <section className="glass p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">Pipeline agregado</h2>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
              {leadsPeriodo.length} lead{leadsPeriodo.length === 1 ? "" : "s"} · toca una etapa
            </span>
          </div>
          {/* Cada barra abre Clientes filtrado por esa etapa: la gráfica que no
              deja llegar al registro es un adorno. */}
          <div className="flex items-end gap-3">
            {pipeline.map((e) => (
              <button
                key={e.etapa}
                onClick={() => e.cantidad > 0 && onVerClientes(e.etapa)}
                disabled={e.cantidad === 0}
                aria-label={`Ver los ${e.cantidad} leads en etapa ${e.titulo}`}
                className={`group flex flex-1 flex-col items-center gap-2 rounded-2xl p-1.5 transition ${
                  e.cantidad === 0 ? "cursor-default opacity-50" : "hover:bg-white/70"
                }`}
              >
                <span className="text-sm font-bold text-slate-800">{e.cantidad}</span>
                <span className="flex h-24 w-full items-end overflow-hidden rounded-xl bg-white/60 shadow-inner">
                  <span
                    className={`block w-full rounded-xl ${e.acento}`}
                    style={{ height: `${(e.cantidad / maxPipeline) * 100}%` }}
                  />
                </span>
                <span className="text-center text-[11px] font-medium text-slate-500">
                  {e.titulo}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ---------- Equipo (abre el ranking en glass modal) ----------
            La tarjeta de Alertas que vivía aquí se quitó: el botón guía del
            panel de arriba abre exactamente el mismo detalle. */}
        <section className="flex flex-col gap-3">
          <button
            onClick={() => setDetalle("ranking")}
            className="neu flex flex-1 flex-col justify-between gap-4 p-5 text-left transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-12 items-center justify-center rounded-full bg-violet-100">
                <Trophy className="size-6 text-violet-600" />
              </span>
              <div className="flex -space-x-2">
                {ranking.slice(0, 4).map((r) => (
                  <span
                    key={r.asesor.id}
                    className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-[10px] font-bold text-white ring-2 ring-white"
                  >
                    {r.asesor.iniciales}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Ranking de asesores</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {asesores.length} asesor{asesores.length === 1 ? "" : "es"} · toca para ver leads,
                visitas y cierres de cada uno
              </p>
            </div>
          </button>
        </section>
      </div>

      {/* ================= Tarjetas de detalle superpuestas ================= */}

      {detalle === "alertas" && (
        <GlassModal
          titulo="Alertas"
          subtitulo="Lo que requiere tu atención hoy"
          onCerrar={() => setDetalle(null)}
        >
          <div className="space-y-2">
            {leadsSinContactar.map((l) => (
              <div
                key={l.id}
                className="rounded-2xl bg-amber-50/90 px-4 py-3 text-xs text-amber-800 ring-1 ring-amber-200"
              >
                <span className="font-semibold">{l.nombre}</span> sin contactar hace{" "}
                {Math.floor(diasDesde(l.creado, ahora) * 24)} h
              </div>
            ))}
            {propiedadesSinActividad.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl bg-rose-50/90 px-4 py-3 text-xs text-rose-800 ring-1 ring-rose-200"
              >
                <span className="font-semibold">{p.titulo}</span> sin actividad hace{" "}
                {Math.floor(diasDesde(p.ultimaActividad!, ahora))} días
              </div>
            ))}
            {totalAlertas === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-500">Sin alertas activas.</p>
            )}
          </div>
        </GlassModal>
      )}

      {detalle === "ranking" && (
        <GlassModal
          titulo="Ranking de asesores"
          subtitulo="Toca un asesor para abrir su perfil y desempeño"
          ancho="lg"
          onCerrar={() => setDetalle(null)}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200/70">
                  <th className="px-3 py-2.5">Asesor</th>
                  <th className="px-3 py-2.5">Leads</th>
                  <th className="px-3 py-2.5">Visitas</th>
                  <th className="px-3 py-2.5">Cierres</th>
                  <th className="px-3 py-2.5">Respuesta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {ranking.map((r, i) => (
                  <tr
                    key={r.asesor.id}
                    onClick={() => onVerAsesor(r.asesor.id)}
                    className="cursor-pointer rounded-xl hover:bg-white/70"
                  >
                    <td className="flex items-center gap-2 px-3 py-3">
                      <span className="w-4 text-xs font-bold text-slate-500">{i + 1}</span>
                      <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-[11px] font-bold text-white">
                        {r.asesor.iniciales}
                      </span>
                      <span className="font-medium text-slate-800">{r.asesor.nombre}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{r.leads}</td>
                    <td className="px-3 py-3 text-slate-600">{r.visitas}</td>
                    <td className="px-3 py-3 text-slate-600">{r.cierres}</td>
                    <td className="px-3 py-3 text-slate-600">{formatMin(r.tiempoProm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassModal>
      )}

      {detalle === "comisiones" && (
        <GlassModal
          titulo="Comisiones proyectadas"
          subtitulo="Leads en negociación o cierre con oferta registrada (3%)"
          onCerrar={() => setDetalle(null)}
        >
          <ul className="space-y-2">
            {leadsComisionables.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{l.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {l.etapa} · oferta {formatoMXN(l.montoOferta ?? 0)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-emerald-700">
                  {formatoMXN(Math.round((l.montoOferta ?? 0) * 0.03))}
                </span>
              </li>
            ))}
            {leadsComisionables.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-500">
                Sin ofertas registradas en este periodo.
              </p>
            )}
          </ul>
          {leadsComisionables.length > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-emerald-50/90 px-4 py-3 ring-1 ring-emerald-200">
              <span className="text-xs font-semibold text-emerald-800">Total proyectado</span>
              <span className="text-sm font-bold text-emerald-700">
                {formatoMXN(Math.round(comisionesProyectadas))}
              </span>
            </div>
          )}
        </GlassModal>
      )}
    </div>
  );
}
