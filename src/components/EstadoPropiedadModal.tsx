// Cambio de estado de una propiedad.
//
// Dos comportamientos según el rol (regla de negocio, ago 2026):
// - Broker y asesor independiente: aplican el cambio de inmediato.
// - Asesor de equipo: NO cambia el estado — lo SOLICITA. El botón envía la
//   solicitud a revisión; el broker recibe el aviso y, al aprobar, un trigger
//   en la base aplica el cambio automáticamente.
import { useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import type { PropertyStatus, Propiedad, SolicitudEstado, UserRole } from "../types";
import { ESTADOS_PROPIEDAD, solicitaCambioDeEstado } from "../types";
import GlassModal from "./GlassModal";
import StatusBadge, { EnRevisionBadge } from "./StatusBadge";

const MOTIVOS_CIERRE = [
  "Vendida en la plataforma",
  "Vendida fuera de la plataforma",
  "Rentada en la plataforma",
  "Rentada fuera de la plataforma",
  "Propietario retiró el inmueble",
  "Exclusiva vencida",
] as const;

interface Props {
  propiedad: Propiedad;
  rolUsuario: UserRole;
  /** Solicitud pendiente sobre esta propiedad, si existe. */
  solicitudPendiente?: SolicitudEstado | null;
  onCerrar: () => void;
  /** Broker / independiente: aplica el cambio. */
  onGuardar: (nuevoEstado: PropertyStatus, motivo?: string) => Promise<boolean>;
  /** Asesor de equipo: envía la solicitud a revisión. */
  onSolicitar?: (nuevoEstado: PropertyStatus, motivo?: string) => Promise<boolean>;
}

export default function EstadoPropiedadModal({
  propiedad,
  rolUsuario,
  solicitudPendiente,
  onCerrar,
  onGuardar,
  onSolicitar,
}: Props) {
  const esSolicitud = solicitaCambioDeEstado(rolUsuario);
  const opciones = ESTADOS_PROPIEDAD.filter((e) => e !== propiedad.estatus);
  const [nuevoEstado, setNuevoEstado] = useState<PropertyStatus>(opciones[0]);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const requiereMotivoCierre = nuevoEstado === "Vendida o Rentada";
  const puedeEnviar = !requiereMotivoCierre || motivo !== "";

  const enviar = async () => {
    setEnviando(true);
    const guardado = esSolicitud
      ? await onSolicitar?.(nuevoEstado, motivo || undefined)
      : await onGuardar(nuevoEstado, motivo || undefined);
    setEnviando(false);
    if (guardado) onCerrar();
  };

  return (
    <GlassModal
      titulo={esSolicitud ? "Solicitar cambio de estado" : "Cambiar estado"}
      subtitulo={propiedad.titulo}
      onCerrar={onCerrar}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span>Estado actual:</span>
        <StatusBadge estatus={propiedad.estatus} />
        {solicitudPendiente && <EnRevisionBadge destino={solicitudPendiente.estadoSolicitado} />}
      </div>

      {solicitudPendiente ? (
        <div className="mt-5 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Ya hay una solicitud en revisión: {solicitudPendiente.estadoActual} →{" "}
            {solicitudPendiente.estadoSolicitado}
          </p>
          <p className="mt-1 text-xs text-amber-800/80">
            El broker recibió la notificación. En cuanto la apruebe, el estado se
            actualizará automáticamente. No se puede enviar otra solicitud mientras tanto.
          </p>
        </div>
      ) : (
        <>
          <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Estado nuevo
          </label>
          <select
            value={nuevoEstado}
            onChange={(e) => {
              setNuevoEstado(e.target.value as PropertyStatus);
              setMotivo("");
            }}
            className="input mt-1.5"
          >
            {opciones.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>

          {requiereMotivoCierre ? (
            <>
              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Motivo del cierre
              </label>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input mt-1.5">
                <option value="">Selecciona un motivo…</option>
                {MOTIVOS_CIERRE.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Motivo <span className="font-normal normal-case text-slate-500">(opcional)</span>
              </label>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={
                  esSolicitud
                    ? "Ayuda al broker a decidir rápido, p. ej. “Cliente dejó apartado”"
                    : "Queda registrado en la cronología"
                }
                className="input mt-1.5"
              />
            </>
          )}

          {esSolicitud && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-violet-50/80 p-3 text-xs text-violet-900">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet-500" />
              Tu solicitud le llegará al broker como notificación. Al aprobarla, el
              cambio se aplica en automático y te avisamos del resultado.
            </p>
          )}

          <button
            disabled={!puedeEnviar || enviando}
            onClick={enviar}
            className={`mt-5 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${
              esSolicitud
                ? "bg-violet-600 shadow-md shadow-violet-300/60 enabled:hover:bg-violet-700"
                : "bg-slate-900 enabled:hover:bg-slate-700"
            }`}
          >
            {enviando ? (
              "Guardando…"
            ) : esSolicitud ? (
              <>
                <Send className="size-4" /> Enviar a revisión
              </>
            ) : (
              "Guardar estado"
            )}
          </button>
        </>
      )}
    </GlassModal>
  );
}
