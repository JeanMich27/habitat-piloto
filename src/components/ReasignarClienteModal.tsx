import { useEffect, useMemo, useState } from "react";
import type { AsignacionLead, Lead, Usuario } from "../types";

interface Props {
  lead: Lead;
  usuarios: Usuario[];
  onCerrar: () => void;
  onConfirmar: (input: { leadId: string; nuevoAsesorId: string; motivo: string; version?: number }) => Promise<boolean>;
  onCargarHistorial: (leadId: string) => Promise<AsignacionLead[]>;
}

const fecha = (iso: string) => new Date(iso).toLocaleString("es-MX", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export default function ReasignarClienteModal({
  lead, usuarios, onCerrar, onConfirmar, onCargarHistorial,
}: Props) {
  const asesores = useMemo(() => usuarios.filter((user) =>
    user.estadoCuenta === "Activo"
    && (user.rol === "asesor_equipo" || user.rol === "asesor_independiente")
    && user.id !== lead.asesorId), [usuarios, lead.asesorId]);
  const [destinoId, setDestinoId] = useState(asesores[0]?.id ?? "");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<AsignacionLead[]>([]);

  const nombreDe = (id?: string) => usuarios.find((user) => user.id === id)?.nombre ?? "Sin registro";

  useEffect(() => {
    let activo = true;
    void onCargarHistorial(lead.id).then((items) => activo && setHistorial(items));
    return () => { activo = false; };
  }, [lead.id, onCargarHistorial]);

  const confirmar = async () => {
    if (!destinoId || !motivo.trim()) {
      setError("Selecciona un asesor activo y escribe el motivo del cambio.");
      return;
    }
    setGuardando(true);
    setError(null);
    const ok = await onConfirmar({
      leadId: lead.id,
      nuevoAsesorId: destinoId,
      motivo: motivo.trim(),
      version: lead.version,
    });
    setGuardando(false);
    if (ok) onCerrar();
    else setError("No se pudo completar la reasignación. Recarga la ficha e inténtalo de nuevo.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-reasignar-cliente">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <h2 id="titulo-reasignar-cliente" className="text-xl font-bold text-slate-950">Reasignar responsable</h2>
        <p className="mt-1 text-sm text-slate-500">{lead.nombre}</p>

        <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <p><span className="block text-xs font-semibold text-slate-400">Captado por</span><strong className="text-slate-800">{nombreDe(lead.captadoPorId ?? lead.asesorId)}</strong></p>
          <p><span className="block text-xs font-semibold text-slate-400">Responsable actual</span><strong className="text-slate-800">{nombreDe(lead.asesorId)}</strong></p>
        </div>

        <p className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500">
          Los datos de asignación son internos de la plataforma y no se exponen a servicios externos.
        </p>

        {asesores.length === 0 ? (
          <p role="alert" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No hay otro asesor activo disponible. Activa o invita a un asesor antes de reasignar este cliente.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">Nuevo responsable
              <select value={destinoId} onChange={(event) => setDestinoId(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                {asesores.map((user) => <option key={user.id} value={user.id}>{user.nombre}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">Motivo del cambio
              <textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} maxLength={500} rows={3} placeholder="Ej. redistribución de carga, zona o disponibilidad" className="mt-1 block w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <p className="text-xs text-slate-500">Se transferirán los seguimientos pendientes y las citas futuras. La actividad ya realizada conservará su autor.</p>
          </div>
        )}

        {historial.length > 0 && (
          <details className="mt-5 rounded-2xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Historial de asignaciones ({historial.length})</summary>
            <ol className="mt-3 space-y-3">
              {historial.map((item) => (
                <li key={item.id} className="border-l-2 border-violet-200 pl-3 text-xs text-slate-600">
                  <p><strong>{nombreDe(item.asesorAnteriorId)}</strong> → <strong>{nombreDe(item.asesorNuevoId)}</strong></p>
                  <p className="mt-1">{item.motivo}</p>
                  <p className="mt-1 text-slate-400">{fecha(item.creadoEn)} · {nombreDe(item.reasignadoPorId)}</p>
                </li>
              ))}
            </ol>
          </details>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={guardando || asesores.length === 0 || !destinoId || !motivo.trim()} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:bg-slate-300">{guardando ? "Reasignando…" : "Confirmar reasignación"}</button>
        </div>
      </div>
    </div>
  );
}
