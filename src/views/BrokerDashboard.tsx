// Dashboard del broker — rediseño Fase 1 (glass + neumórfico).
//
// Criterio: la pantalla muestra SOLO lo esencial (panel guía, tarjetas
// métricas y el embudo). Los desgloses (alertas, ranking, cierres,
// comisiones) NO son pantallas nuevas: emergen como tarjetas de detalle
// translúcidas (GlassModal) sobre la pantalla, que queda desenfocada detrás.
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  Percent,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import GlassModal from "../components/GlassModal";
import KpiCard from "../components/KpiCard";
import { ETAPAS_LEAD } from "../data/etapasLead";
import { diasDesde, formatMin, minutosRespuesta } from "../lib/metrics";
import type { Lead, LeadStage, Propiedad, Usuario } from "../types";
import { formatoMXN } from "../types";

type Periodo = "hoy" | "semana" | "mes";
type Detalle = "alertas" | "ranking" | "cierres" | "comisiones" | null;

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
}

export default function BrokerDashboard({ broker, usuarios, propiedades, leads, onVerAsesor }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [detalle, setDetalle] = useState<Detalle>(null);
  const ahora = useMemo(() => Date.now(), []);
  const dias = PERIODOS.find((p) => p.key === periodo)!.dias;

  const leadsPeriodo = useMemo(
    () => leads.filter((l) => diasDesde(l.creado, ahora) <= dias),
    [leads, ahora, dias],
  );

  // --- KPIs ---
  const propiedadesActivas = propiedades.filter((p) => p.estatus === "Activa");
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

      {/* ---------- Tarjetas métricas ---------- */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        <KpiCard
          label="Propiedades activas"
          value={String(propiedadesActivas.length)}
          icon={Building2}
          accent="text-sky-600"
          circulo="bg-sky-100"
        />
        <KpiCard
          label="Leads del periodo"
          value={String(leadsPeriodo.length)}
          icon={Users}
          accent="text-blue-600"
          circulo="bg-blue-100"
        />
        <KpiCard
          label="Tasa de conversión"
          value={`${tasaConversion}%`}
          icon={Percent}
          accent="text-violet-600"
          circulo="bg-violet-100"
        />
        <KpiCard
          label="Cierres del periodo"
          value={String(cierres.length)}
          icon={Target}
          accent="text-emerald-600"
          circulo="bg-emerald-100"
          onClick={() => setDetalle("cierres")}
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
          <h2 className="mb-4 text-sm font-bold text-slate-900">Pipeline agregado</h2>
          <div className="flex items-end gap-3">
            {pipeline.map((e) => (
              <div key={e.etapa} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-sm font-bold text-slate-800">{e.cantidad}</span>
                <div className="flex h-24 w-full items-end overflow-hidden rounded-xl bg-white/60 shadow-inner">
                  <div
                    className={`w-full rounded-xl ${e.acento}`}
                    style={{ height: `${(e.cantidad / maxPipeline) * 100}%` }}
                  />
                </div>
                <span className="text-center text-[11px] font-medium text-slate-500">{e.titulo}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Equipo (abre el ranking en glass modal) ---------- */}
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

          <button
            onClick={() => totalAlertas > 0 && setDetalle("alertas")}
            className={`neu flex items-center gap-3 p-4 text-left transition-transform ${
              totalAlertas > 0 ? "hover:-translate-y-0.5" : "opacity-70"
            }`}
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                totalAlertas > 0 ? "bg-amber-100" : "bg-emerald-100"
              }`}
            >
              {totalAlertas > 0 ? (
                <AlertTriangle className="size-5 text-amber-600" />
              ) : (
                <CheckCircle2 className="size-5 text-emerald-600" />
              )}
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">Alertas</p>
              <p className="text-xs text-slate-500">
                {totalAlertas > 0 ? `${totalAlertas} activa${totalAlertas === 1 ? "" : "s"}` : "Sin alertas"}
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
              <p className="px-2 py-6 text-center text-xs text-slate-400">Sin alertas activas.</p>
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
                      <span className="w-4 text-xs font-bold text-slate-400">{i + 1}</span>
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

      {detalle === "cierres" && (
        <GlassModal
          titulo="Cierres del periodo"
          subtitulo={`${cierres.length} operación${cierres.length === 1 ? "" : "es"} cerrada${cierres.length === 1 ? "" : "s"}`}
          onCerrar={() => setDetalle(null)}
        >
          <ul className="space-y-2">
            {cierres.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{l.nombre}</p>
                  <p className="text-xs text-slate-500">
                    Asesor: {usuarios.find((u) => u.id === l.asesorId)?.nombre ?? "—"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-emerald-700">
                  {l.montoOferta ? formatoMXN(l.montoOferta) : "—"}
                </span>
              </li>
            ))}
            {cierres.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-400">
                Sin cierres en este periodo.
              </p>
            )}
          </ul>
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
              <p className="px-2 py-6 text-center text-xs text-slate-400">
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
