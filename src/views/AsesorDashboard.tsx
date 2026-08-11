import { Building2, TrendingUp } from "lucide-react";
import KanbanCard from "../components/KanbanCard";
import KanbanColumn from "../components/KanbanColumn";
import PropertyCard from "../components/PropertyCard";
import ProyeccionComisiones from "../components/ProyeccionComisiones";
import { ETAPAS_LEAD } from "../data/etapasLead";
import type { Lead, LeadStage, Propiedad, Usuario } from "../types";

interface Props {
  asesor: Usuario;
  leads: Lead[];
  propiedades: Propiedad[];
  onMoveLead: (leadId: string, etapa: LeadStage) => void;
  onVerPropiedades: () => void;
}

export default function AsesorDashboard({
  asesor,
  leads,
  propiedades,
  onMoveLead,
  onVerPropiedades,
}: Props) {
  const misLeads = leads.filter((l) => l.asesorId === asesor.id);
  const misPropiedades = propiedades.filter((p) => p.asesorId === asesor.id);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
      {/* Encabezado del asesor */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-slate-800 text-lg font-bold text-white">
            {asesor.iniciales}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Dashboard de {asesor.nombre}
            </h1>
            <p className="text-sm text-slate-500">{asesor.puesto}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
          <TrendingUp className="size-4 text-emerald-600" />
          <span className="font-semibold">{misLeads.length}</span> leads activos
          · <span className="font-semibold">{misPropiedades.length}</span>{" "}
          propiedades exclusivas
        </div>
      </header>

      {/* Proyección de cierres y comisiones (solo dashboard de asesor) */}
      <ProyeccionComisiones leads={misLeads} propiedades={propiedades} />

      {/* Panel de propiedades exclusivas */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <Building2 className="size-4" /> Mis propiedades exclusivas
          </h2>
          <button
            onClick={onVerPropiedades}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            Ver mis propiedades
          </button>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {misPropiedades.map((p) => (
            <PropertyCard key={p.id} propiedad={p} />
          ))}
          {misPropiedades.length === 0 && (
            <p className="text-sm text-slate-400">
              Aún no tienes propiedades exclusivas asignadas.
            </p>
          )}
        </div>
      </section>

      {/* Pipeline Kanban */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pipeline de leads
        </h2>
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
          {ETAPAS_LEAD.map((col) => {
            const leadsCol = misLeads.filter((l) => l.etapa === col.etapa);
            return (
              <KanbanColumn
                key={col.etapa}
                titulo={col.titulo}
                etapa={col.etapa}
                acento={col.acento}
                cantidad={leadsCol.length}
                onDropLead={onMoveLead}
              >
                {leadsCol.map((lead) => (
                  <KanbanCard
                    key={lead.id}
                    lead={lead}
                    propiedad={propiedades.find(
                      (p) => p.id === lead.interesPropiedadId,
                    )}
                    onMoverEtapa={onMoveLead}
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </div>
      </section>
    </div>
  );
}
