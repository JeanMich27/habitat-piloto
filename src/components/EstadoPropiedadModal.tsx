import { useState } from "react";
import { X } from "lucide-react";
import type { PropertyStatus, Propiedad, UserRole } from "../types";
import StatusBadge from "./StatusBadge";

const MOTIVOS_CIERRE = [
  "Vendida en la plataforma",
  "Vendida fuera de la plataforma",
  "Propietario retiró el inmueble",
  "Exclusiva vencida",
] as const;

// Reglas de transición confirmadas en la especificación de pantallas:
// - De Intake solo se puede pasar a Validación.
// - De Validación a Activa solo lo puede hacer el Broker/Administrador.
// - Activa y Pausada pueden moverse entre sí o cerrarse.
// - Cerrada es un estado terminal en el MVP.
function opcionesDisponibles(estatus: PropertyStatus, rol: UserRole): PropertyStatus[] {
  switch (estatus) {
    case "Intake":
      return ["Validacion"];
    case "Validacion":
      return rol === "broker" ? ["Activa"] : [];
    case "Activa":
      return ["Pausada", "Cerrada"];
    case "Pausada":
      return ["Activa", "Cerrada"];
    case "Cerrada":
      return [];
  }
}

interface Props {
  propiedad: Propiedad;
  rolUsuario: UserRole;
  onCerrar: () => void;
  onGuardar: (nuevoEstado: PropertyStatus, motivo?: string) => void;
}

export default function EstadoPropiedadModal({ propiedad, rolUsuario, onCerrar, onGuardar }: Props) {
  const opciones = opcionesDisponibles(propiedad.estatus, rolUsuario);
  const [nuevoEstado, setNuevoEstado] = useState<PropertyStatus | "">(opciones[0] ?? "");
  const [motivo, setMotivo] = useState<string>("");

  const requiereMotivo = nuevoEstado === "Cerrada";
  const puedeGuardar = nuevoEstado !== "" && (!requiereMotivo || motivo !== "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Cambiar estado</h2>
            <p className="mt-0.5 text-sm text-slate-500">{propiedad.titulo}</p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <span>Estado actual:</span>
          <StatusBadge estatus={propiedad.estatus} />
        </div>

        {opciones.length === 0 ? (
          <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {propiedad.estatus === "Cerrada"
              ? "Esta propiedad está cerrada — es un estado final en el MVP."
              : "Solo el Broker/Administrador puede aprobar el paso de Validación a Activa."}
          </p>
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
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            >
              {opciones.map((o) => (
                <option key={o} value={o}>
                  {o === "Validacion" ? "En validación" : o}
                </option>
              ))}
            </select>

            {requiereMotivo && (
              <>
                <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Motivo de cierre
                </label>
                <select
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Selecciona un motivo…</option>
                  {MOTIVOS_CIERRE.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </>
            )}

            <button
              disabled={!puedeGuardar}
              onClick={() => onGuardar(nuevoEstado as PropertyStatus, motivo || undefined)}
              className="mt-6 w-full rounded-lg bg-slate-800 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Guardar estado
            </button>
          </>
        )}
      </div>
    </div>
  );
}
