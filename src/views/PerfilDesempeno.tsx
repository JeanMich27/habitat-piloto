import { useMemo, useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, Clock, ShieldCheck, Target, Users } from "lucide-react";
import KpiCard from "../components/KpiCard";
import PermisosModal from "../components/PermisosModal";
import StatusBadge from "../components/StatusBadge";
import { diasDesde, etiquetaEtapa, formatMin, minutosRespuesta, promedio } from "../lib/metrics";
import type { Lead, Propiedad, Usuario } from "../types";
import { formatoMXN } from "../types";

const ESTADO_ESTILO: Record<string, string> = {
  Activo: "bg-emerald-100 text-emerald-700",
  Invitado: "bg-sky-100 text-sky-700",
  Inactivo: "bg-slate-200 text-slate-500",
};

interface Props {
  asesor: Usuario;
  propiedades: Propiedad[];
  leads: Lead[];
  onVolver: () => void;
  onEditarPermisos: (asesorId: string, puedeVerOtras: boolean) => void;
  onVerDetallePropiedad: (propiedadId: string) => void;
}

export default function PerfilDesempeno({
  asesor,
  propiedades,
  leads,
  onVolver,
  onEditarPermisos,
  onVerDetallePropiedad,
}: Props) {
  const ahora = useMemo(() => Date.now(), []);
  const [modalPermisos, setModalPermisos] = useState(false);

  const propiedadesAsesor = propiedades.filter((p) => p.asesorId === asesor.id);
  const propiedadesActivas = propiedadesAsesor.filter((p) => p.estatus === "Publicada");
  const leadsAsesor = leads.filter((l) => l.asesorId === asesor.id);
  const leadsActivos = leadsAsesor.filter((l) => l.etapa !== "Cierre");
  const visitas = leadsAsesor.filter((l) =>
    (["Visitado", "Negociacion", "Cierre"] as const).includes(
      l.etapa as "Visitado" | "Negociacion" | "Cierre",
    ),
  ).length;
  const cierresMes = leadsAsesor.filter(
    (l) => l.etapa === "Cierre" && diasDesde(l.creado, ahora) <= 31,
  ).length;
  const tiempoResp = promedio(
    leadsAsesor.map(minutosRespuesta).filter((m): m is number => m !== null),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <button
        onClick={onVolver}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" /> Volver a Asesores
      </button>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-full bg-slate-800 text-lg font-bold text-white">
            {asesor.iniciales}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">{asesor.nombre}</h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_ESTILO[asesor.estadoCuenta]}`}
              >
                {asesor.estadoCuenta}
              </span>
            </div>
            <p className="text-sm text-slate-500">{asesor.puesto}</p>
            <p className="text-xs text-slate-400">{asesor.correo}</p>
          </div>
        </div>
        <button
          onClick={() => setModalPermisos(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ShieldCheck className="size-3.5" /> Editar permisos
        </button>
      </div>

      {/* KPIs individuales — mismos que el ranking del Dashboard */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Propiedades activas" value={String(propiedadesActivas.length)} icon={Building2} accent="text-slate-500" />
        <KpiCard label="Leads atendidos" value={String(leadsAsesor.length)} icon={Users} accent="text-blue-500" />
        <KpiCard label="Visitas" value={String(visitas)} icon={CheckCircle2} accent="text-amber-500" />
        <KpiCard label="Cierres del mes" value={String(cierresMes)} icon={Target} accent="text-emerald-600" />
        <KpiCard label="Tiempo de respuesta" value={formatMin(tiempoResp)} icon={Clock} accent="text-violet-500" />
      </section>

      {/* Propiedades activas */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Propiedades activas
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Dirección</th>
                <th className="px-4 py-2.5">Precio</th>
                <th className="px-4 py-2.5">Estatus</th>
                <th className="px-4 py-2.5">Leads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {propiedadesActivas.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onVerDetallePropiedad(p.id)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800">{p.titulo}</td>
                  <td className="px-4 py-2.5 text-slate-600">{formatoMXN(p.precio)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge estatus={p.estatus} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {leads.filter((l) => l.interesPropiedadId === p.id).length}
                  </td>
                </tr>
              ))}
              {propiedadesActivas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    Sin propiedades activas todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Leads activos */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Leads activos
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Etapa</th>
                <th className="px-4 py-2.5">Propiedad de interés</th>
                <th className="px-4 py-2.5">Tiempo de respuesta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leadsActivos.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{l.nombre}</td>
                  <td className="px-4 py-2.5 text-slate-600">{etiquetaEtapa(l.etapa)}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {propiedades.find((p) => p.id === l.interesPropiedadId)?.titulo ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{formatMin(minutosRespuesta(l))}</td>
                </tr>
              ))}
              {leadsActivos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    Sin leads activos todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalPermisos && (
        <PermisosModal
          asesor={asesor}
          onCerrar={() => setModalPermisos(false)}
          onGuardar={(valor) => {
            onEditarPermisos(asesor.id, valor);
            setModalPermisos(false);
          }}
        />
      )}
    </div>
  );
}
