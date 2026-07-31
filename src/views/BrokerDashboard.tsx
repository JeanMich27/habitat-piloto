import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Clock,
  DollarSign,
  Percent,
  Target,
  Users,
} from "lucide-react";
import KpiCard from "../components/KpiCard";
import { ETAPAS_LEAD } from "../data/etapasLead";
import { diasDesde, formatMin, minutosRespuesta } from "../lib/metrics";
import type { Lead, LeadStage, Propiedad, Usuario } from "../types";
import { formatoMXN } from "../types";

type Periodo = "hoy" | "semana" | "mes";

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

  const comisionesProyectadas = leadsPeriodo
    .filter((l) => (l.etapa === "Negociacion" || l.etapa === "Cierre") && l.montoOferta)
    .reduce((sum, l) => sum + (l.montoOferta ?? 0) * 0.03, 0);

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

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
      {/* Header: agencia + selector de periodo */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Dashboard de {broker.nombre}
          </h1>
          <p className="text-sm text-slate-500">
            {broker.puesto} · Real Estate
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                periodo === p.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Propiedades activas"
          value={String(propiedadesActivas.length)}
          icon={Building2}
          accent="text-slate-500"
        />
        <KpiCard
          label="Leads del periodo"
          value={String(leadsPeriodo.length)}
          icon={Users}
          accent="text-blue-500"
        />
        <KpiCard
          label="Tasa de conversión"
          value={`${tasaConversion}%`}
          icon={Percent}
          accent="text-violet-500"
        />
        <KpiCard
          label="Cierres del periodo"
          value={String(cierres.length)}
          icon={Target}
          accent="text-emerald-600"
        />
        <KpiCard
          label="Tiempo de respuesta"
          value={formatMin(tiempoRespuestaProm)}
          icon={Clock}
          accent="text-amber-500"
        />
        <KpiCard
          label="Comisiones proyectadas"
          value={formatoMXN(Math.round(comisionesProyectadas))}
          icon={DollarSign}
          accent="text-emerald-600"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Pipeline agregado */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pipeline agregado
          </h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-end gap-3">
              {pipeline.map((e) => (
                <div key={e.etapa} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">{e.cantidad}</span>
                  <div className="flex h-24 w-full items-end rounded bg-slate-100">
                    <div
                      className={`w-full rounded ${e.acento}`}
                      style={{ height: `${(e.cantidad / maxPipeline) * 100}%` }}
                    />
                  </div>
                  <span className="text-center text-[11px] text-slate-500">{e.titulo}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Alertas */}
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <AlertTriangle className="size-4 text-amber-500" /> Alertas
          </h2>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            {leadsSinContactar.map((l) => (
              <div
                key={l.id}
                className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200"
              >
                <span className="font-semibold">{l.nombre}</span> sin contactar hace{" "}
                {Math.floor(diasDesde(l.creado, ahora) * 24)} h
              </div>
            ))}
            {propiedadesSinActividad.map((p) => (
              <div
                key={p.id}
                className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200"
              >
                <span className="font-semibold">{p.titulo}</span> sin actividad hace{" "}
                {Math.floor(diasDesde(p.ultimaActividad!, ahora))} días
              </div>
            ))}
            {leadsSinContactar.length === 0 && propiedadesSinActividad.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-slate-400">
                Sin alertas activas.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Ranking de asesores */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Ranking de asesores
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Asesor</th>
                <th className="px-4 py-3">Leads</th>
                <th className="px-4 py-3">Visitas</th>
                <th className="px-4 py-3">Cierres</th>
                <th className="px-4 py-3">Tiempo de respuesta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ranking.map((r) => (
                <tr
                  key={r.asesor.id}
                  onClick={() => onVerAsesor(r.asesor.id)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="flex items-center gap-2 px-4 py-3">
                    <span className="flex size-7 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">
                      {r.asesor.iniciales}
                    </span>
                    <span className="font-medium text-slate-800">{r.asesor.nombre}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.leads}</td>
                  <td className="px-4 py-3 text-slate-600">{r.visitas}</td>
                  <td className="px-4 py-3 text-slate-600">{r.cierres}</td>
                  <td className="px-4 py-3 text-slate-600">{formatMin(r.tiempoProm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">Clic en una fila para ver su Perfil/Desempeño.</p>
      </section>
    </div>
  );
}
