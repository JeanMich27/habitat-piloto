import { useState, type ReactNode } from "react";
import type { LeadStage } from "../types";

interface Props {
  titulo: string;
  etapa: LeadStage;
  acento: string; // clase de Tailwind para la barra superior, ej. "bg-blue-500"
  cantidad: number;
  onDropLead: (leadId: string, etapa: LeadStage) => void;
  children: ReactNode;
}

export default function KanbanColumn({
  titulo,
  etapa,
  acento,
  cantidad,
  onDropLead,
  children,
}: Props) {
  const [sobre, setSobre] = useState(false);

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        const leadId = e.dataTransfer.getData("text/lead-id");
        if (leadId) onDropLead(leadId, etapa);
      }}
      className={`flex min-h-[24rem] w-[85vw] max-w-xs shrink-0 snap-start flex-col rounded-xl border bg-white transition sm:w-72 ${
        sobre ? "border-slate-400 ring-2 ring-slate-200" : "border-slate-200"
      }`}
    >
      <div className={`h-1 rounded-t-xl ${acento}`} />
      <header className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">{titulo}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {cantidad}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
        {children}
        {cantidad === 0 && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Sin leads en esta etapa.
            <span className="mt-1 block">
              Cambia la etapa desde la tarjeta del lead.
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
