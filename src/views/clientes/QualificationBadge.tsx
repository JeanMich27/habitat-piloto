import { evaluarBant } from "../../domain/leads/qualification";
import type { ClasificacionLead, Lead } from "../../types";

const COLORS: Record<ClasificacionLead, string> = {
  Hot: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Warm: "border-amber-200 bg-amber-50 text-amber-700",
  Cold: "border-slate-200 bg-slate-100 text-slate-600",
};

export function QualificationBadge({ lead }: { lead: Lead }) {
  const evaluation = evaluarBant(lead.bant);
  if (evaluation.estado === "vacio") return <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">Sin calificar</span>;
  if (!evaluation.calificado) {
    const answered = 4 - evaluation.faltantes.length;
    return <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{evaluation.estado === "invalido" ? "Datos inválidos" : `Parcial · ${answered}/4`}</span>;
  }
  return <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${COLORS[evaluation.clasificacion!]}`}>{evaluation.clasificacion} · {evaluation.puntaje} pts</span>;
}
