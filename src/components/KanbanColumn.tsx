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
      className={`flex min-h-[24rem] w-72 shrink-0 flex-col rounded-xl border bg-slate-50 transition ${
        sobre ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200"
      }`}
    >
      <div className={`h-1.5 rounded-t-xl ${acento}`} />
      <header className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">{titulo}</h3>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {cantidad}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
        {children}
        {cantidad === 0 && (
          <p className="mt-4 text-center text-xs text-slate-400">
            Arrastra un lead aquí
          </p>
        )}
      </div>
    </section>
  );
}
