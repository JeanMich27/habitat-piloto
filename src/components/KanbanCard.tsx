import { GripVertical, Megaphone, Phone, Share2, Users } from "lucide-react";
import type { Lead, LeadOrigin, Propiedad } from "../types";

// Sin integraciones externas en el MVP: "origen" es un dato que el asesor
// captura a mano al dar de alta el lead, no algo que llega por webhook.
const ORIGEN_ESTILOS: Record<LeadOrigin, { clase: string; Icono: typeof Users }> = {
  Directo: { clase: "bg-green-50 text-green-700", Icono: Phone },
  Portal: { clase: "bg-indigo-50 text-indigo-700", Icono: Megaphone },
  Redes: { clase: "bg-rose-50 text-rose-700", Icono: Share2 },
  Referido: { clase: "bg-amber-50 text-amber-700", Icono: Users },
};

interface Props {
  lead: Lead;
  propiedad?: Propiedad;
}

export default function KanbanCard({ lead, propiedad }: Props) {
  const { clase, Icono } = ORIGEN_ESTILOS[lead.origen];

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/lead-id", lead.id)}
      className="group cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{lead.nombre}</p>
        <GripVertical className="size-4 shrink-0 text-slate-300 group-hover:text-slate-400" />
      </div>

      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
        <Phone className="size-3" /> {lead.telefono}
      </p>

      {propiedad && (
        <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
          Interés: {propiedad.titulo}
        </p>
      )}

      <p className="mt-2 line-clamp-2 text-xs italic text-slate-500">
        “{lead.nota}”
      </p>

      <div className="mt-3 flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${clase}`}
        >
          <Icono className="size-3" />
          {lead.origen}
        </span>
        <span className="text-[10px] text-slate-400">
          {new Date(lead.creado).toLocaleDateString("es-MX", {
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>
    </div>
  );
}
