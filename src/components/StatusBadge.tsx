import type { PropertyStatus } from "../types";

const ESTILOS: Record<PropertyStatus, string> = {
  Activa: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  Validacion: "bg-sky-100 text-sky-700 ring-sky-600/20",
  Intake: "bg-amber-100 text-amber-700 ring-amber-600/20",
  Pausada: "bg-orange-100 text-orange-700 ring-orange-600/20",
  Cerrada: "bg-slate-200 text-slate-600 ring-slate-500/20",
};

const ETIQUETAS: Record<PropertyStatus, string> = {
  Activa: "Activa",
  Validacion: "En Validación",
  Intake: "Intake",
  Pausada: "Pausada",
  Cerrada: "Cerrada",
};

export default function StatusBadge({ estatus }: { estatus: PropertyStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${ESTILOS[estatus]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {ETIQUETAS[estatus]}
    </span>
  );
}
