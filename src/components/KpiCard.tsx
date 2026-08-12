// Tarjeta métrica modular del rediseño: neumórfica, sin marcos pesados,
// con el icono grande dentro de un contenedor circular pastel.
// Si recibe onClick se vuelve interactiva (abre su glass modal de detalle).
import { ChevronRight, type LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  /** clase de color del ícono, ej. "text-emerald-600" */
  accent?: string;
  /** clase de fondo pastel del círculo, ej. "bg-emerald-100" */
  circulo?: string;
  /** al tocar la tarjeta emerge su detalle en GlassModal */
  onClick?: () => void;
}

// Componente de Design System reutilizado en los 5 dashboards (Broker,
// Asesor Independiente, Asesor de Equipo, Propietario, Cliente).
export default function KpiCard({
  label,
  value,
  icon: Icon,
  accent = "text-slate-500",
  circulo = "bg-slate-100",
  onClick,
}: Props) {
  const contenido = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${circulo}`}>
          <Icon className={`size-5 ${accent}`} />
        </span>
        {onClick && <ChevronRight className="size-4 text-slate-300" />}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{label}</p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="neu flex flex-col gap-3 p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0"
      >
        {contenido}
      </button>
    );
  }
  return <div className="neu flex flex-col gap-3 p-4">{contenido}</div>;
}
