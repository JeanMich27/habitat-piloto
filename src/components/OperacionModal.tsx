import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, X } from "lucide-react";
import type { Lead, Operacion, Propiedad, TipoOperacion } from "../types";
import type {
  ReportarOperacionInput,
  ResolverOperacionInput,
} from "../repositories/operationsRepository";

type Props =
  | {
      modo: "reportar";
      lead: Lead;
      propiedades: Propiedad[];
      operacion?: Operacion;
      onCerrar: () => void;
      onEnviar: (input: ReportarOperacionInput) => Promise<boolean>;
    }
  | {
      modo: "validar";
      lead: Lead;
      propiedades: Propiedad[];
      operacion: Operacion;
      onCerrar: () => void;
      onEnviar: (input: ResolverOperacionInput) => Promise<boolean>;
    };

const numeroOpcional = (value: string) => value.trim() === "" ? undefined : Number(value);
const fechaLocal = (iso?: string) => iso?.slice(0, 10) ?? "";

export default function OperacionModal(props: Props) {
  const { lead, propiedades, operacion } = props;
  const [propiedadId, setPropiedadId] = useState(
    operacion?.propiedadId ?? (propiedades.some((p) => p.id === lead.interesPropiedadId) ? lead.interesPropiedadId : ""),
  );
  const [referencia, setReferencia] = useState(operacion?.propiedadReferencia ?? "");
  const propiedad = propiedades.find((item) => item.id === propiedadId);
  const [tipo, setTipo] = useState<TipoOperacion | "">(
    operacion?.tipoOperacion ?? propiedad?.tipoOperacion ?? "",
  );
  const [fecha, setFecha] = useState(
    fechaLocal(operacion?.fechaCierre) || (props.modo === "validar" ? new Date().toISOString().slice(0, 10) : ""),
  );
  const [monto, setMonto] = useState(operacion?.montoFinal?.toString() ?? "");
  const [comision, setComision] = useState(operacion?.comisionBrutaConfirmada?.toString() ?? "");
  const [comentario, setComentario] = useState(
    props.modo === "validar" ? operacion?.observacionBroker ?? "" : operacion?.comentarioAsesor ?? "",
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarDetalles, setMostrarDetalles] = useState(
    props.modo === "validar" || Boolean(operacion?.observacionBroker),
  );

  useEffect(() => {
    const selected = propiedades.find((item) => item.id === propiedadId);
    if (!tipo && selected?.tipoOperacion) setTipo(selected.tipoOperacion);
  }, [propiedadId, propiedades, tipo]);

  const enviar = async (resultado?: "validada" | "devuelta") => {
    if (props.modo === "validar" && resultado === "validada" && !tipo) {
      setError("Confirma si la operación fue venta o renta.");
      return;
    }
    if (props.modo === "validar" && resultado === "devuelta" && !comentario.trim()) {
      setError("Explica qué debe corregir el asesor.");
      return;
    }
    if ((monto && Number(monto) < 0) || (comision && Number(comision) < 0)) {
      setError("Los importes no pueden ser negativos.");
      return;
    }
    setGuardando(true);
    setError(null);
    const ok = props.modo === "reportar"
      ? await props.onEnviar({
          leadId: lead.id,
          propiedadId: propiedadId || undefined,
          propiedadReferencia: propiedadId ? undefined : referencia.trim() || undefined,
          crmPropiedadId: propiedadId ? propiedad?.crmIdInterno : undefined,
          tipoOperacion: tipo || undefined,
          fechaCierre: fecha ? new Date(`${fecha}T12:00:00`).toISOString() : undefined,
          montoFinal: numeroOpcional(monto),
          moneda: "MXN",
          comisionBrutaConfirmada: numeroOpcional(comision),
          comentario: comentario.trim() || undefined,
        })
      : await props.onEnviar({
          operacionId: operacion!.id,
          resultado: resultado!,
          observacion: comentario.trim() || undefined,
          tipoOperacion: tipo || undefined,
          fechaCierre: fecha ? new Date(`${fecha}T12:00:00`).toISOString() : undefined,
          montoFinal: numeroOpcional(monto),
          moneda: "MXN",
          comisionBrutaConfirmada: numeroOpcional(comision),
          propiedadId: propiedadId || undefined,
          propiedadReferencia: propiedadId ? undefined : referencia.trim() || undefined,
          crmPropiedadId: propiedadId ? propiedad?.crmIdInterno : undefined,
        });
    setGuardando(false);
    if (ok) props.onCerrar();
  };

  const esValidacion = props.modo === "validar";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-operacion">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-5 sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">
              {esValidacion ? "Validación del broker" : "Cierre en revisión"}
            </p>
            <h2 id="titulo-operacion" className="mt-1 text-xl font-bold text-slate-950">
              {esValidacion ? "Revisar operación" : "Reportar operación cerrada"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{lead.nombre}</p>
          </div>
          <button onClick={props.onCerrar} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          {!esValidacion && (
            <>
              <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
                Con esto basta para avisar al broker. Puedes enviar ahora o agregar los datos que ya conozcas.
              </div>
              {!mostrarDetalles && (
                <button
                  type="button"
                  onClick={() => setMostrarDetalles(true)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Agregar datos del cierre <span className="flex items-center gap-1 font-normal text-slate-500">Opcional <ChevronDown className="size-4" /></span>
                </button>
              )}
            </>
          )}
          {esValidacion && operacion?.comentarioAsesor && (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <span className="font-semibold">Comentario del asesor:</span> {operacion.comentarioAsesor}
            </div>
          )}

          {(esValidacion || mostrarDetalles) && <><label className="block text-sm font-semibold text-slate-700">
            Propiedad de la oficina <span className="font-normal text-slate-400">(opcional)</span>
            <select value={propiedadId} onChange={(event) => setPropiedadId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
              <option value="">No está en HomeID / usar referencia externa</option>
              {propiedades.map((item) => <option key={item.id} value={item.id}>{item.titulo}</option>)}
            </select>
          </label>
          {!propiedadId && (
            <label className="block text-sm font-semibold text-slate-700">
              Referencia externa <span className="font-normal text-slate-400">(opcional)</span>
              <input value={referencia} onChange={(event) => setReferencia(event.target.value)} placeholder="Dirección, folio o nombre de la propiedad" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              Venta o renta {esValidacion ? <span className="text-rose-600">*</span> : <span className="font-normal text-slate-400">(opcional)</span>}
              <select value={tipo} onChange={(event) => setTipo(event.target.value as TipoOperacion | "")} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal">
                <option value="">Por confirmar</option>
                <option value="Venta">Venta</option>
                <option value="Renta">Renta</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Fecha de cierre <span className="font-normal text-slate-400">(opcional)</span>
              <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Importe final <span className="font-normal text-slate-400">(opcional)</span>
              <input type="number" min="0" step="0.01" value={monto} onChange={(event) => setMonto(event.target.value)} placeholder="MXN" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Comisión bruta confirmada <span className="font-normal text-slate-400">(opcional)</span>
              <input type="number" min="0" step="0.01" value={comision} onChange={(event) => setComision(event.target.value)} placeholder="Pendiente" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
            </label>
          </div>

          <label className="block text-sm font-semibold text-slate-700">
            {esValidacion ? "Observación para el asesor" : "Comentario"} <span className="font-normal text-slate-400">{esValidacion ? "(obligatoria si devuelves)" : "(opcional)"}</span>
            <textarea value={comentario} onChange={(event) => setComentario(event.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 font-normal" />
          </label>
          </>}

          {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button onClick={props.onCerrar} disabled={guardando} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button>
            {esValidacion && (
              <button onClick={() => void enviar("devuelta")} disabled={guardando} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 disabled:opacity-50">Devolver para corregir</button>
            )}
            <button onClick={() => void enviar(esValidacion ? "validada" : undefined)} disabled={guardando} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              <CheckCircle2 className="size-4" />
              {guardando ? "Guardando…" : esValidacion ? "Validar operación" : "Enviar al broker"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
