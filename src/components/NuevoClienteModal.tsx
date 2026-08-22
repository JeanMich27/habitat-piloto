// Alta rápida de cliente.
//
// Solo el nombre es obligatorio. Todo lo demás se puede llenar después desde
// su ficha. Pedir diez campos en el alta es la forma más común de que un
// asesor prefiera anotar el dato en su celular y nunca capturarlo.
import { useState } from "react";
import { X } from "lucide-react";
import type { Lead, LeadOrigin, Propiedad } from "../types";
import { formatoMXN } from "../types";
import { useDialogoAccesible } from "../lib/modal";

const ORIGENES: LeadOrigin[] = ["Directo", "Portal", "Redes", "Referido"];

interface Props {
  propiedades: Propiedad[];
  asesorId: string;
  onCancelar: () => void;
  onGuardar: (lead: Lead) => Promise<boolean>;
}

export default function NuevoClienteModal({
  propiedades,
  asesorId,
  onCancelar,
  onGuardar,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [ocupacion, setOcupacion] = useState("");
  const [propiedadId, setPropiedadId] = useState("");
  const [origen, setOrigen] = useState<LeadOrigin>("Directo");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const valido = nombre.trim().length > 1;

  useDialogoAccesible(onCancelar);

  const guardar = async () => {
    if (!valido) return;
    setGuardando(true);
    await onGuardar({
      id: `lead-${Date.now()}`,
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      correo: correo.trim().toLowerCase(),
      etapa: "Nuevo",
      origen,
      interesPropiedadId: propiedadId,
      asesorId,
      creado: new Date().toISOString(),
      nota: nota.trim(),
      ocupacion: ocupacion.trim() || undefined,
      historial: [],
    });
    setGuardando(false);
  };

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo cliente"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Nuevo cliente</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Solo el nombre es obligatorio. Lo demás lo puedes completar después.
            </p>
          </div>
          <button
            onClick={onCancelar}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
          <div>
            <label htmlFor="cliente-nombre" className="mb-1 block text-xs font-semibold text-slate-600">
              Nombre completo *
            </label>
            <input
              id="cliente-nombre"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Claudia Reynoso"
              className={input}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cliente-telefono" className="mb-1 block text-xs font-semibold text-slate-600">
                Teléfono (WhatsApp)
              </label>
              <input
                id="cliente-telefono"
                inputMode="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="55 1234 5678"
                className={input}
              />
            </div>
            <div>
              <label htmlFor="cliente-correo" className="mb-1 block text-xs font-semibold text-slate-600">Correo</label>
              <input
                id="cliente-correo"
                inputMode="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="cliente@correo.com"
                className={input}
              />
            </div>
          </div>

          <div>
            <label htmlFor="cliente-propiedad" className="mb-1 block text-xs font-semibold text-slate-600">
              ¿Qué propiedad le interesa?
            </label>
            <select
              id="cliente-propiedad"
              value={propiedadId}
              onChange={(e) => setPropiedadId(e.target.value)}
              className={input}
            >
              <option value="">Todavía no lo sé</option>
              {propiedades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo} — {formatoMXN(p.precio)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cliente-origen" className="mb-1 block text-xs font-semibold text-slate-600">
                ¿Cómo llegó?
              </label>
              <select
                id="cliente-origen"
                value={origen}
                onChange={(e) => setOrigen(e.target.value as LeadOrigin)}
                className={input}
              >
                {ORIGENES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cliente-ocupacion" className="mb-1 block text-xs font-semibold text-slate-600">
                A qué se dedica
              </label>
              <input
                id="cliente-ocupacion"
                value={ocupacion}
                onChange={(e) => setOcupacion(e.target.value)}
                placeholder="Ej. Médica especialista"
                className={input}
              />
            </div>
          </div>

          <div>
            <label htmlFor="cliente-nota" className="mb-1 block text-xs font-semibold text-slate-600">
              Nota inicial
            </label>
            <textarea
              id="cliente-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder="Lo que te dijo al contactarte."
              className={input}
            />
          </div>

          <p className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            Entra como <span className="font-semibold">Nuevo</span>. Para moverlo a Visitado o más
            adelante primero tendrás que calificarlo — son cuatro preguntas.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            onClick={onCancelar}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
          disabled={guardando || !valido}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
          {guardando ? "Guardando…" : "Guardar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}
