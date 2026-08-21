// Bandeja de validación del broker.
//
// Con los estados comerciales (ago 2026) ya no existe el sub-estado
// Intake/Validación: toda propiedad "No publicada" vive aquí hasta que el
// broker valida sus documentos y la publica. La bandeja se divide por lo que
// de verdad importa: ¿ya están los papeles o no?
import { useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  Inbox,
  X,
  XCircle,
} from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import type { DocumentName, Propiedad, Usuario } from "../types";
import { formatoMXN } from "../types";

interface Props {
  propiedades: Propiedad[];
  usuarios: Usuario[];
  onToggleDocumento: (propiedadId: string, documento: DocumentName) => void;
  /** Documentos completos → la propiedad pasa a "Publicada". */
  onActivar: (propiedadId: string) => void;
}

export default function IntakeValidacion({
  propiedades,
  usuarios,
  onToggleDocumento,
  onActivar,
}: Props) {
  const [verificandoId, setVerificandoId] = useState<string | null>(null);

  // Solo "No publicada": Suspendida, Reservada y Vendida o Rentada no deben
  // volver a esta bandeja — publicarlas desde aquí saltaría las reglas.
  const bandeja = propiedades.filter((p) => p.estatus === "No publicada");
  const docsCompletos = (p: Propiedad) =>
    p.documentos.length > 0 && p.documentos.every((d) => d.aprobado);
  const listas = bandeja.filter(docsCompletos).length;
  const verificando = propiedades.find((p) => p.id === verificandoId);
  const nombreAsesor = (id: string) =>
    usuarios.find((u) => u.id === id)?.nombre ?? "Sin asignar";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Inbox className="size-5 text-slate-600" />
            Validación antes de publicar
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Toda propiedad no publicada espera aquí la validación documental del broker
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="rounded-full bg-amber-50/90 px-3 py-1.5 font-medium text-amber-700 ring-1 ring-amber-200">
            {bandeja.length - listas} con documentos pendientes
          </span>
          <span className="rounded-full bg-emerald-50/90 px-3 py-1.5 font-medium text-emerald-700 ring-1 ring-emerald-200">
            {listas} listas para publicar
          </span>
        </div>
      </header>

      {/* Tabla de propiedades no publicadas */}
      <div className="glass overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500">
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
              <tr key={p.id} className="hover:bg-white/60">
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
                            : "bg-slate-100 text-slate-500"
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
                    {p.documentos.length === 0 && (
                      <span className="text-xs text-slate-500">Sin documentos</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge estatus={p.estatus} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setVerificandoId(p.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition ${
                      docsCompletos(p)
                        ? "bg-emerald-600 hover:bg-emerald-500"
                        : "bg-slate-800 hover:bg-slate-700"
                    }`}
                  >
                    <FileCheck2 className="size-3.5" />
                    {docsCompletos(p) ? "Publicar" : "Verificar documentos"}
                  </button>
                </td>
              </tr>
            ))}
            {bandeja.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  🎉 No hay propiedades pendientes. Todo el inventario está
                  publicado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de verificación de documentos (vista del broker) */}
      {verificando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="glass-strong w-full max-w-md rounded-3xl p-6">
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
                className="rounded-full p-1.5 text-slate-500 hover:bg-white/80 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            <ul className="mt-5 space-y-3">
              {verificando.documentos.map((d) => (
                <li
                  key={d.nombre}
                  className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 ring-1 ring-slate-200/70"
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
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
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
              disabled={!verificando.documentos.every((d) => d.aprobado) || verificando.documentos.length === 0}
              onClick={() => {
                onActivar(verificando.id);
                setVerificandoId(null);
              }}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              <BadgeCheck className="size-4" />
              Aprobar y publicar
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">
              Se habilita al aprobar INE, Predial y Contrato
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
