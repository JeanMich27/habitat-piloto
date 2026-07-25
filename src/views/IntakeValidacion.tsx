import { useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  Inbox,
  Send,
  X,
  XCircle,
} from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import type { DocumentName, Propiedad, Usuario } from "../types";
import { formatoMXN } from "../types";

interface Props {
  propiedades: Propiedad[];
  usuarios: Usuario[];
  onEnviarValidacion: (propiedadId: string) => void;
  onToggleDocumento: (propiedadId: string, documento: DocumentName) => void;
  onActivar: (propiedadId: string) => void;
}

export default function IntakeValidacion({
  propiedades,
  usuarios,
  onEnviarValidacion,
  onToggleDocumento,
  onActivar,
}: Props) {
  const [verificandoId, setVerificandoId] = useState<string | null>(null);

  // Solo Intake/Validación — Pausada y Cerrada NO deben volver a esta bandeja
  // (Cerrada es un estado terminal en el MVP; si entrara aquí, "Verificar
  // Documentos" la reactivaría con un clic sin pasar por ninguna regla).
  const bandeja = propiedades.filter((p) => p.estatus === "Intake" || p.estatus === "Validacion");
  const verificando = propiedades.find((p) => p.id === verificandoId);
  const nombreAsesor = (id: string) =>
    usuarios.find((u) => u.id === id)?.nombre ?? "Sin asignar";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Inbox className="size-5 text-slate-600" />
            Bandeja de Intake y Validación
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Los asesores registran la captación · Jean (Broker/Administrador)
            valida los documentos legales antes de publicar
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="rounded-lg bg-amber-50 px-3 py-1.5 font-medium text-amber-700 ring-1 ring-amber-200">
            {bandeja.filter((p) => p.estatus === "Intake").length} en Intake
          </span>
          <span className="rounded-lg bg-sky-50 px-3 py-1.5 font-medium text-sky-700 ring-1 ring-sky-200">
            {bandeja.filter((p) => p.estatus === "Validacion").length} en
            Validación
          </span>
        </div>
      </header>

      {/* Tabla de propiedades captadas */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Propiedad</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Asesor</th>
              <th className="px-4 py-3">Documentos</th>
              <th className="px-4 py-3">Estatus</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bandeja.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-800">{p.titulo}</p>
                  <p className="text-xs text-slate-500">{p.ubicacion}</p>
                </td>
                <td className="px-4 py-3 font-medium text-slate-700">
                  {formatoMXN(p.precio)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {nombreAsesor(p.asesorId)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    {p.documentos.map((d) => (
                      <span
                        key={d.nombre}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          d.aprobado
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {d.aprobado ? (
                          <CheckCircle2 className="size-3" />
                        ) : (
                          <XCircle className="size-3" />
                        )}
                        {d.nombre}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge estatus={p.estatus} />
                </td>
                <td className="px-4 py-3 text-right">
                  {p.estatus === "Intake" ? (
                    <button
                      onClick={() => onEnviarValidacion(p.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
                    >
                      <Send className="size-3.5" /> Enviar a Validación
                    </button>
                  ) : (
                    <button
                      onClick={() => setVerificandoId(p.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500"
                    >
                      <FileCheck2 className="size-3.5" /> Verificar Documentos
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {bandeja.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  🎉 No hay propiedades pendientes. Todo el inventario está
                  activo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de verificación de documentos (vista de Jean) */}
      {verificando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Verificación de documentos
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {verificando.titulo}
                </p>
              </div>
              <button
                onClick={() => setVerificandoId(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            <ul className="mt-5 space-y-3">
              {verificando.documentos.map((d) => (
                <li
                  key={d.nombre}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    {d.aprobado ? (
                      <CheckCircle2 className="size-5 text-emerald-600" />
                    ) : (
                      <XCircle className="size-5 text-slate-300" />
                    )}
                    {d.nombre}
                  </span>
                  <button
                    onClick={() => onToggleDocumento(verificando.id, d.nombre)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      d.aprobado
                        ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : "bg-emerald-600 text-white hover:bg-emerald-500"
                    }`}
                  >
                    {d.aprobado ? "Revertir" : "Aprobar"}
                  </button>
                </li>
              ))}
            </ul>

            <button
              disabled={!verificando.documentos.every((d) => d.aprobado)}
              onClick={() => {
                onActivar(verificando.id);
                setVerificandoId(null);
              }}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              <BadgeCheck className="size-4" />
              Aprobar y pasar a Activa
            </button>
            <p className="mt-2 text-center text-xs text-slate-400">
              Se habilita al aprobar INE, Predial y Contrato
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
