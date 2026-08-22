import { useState } from "react";
import {
  Building2,
  Calendar,
  Check,
  Circle,
  Clock,
  MapPin,
} from "lucide-react";
import type { CitaAgenda, Lead, Propiedad } from "../types";
import { ETAPAS_CIERRE } from "../types";

type Tab = "proceso" | "documentos" | "citas";

const TABS: { key: Tab; label: string }[] = [
  { key: "proceso", label: "Mi Proceso" },
  { key: "documentos", label: "Documentos" },
  { key: "citas", label: "Citas" },
];

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

const ESTADO_DOC_ESTILO: Record<string, string> = {
  Pendiente: "bg-slate-100 text-slate-500",
  Cargado: "bg-sky-50 text-sky-700",
  Validado: "bg-emerald-50 text-emerald-700",
  Rechazado: "bg-rose-50 text-rose-700",
};

interface Props {
  lead: Lead;
  propiedad: Propiedad | undefined;
  citas: CitaAgenda[];
  onConfirmarCita: (leadId: string, citaId: string) => Promise<string | null>;
}

export default function ClientePortal({ lead, propiedad, citas, onConfirmarCita }: Props) {
  const [tab, setTab] = useState<Tab>("proceso");
  const [confirmandoCita, setConfirmandoCita] = useState(false);
  const [errorCita, setErrorCita] = useState<string | null>(null);

  const cierre = lead.cierre;

  if (!cierre) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 text-center text-slate-500">
        Este cliente todavía no tiene un proceso de cierre activo.
      </div>
    );
  }

  const docPendienteOReclamado = cierre.documentos.find(
    (d) => d.estado === "Pendiente" || d.estado === "Rechazado",
  );
  const citasDelLead = citas.filter((c) => c.leadId === lead.id);
  const proximaCita = citasDelLead
    .filter((c) => c.estado === "Agendada" || c.estado === "Confirmada")
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())[0];
  const historialCitas = citasDelLead.filter((c) =>
    ["Realizada", "No asistió", "Cancelada"].includes(c.estado),
  );

  const queSigue = docPendienteOReclamado
    ? {
        texto: `Te toca a ti: sube "${docPendienteOReclamado.nombre}"${docPendienteOReclamado.motivoRechazo ? ` (rechazado: ${docPendienteOReclamado.motivoRechazo})` : ""}.`,
        accion: () => {
          setTab("documentos");
        },
      }
    : cierre.etapaActual < ETAPAS_CIERRE.length - 1
      ? {
          texto: `Le toca a tu asesor: avanzar "${ETAPAS_CIERRE[cierre.etapaActual + 1]}".`,
          accion: null,
        }
      : { texto: "¡Proceso completo!", accion: null };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500">
            <Building2 className="size-5 text-white/70" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">{propiedad?.titulo ?? "Propiedad"}</h1>
            <p className="text-xs text-slate-500">
              {propiedad?.tipoOperacion === "Renta" ? "Proceso de renta" : "Proceso de compra"} · Hola,{" "}
              {lead.nombre.split(" ")[0]}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Mi Proceso */}
      {tab === "proceso" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <ol className="space-y-4">
              {ETAPAS_CIERRE.map((etapa, i) => {
                const estado = i < cierre.etapaActual ? "hecho" : i === cierre.etapaActual ? "actual" : "pendiente";
                return (
                  <li key={etapa} className="flex items-center gap-3">
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                        estado === "hecho"
                          ? "bg-emerald-500 text-white"
                          : estado === "actual"
                            ? "bg-amber-400 text-white"
                            : "bg-slate-100 text-slate-300"
                      }`}
                    >
                      {estado === "hecho" ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Circle className="size-2.5 fill-current" />
                      )}
                    </span>
                    <span
                      className={`text-sm ${
                        estado === "pendiente" ? "text-slate-500" : "font-medium text-slate-800"
                      }`}
                    >
                      {etapa}
                    </span>
                    {estado === "actual" && (
                      <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        En proceso
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Qué sigue</p>
            <p className="mt-1 text-sm text-slate-700">{queSigue.texto}</p>
            {queSigue.accion && (
              <button
                onClick={queSigue.accion}
                className="mt-2 text-xs font-semibold text-slate-800 underline"
              >
                Ir a Documentos
              </button>
            )}
          </div>
        </div>
      )}

      {/* Documentos */}
      {tab === "documentos" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <ul className="space-y-2">
            {cierre.documentos.map((d) => (
              <li key={d.nombre} className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{d.nombre}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_DOC_ESTILO[d.estado]}`}
                    >
                      {d.estado}
                    </span>
                    {(d.estado === "Pendiente" || d.estado === "Rechazado") && (
                      <button
                        disabled
                        title="Función todavía no disponible"
                        className="cursor-not-allowed rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500"
                      >
                        No disponible
                      </button>
                    )}
                  </div>
                </div>
                {d.estado === "Rechazado" && d.motivoRechazo && (
                  <p className="mt-1.5 text-xs text-rose-600">Motivo: {d.motivoRechazo}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Citas */}
      {tab === "citas" && (
        <div className="space-y-4">
          {proximaCita ? (
            <div className="rounded-xl border border-slate-300 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Próxima cita
              </p>
              <p className="mt-1 text-base font-bold text-slate-900">{proximaCita.titulo}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <Calendar className="size-4" /> {fmtFecha(proximaCita.inicio)} · {fmtHora(proximaCita.inicio)}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <MapPin className="size-4" /> {proximaCita.ubicacion}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={proximaCita.estado === "Confirmada" || confirmandoCita}
                  onClick={async () => {
                    setConfirmandoCita(true);
                    setErrorCita(null);
                    const error = await onConfirmarCita(lead.id, proximaCita.id);
                    setErrorCita(error);
                    setConfirmandoCita(false);
                  }}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {proximaCita.estado === "Confirmada"
                    ? "Confirmada ✓"
                    : confirmandoCita
                      ? "Confirmando…"
                      : "Confirmar asistencia"}
                </button>
                <button
                  disabled
                  title="Función todavía no disponible"
                  className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-400"
                >
                  Reagendar no disponible
                </button>
              </div>
              {errorCita && <p role="alert" className="mt-2 text-xs text-rose-600">{errorCita}</p>}
            </div>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
              No tienes citas próximas.
            </p>
          )}

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Historial
            </h2>
            {historialCitas.length === 0 ? (
              <p className="text-sm text-slate-500">Sin citas pasadas todavía.</p>
            ) : (
              <ul className="space-y-2">
                {historialCitas.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm"
                  >
                    <span className="text-slate-700">{c.titulo}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="size-3.5" /> {fmtFecha(c.inicio)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
