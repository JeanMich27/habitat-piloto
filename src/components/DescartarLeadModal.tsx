// Cerrar un lead que ya no va a llegar a nada.
//
// PRINCIPIO: descartar tiene que ser MÁS BARATO que ignorar. Si cerrar un lead
// cuesta más esfuerzo que dejarlo pudriéndose en "Nuevo", el asesor lo deja —
// y la lista de pendientes deja de significar algo. Por eso son dos toques:
// familia y motivo. Nada obligatorio más.
//
// El motivo es catálogo cerrado, no texto libre. Un campo abierto produce
// cuarenta maneras de escribir "no contestó" y ningún dato que se pueda sumar.
// Cerrado, contesta la única pregunta que le importa a marketing: ¿por qué se
// nos cae la gente, y es culpa del anuncio o del seguimiento?
import { useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import {
  FAMILIAS_PERDIDA,
  MOTIVOS_PERDIDA,
  type FamiliaPerdida,
  type Lead,
} from "../types";

export interface ResultadoDescarte {
  familia: FamiliaPerdida;
  motivo: string;
  detalle?: string;
}

interface Props {
  lead: Lead;
  onCancelar: () => void;
  onDescartar: (r: ResultadoDescarte) => void;
}

export default function DescartarLeadModal({ lead, onCancelar, onDescartar }: Props) {
  const [familia, setFamilia] = useState<FamiliaPerdida | null>(null);
  const [motivo, setMotivo] = useState<string>("");
  const [detalle, setDetalle] = useState("");

  const motivos = MOTIVOS_PERDIDA.filter((m) => m.familia === familia);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-slate-900">
              Cerrar a {lead.nombre}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {familia ? "¿Cuál fue el motivo exacto?" : "¿Qué pasó con este prospecto?"}
            </p>
          </div>
          <button
            onClick={onCancelar}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-5">
          {!familia
            ? FAMILIAS_PERDIDA.map((f) => (
                <button
                  key={f.familia}
                  onClick={() => setFamilia(f.familia)}
                  className="w-full rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-400"
                >
                  <span className="block text-sm font-semibold text-slate-900">{f.familia}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{f.ayuda}</span>
                </button>
              ))
            : (
              <>
                {motivos.map((m) => (
                  <button
                    key={m.valor}
                    onClick={() => setMotivo(m.valor)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      motivo === m.valor
                        ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                        : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{m.etiqueta}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{m.ayuda}</span>
                  </button>
                ))}
                <div className="pt-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    ¿Algo que valga la pena recordar? (opcional)
                  </label>
                  <textarea
                    value={detalle}
                    onChange={(e) => setDetalle(e.target.value)}
                    rows={2}
                    placeholder="Ej. dijo que lo retoma en enero cuando le autoricen el crédito."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                  />
                </div>
              </>
            )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <button
            onClick={() => (familia ? (setFamilia(null), setMotivo("")) : onCancelar())}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="size-4" /> {familia ? "Atrás" : "Cancelar"}
          </button>
          <button
            onClick={() =>
              familia && motivo && onDescartar({ familia, motivo, detalle: detalle || undefined })
            }
            disabled={!familia || !motivo}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            Cerrar prospecto
          </button>
        </div>

        <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
          Cerrarlo no lo borra: sale de tus pendientes y del tablero, pero sigue en
          Clientes y se puede reactivar en un toque.
        </p>
      </div>
    </div>
  );
}
