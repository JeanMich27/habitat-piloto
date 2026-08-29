import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import type { ProgramarSeguimientoInput } from "../app/application/taskActions";
import type { Lead, Tarea } from "../types";

interface Props {
  lead: Lead;
  tarea?: Tarea;
  onCerrar: () => void;
  onGuardar: (input: ProgramarSeguimientoInput) => Promise<boolean>;
}

const valorLocal = (iso?: string) => {
  const fecha = iso ? new Date(iso) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export default function ProgramarSeguimientoModal({ lead, tarea, onCerrar, onGuardar }: Props) {
  const [titulo, setTitulo] = useState(tarea?.titulo ?? "Llamar al cliente");
  const [venceEn, setVenceEn] = useState(valorLocal(tarea?.venceEn));
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!titulo.trim() || !venceEn) return;
    setGuardando(true);
    const ok = await onGuardar({
      leadId: lead.id,
      asesorId: lead.asesorId,
      titulo: titulo.trim(),
      venceEn: new Date(venceEn).toISOString(),
    });
    setGuardando(false);
    if (ok) onCerrar();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-seguimiento">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="flex size-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><CalendarClock className="size-5" /></span>
            <h2 id="titulo-seguimiento" className="mt-3 text-xl font-bold text-slate-950">Programar seguimiento</h2>
            <p className="mt-1 text-sm text-slate-500">Define el siguiente paso para {lead.nombre}.</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="size-5" /></button>
        </div>

        <label className="mt-6 block text-sm font-semibold text-slate-700">
          Qué debes hacer
          <select value={titulo} onChange={(e) => setTitulo(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100">
            <option>Llamar al cliente</option>
            <option>Escribir por WhatsApp</option>
            <option>Enviar propiedades</option>
            <option>Confirmar visita</option>
            <option>Preparar propuesta</option>
            <option>Retomar negociación</option>
          </select>
        </label>
        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Fecha y hora
          <input type="datetime-local" value={venceEn} onChange={(e) => setVenceEn(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !titulo.trim() || !venceEn} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{guardando ? "Guardando…" : tarea ? "Actualizar" : "Programar"}</button>
        </div>
      </div>
    </div>
  );
}
