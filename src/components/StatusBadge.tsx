import type { PropertyStatus } from "../types";

const ESTILOS: Record<PropertyStatus, string> = {
  Publicada: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  "No publicada": "bg-slate-200 text-slate-600 ring-slate-500/20",
  Reservada: "bg-sky-100 text-sky-700 ring-sky-600/20",
  "Vendida o Rentada": "bg-violet-100 text-violet-700 ring-violet-600/20",
  Suspendida: "bg-orange-100 text-orange-700 ring-orange-600/20",
};

export default function StatusBadge({ estatus }: { estatus: PropertyStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        ESTILOS[estatus] ?? ESTILOS["No publicada"]
      }`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {estatus}
    </span>
  );
}

/** Píldora que acompaña al estado cuando hay una solicitud de cambio pendiente. */
export function EnRevisionBadge({ destino }: { destino?: string }) {
  return (
    <span
      title={destino ? `Cambio solicitado: ${destino}` : "Cambio de estado en revisión"}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
      En revisión
    </span>
  );
}
