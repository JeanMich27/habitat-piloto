import { useEffect, useState } from "react";
import {
  ChevronDown,
  GripVertical,
  Megaphone,
  MessageCircle,
  Phone,
  Share2,
  Users,
} from "lucide-react";
import { ETAPAS_LEAD } from "../data/etapasLead";
import type { Lead, LeadOrigin, LeadStage, Propiedad } from "../types";

// Sin integraciones externas en el MVP: "origen" es un dato que el asesor
// captura a mano al dar de alta el lead, no algo que llega por webhook.
const ORIGEN_ESTILOS: Record<LeadOrigin, { clase: string; Icono: typeof Users }> = {
  Directo: { clase: "bg-green-50 text-green-700", Icono: Phone },
  Portal: { clase: "bg-indigo-50 text-indigo-700", Icono: Megaphone },
  Redes: { clase: "bg-rose-50 text-rose-700", Icono: Share2 },
  Referido: { clase: "bg-amber-50 text-amber-700", Icono: Users },
};

/**
 * ¿El dispositivo tiene un puntero preciso (mouse/trackpad)?
 *
 * La API de drag-and-drop de HTML5 simplemente no dispara eventos con el dedo:
 * ningún navegador móvil la implementa para touch. Por eso en teléfono y tablet
 * desactivamos el arrastre (si no, el usuario intenta arrastrar, la tarjeta no
 * se mueve y parece que la app está rota) y el cambio de etapa se hace con el
 * selector. En escritorio se conserva el arrastre de siempre.
 */
function usePunteroPreciso() {
  const [preciso, setPreciso] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    const actualizar = () => setPreciso(mq.matches);
    actualizar();
    mq.addEventListener("change", actualizar);
    return () => mq.removeEventListener("change", actualizar);
  }, []);

  return preciso;
}

interface Props {
  lead: Lead;
  propiedad?: Propiedad;
  onMoverEtapa: (leadId: string, etapa: LeadStage) => void;
}

export default function KanbanCard({ lead, propiedad, onMoverEtapa }: Props) {
  const { clase, Icono } = ORIGEN_ESTILOS[lead.origen];
  const arrastrable = usePunteroPreciso();

  return (
    <div
      draggable={arrastrable}
      onDragStart={(e) => e.dataTransfer.setData("text/lead-id", lead.id)}
      className={`group rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 ${
        arrastrable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{lead.nombre}</p>
        {arrastrable && (
          <GripVertical className="size-4 shrink-0 text-slate-300 group-hover:text-slate-500" />
        )}
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
        <span className="text-[10px] text-slate-500">
          {new Date(lead.creado).toLocaleDateString("es-MX", {
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>

      {/*
        Cambio de etapa con un toque. Es un <select> nativo a propósito: en el
        teléfono abre el selector del sistema operativo (cómodo y accesible) y
        no se recorta dentro del scroll horizontal del Kanban, como sí pasaría
        con un menú flotante propio.
      */}
      <div className="relative mt-3">
        <label htmlFor={`etapa-${lead.id}`} className="sr-only">
          Mover {lead.nombre} a otra etapa
        </label>
        <select
          id={`etapa-${lead.id}`}
          value={lead.etapa}
          onChange={(e) => onMoverEtapa(lead.id, e.target.value as LeadStage)}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 focus:border-slate-400 focus:outline-none"
        >
          {ETAPAS_LEAD.map((e) => (
            <option key={e.etapa} value={e.etapa}>
              {e.titulo}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
      </div>

      {/* Acción rápida: abre WhatsApp con el teléfono del lead. */}
      <a
        href={`https://wa.me/${lead.telefono.replace(/\D/g, "")}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 px-2 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
      >
        <MessageCircle className="size-3.5" /> Notificar por WhatsApp
      </a>
    </div>
  );
}
