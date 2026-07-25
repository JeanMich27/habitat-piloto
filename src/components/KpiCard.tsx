import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: string; // clase de color del ícono, ej. "text-emerald-600"
}

// Componente de Design System reutilizado en los 5 dashboards (Broker,
// Asesor Independiente, Asesor de Equipo, Propietario, Cliente).
export default function KpiCard({ label, value, icon: Icon, accent = "text-slate-500" }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <Icon className={`size-4 ${accent}`} />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
