// Cuestionario guiado de calificación (marco BANT).
//
// Principio de diseño: el asesor NO ve un formulario técnico. Ve cuatro
// preguntas de conversación, una por pantalla, con opciones en lenguaje
// normal. El puntaje se calcula solo y nunca se escribe a mano — por eso la
// calificación es objetiva: dos asesores que responden lo mismo obtienen
// forzosamente el mismo resultado.
//
// Las siglas BANT y los puntos por opción quedan ocultos a propósito: son
// ruido para quien está frente al cliente. El puntaje total sí se muestra,
// porque de él sale la acción siguiente.
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import type { CalificacionBANT, Lead, OpcionBant } from "../types";
import {
  ACCION_POR_CLASIFICACION,
  BANT_AUTORIDAD,
  BANT_NECESIDAD,
  BANT_PLAZO,
  BANT_PRESUPUESTO,
  clasificarLead,
  formatoMXN,
  puntajeBant,
} from "../types";

type Campo = "presupuesto" | "autoridad" | "necesidad" | "plazo";

interface Paso {
  campo: Campo;
  titulo: string;
  subtitulo: string;
  opciones: OpcionBant[];
}

// Las preguntas están redactadas como se las harías al cliente en voz alta.
const PASOS: Paso[] = [
  {
    campo: "presupuesto",
    titulo: "¿Cómo va a pagar la propiedad?",
    subtitulo: "Lo que buscamos saber es qué tan real y disponible es el dinero.",
    opciones: BANT_PRESUPUESTO,
  },
  {
    campo: "autoridad",
    titulo: "¿Quién toma la decisión final?",
    subtitulo: "Si la persona con la que hablas no firma, el cierre se alarga.",
    opciones: BANT_AUTORIDAD,
  },
  {
    campo: "necesidad",
    titulo: "¿Qué tan claro tiene lo que busca?",
    subtitulo: "Entre más específico, más fácil es hacer match con tu inventario.",
    opciones: BANT_NECESIDAD,
  },
  {
    campo: "plazo",
    titulo: "¿Cuándo necesita mudarse?",
    subtitulo: "La urgencia real es lo que separa a un comprador de un curioso.",
    opciones: BANT_PLAZO,
  },
];

const FORMAS_PAGO = [
  "Crédito hipotecario bancario",
  "Crédito Infonavit / Fovissste",
  "Contado",
  "Cofinanciamiento",
  "Aún no está definido",
];

const COLOR_CLASIFICACION = {
  Hot: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Warm: "bg-amber-50 text-amber-700 border-amber-200",
  Cold: "bg-slate-100 text-slate-600 border-slate-200",
} as const;

interface Props {
  lead: Lead;
  nombreAsesor: string;
  onCancelar: () => void;
  onGuardar: (bant: CalificacionBANT) => void;
}

export default function CalificarProspectoModal({
  lead,
  nombreAsesor,
  onCancelar,
  onGuardar,
}: Props) {
  const previa = lead.bant;
  const [paso, setPaso] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<Campo, string>>({
    presupuesto: previa?.presupuesto ?? "",
    autoridad: previa?.autoridad ?? "",
    necesidad: previa?.necesidad ?? "",
    plazo: previa?.plazo ?? "",
  });
  const [montoMaximo, setMontoMaximo] = useState(
    previa?.montoMaximo ? String(previa.montoMaximo) : "",
  );
  const [formaPago, setFormaPago] = useState(previa?.formaPago ?? "");
  const [quienMasDecide, setQuienMasDecide] = useState(previa?.quienMasDecide ?? "");
  const [requisitos, setRequisitos] = useState(previa?.requisitos ?? "");
  const [observaciones, setObservaciones] = useState(previa?.observaciones ?? "");

  const enResumen = paso === PASOS.length;
  const pasoActual = PASOS[paso];
  const completo = PASOS.every((p) => respuestas[p.campo] !== "");

  const borrador: CalificacionBANT = useMemo(
    () => ({
      ...respuestas,
      montoMaximo: Number(montoMaximo.replace(/[^\d.]/g, "")) || undefined,
      formaPago: formaPago || undefined,
      quienMasDecide: quienMasDecide || undefined,
      requisitos: requisitos || undefined,
      observaciones: observaciones || undefined,
      calificadoPor: nombreAsesor,
      calificadoEl: new Date().toISOString(),
    }),
    [respuestas, montoMaximo, formaPago, quienMasDecide, requisitos, observaciones, nombreAsesor],
  );

  const desglose = puntajeBant(borrador);
  const total = desglose.presupuesto + desglose.autoridad + desglose.necesidad + desglose.plazo;
  const clasificacion = clasificarLead(total);
  const accion = ACCION_POR_CLASIFICACION[clasificacion];

  const elegir = (campo: Campo, valor: string) => {
    setRespuestas((prev) => ({ ...prev, [campo]: valor }));
    // Avanza solo: un toque por pregunta, sin botón "siguiente".
    window.setTimeout(() => setPaso((p) => Math.min(p + 1, PASOS.length)), 180);
  };

  // Campo de apoyo que aparece debajo de las opciones de cada pregunta.
  const apoyo = () => {
    switch (pasoActual?.campo) {
      case "presupuesto":
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                ¿Hasta cuánto puede pagar? (opcional)
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-slate-500">
                <span className="text-sm text-slate-400">$</span>
                <input
                  inputMode="decimal"
                  value={montoMaximo}
                  onChange={(e) => setMontoMaximo(e.target.value)}
                  placeholder="3000000"
                  className="w-full py-2 text-sm text-slate-900 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                ¿Con qué lo va a pagar? (opcional)
              </label>
              <select
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
              >
                <option value="">Selecciona…</option>
                {FORMAS_PAGO.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      case "autoridad":
        return (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              ¿Quién más participa en la decisión? (opcional)
            </label>
            <input
              value={quienMasDecide}
              onChange={(e) => setQuienMasDecide(e.target.value)}
              placeholder="Ej. su esposo Carlos, su socio, su mamá"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>
        );
      case "necesidad":
        return (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              ¿Qué no puede faltar? (opcional)
            </label>
            <input
              value={requisitos}
              onChange={(e) => setRequisitos(e.target.value)}
              placeholder="Ej. 3 recámaras, estacionamiento techado, zona Satélite"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-slate-900">
              Calificar a {lead.nombre}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {enResumen
                ? "Revisa el resultado antes de guardar"
                : `Pregunta ${paso + 1} de ${PASOS.length}`}
            </p>
          </div>
          <button
            onClick={onCancelar}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Progreso */}
        <div className="flex gap-1 px-5 pt-3">
          {PASOS.map((p, i) => (
            <div
              key={p.campo}
              className={`h-1 flex-1 rounded-full ${
                respuestas[p.campo] ? "bg-slate-900" : i === paso ? "bg-slate-400" : "bg-slate-200"
              }`}
            />
          ))}
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!enResumen ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{pasoActual.titulo}</h3>
                <p className="mt-1 text-sm text-slate-500">{pasoActual.subtitulo}</p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {pasoActual.opciones.map((o) => {
                  const activa = respuestas[pasoActual.campo] === o.valor;
                  return (
                    <button
                      key={o.valor}
                      onClick={() => elegir(pasoActual.campo, o.valor)}
                      className={`rounded-xl border p-4 text-left transition ${
                        activa
                          ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                          : "border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                            activa ? "border-slate-900 bg-slate-900" : "border-slate-300"
                          }`}
                        >
                          {activa && <Check className="size-2.5 text-white" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">
                            {o.etiqueta}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">{o.ayuda}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {apoyo()}
            </div>
          ) : (
            /* ---------- Resumen ---------- */
            <div className="space-y-4">
              <div
                className={`rounded-xl border p-4 ${COLOR_CLASIFICACION[clasificacion]}`}
              >
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                      Resultado
                    </p>
                    <p className="text-3xl font-black">{total}/100</p>
                  </div>
                  <span className="rounded-full bg-white/70 px-3 py-1 text-sm font-bold">
                    {clasificacion} · {accion.titulo}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium">{accion.accion}</p>
              </div>

              <div className="space-y-2">
                {PASOS.map((p) => {
                  const opcion = p.opciones.find((o) => o.valor === respuestas[p.campo]);
                  const puntos = desglose[p.campo];
                  const max = Math.max(...p.opciones.map((o) => o.puntos));
                  return (
                    <button
                      key={p.campo}
                      onClick={() => setPaso(PASOS.indexOf(p))}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-slate-400"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs text-slate-500">{p.titulo}</span>
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {opcion?.etiqueta ?? "Sin responder"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-bold text-slate-500">
                        {puntos}/{max}
                      </span>
                    </button>
                  );
                })}
              </div>

              {(borrador.montoMaximo || formaPago || quienMasDecide || requisitos) && (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  {borrador.montoMaximo ? (
                    <p>
                      <span className="font-semibold">Puede pagar hasta:</span>{" "}
                      {formatoMXN(borrador.montoMaximo)}
                    </p>
                  ) : null}
                  {formaPago && (
                    <p>
                      <span className="font-semibold">Forma de pago:</span> {formaPago}
                    </p>
                  )}
                  {quienMasDecide && (
                    <p>
                      <span className="font-semibold">También decide:</span> {quienMasDecide}
                    </p>
                  )}
                  {requisitos && (
                    <p>
                      <span className="font-semibold">No puede faltar:</span> {requisitos}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Tus conclusiones (opcional)
                </label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={3}
                  placeholder="Lo que notaste y no cabe en las opciones de arriba."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <button
            onClick={() => (paso === 0 ? onCancelar() : setPaso((p) => p - 1))}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="size-4" /> {paso === 0 ? "Cancelar" : "Atrás"}
          </button>

          {!enResumen ? (
            <button
              onClick={() => setPaso((p) => p + 1)}
              disabled={!respuestas[pasoActual.campo]}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Siguiente <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              onClick={() => onGuardar(borrador)}
              disabled={!completo}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Guardar calificación ({total} pts)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
