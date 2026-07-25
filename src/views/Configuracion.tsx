import { useEffect, useState } from "react";
import { Bell, Building2, Check, ShieldQuestion, Upload, X } from "lucide-react";
import {
  EVENTOS_NOTIFICACION,
  PERMISOS_REFERENCIA,
} from "../data/configuracionOpciones";
import type { AgenciaInfo } from "../types";

type Tab = "agencia" | "permisos" | "notificaciones";

const TABS: { key: Tab; label: string }[] = [
  { key: "agencia", label: "Datos de agencia" },
  { key: "permisos", label: "Roles y permisos" },
  { key: "notificaciones", label: "Notificaciones" },
];

interface Props {
  agencia: AgenciaInfo;
  onGuardarAgencia: (agencia: AgenciaInfo) => void;
  permisoEquipoVerTodas: boolean;
  onGuardarPermisoEquipo: (valor: boolean) => void;
  notificaciones: Record<string, boolean>;
  onGuardarNotificaciones: (valor: Record<string, boolean>) => void;
}

function Celda({ activo }: { activo: boolean }) {
  return activo ? (
    <Check className="mx-auto size-4 text-emerald-600" />
  ) : (
    <X className="mx-auto size-4 text-slate-300" />
  );
}

export default function Configuracion({
  agencia,
  onGuardarAgencia,
  permisoEquipoVerTodas,
  onGuardarPermisoEquipo,
  notificaciones,
  onGuardarNotificaciones,
}: Props) {
  const [tab, setTab] = useState<Tab>("agencia");

  // --- Datos de agencia ---
  const [draftAgencia, setDraftAgencia] = useState(agencia);
  useEffect(() => setDraftAgencia(agencia), [agencia]);
  const dirtyAgencia = JSON.stringify(draftAgencia) !== JSON.stringify(agencia);

  const onLogoSeleccionado = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDraftAgencia((prev) => ({ ...prev, logoUrl: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  };

  // --- Roles y permisos ---
  const [draftPermisoEquipo, setDraftPermisoEquipo] = useState(permisoEquipoVerTodas);
  useEffect(() => setDraftPermisoEquipo(permisoEquipoVerTodas), [permisoEquipoVerTodas]);
  const dirtyPermisos = draftPermisoEquipo !== permisoEquipoVerTodas;

  // --- Notificaciones ---
  const [draftNotificaciones, setDraftNotificaciones] = useState(notificaciones);
  useEffect(() => setDraftNotificaciones(notificaciones), [notificaciones]);
  const dirtyNotificaciones =
    JSON.stringify(draftNotificaciones) !== JSON.stringify(notificaciones);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-xl font-bold text-slate-900">Configuración</h1>
        <p className="mt-1 text-sm text-slate-500">
          Datos de la agencia, permisos por rol y notificaciones in-app
        </p>
      </header>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* --- Datos de agencia --- */}
      {tab === "agencia" && (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
              {draftAgencia.logoUrl ? (
                <img src={draftAgencia.logoUrl} alt="Logo de la agencia" className="size-full object-cover" />
              ) : (
                <Building2 className="size-7 text-slate-300" />
              )}
            </div>
            <div>
              <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                <Upload className="size-3.5" /> Cargar logo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onLogoSeleccionado(e.target.files?.[0])}
                />
              </label>
              <p className="mt-1 text-xs text-slate-400">PNG o JPG, se muestra en la barra superior</p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Nombre de la agencia
            </label>
            <input
              type="text"
              value={draftAgencia.nombre}
              onChange={(e) => setDraftAgencia((prev) => ({ ...prev, nombre: e.target.value }))}
              className="input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Dirección</label>
            <input
              type="text"
              value={draftAgencia.direccion}
              onChange={(e) => setDraftAgencia((prev) => ({ ...prev, direccion: e.target.value }))}
              placeholder="Calle, número, colonia, municipio"
              className="input"
            />
          </div>

          <div className="flex justify-end">
            <button
              disabled={!dirtyAgencia}
              onClick={() => onGuardarAgencia(draftAgencia)}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Guardar cambios
            </button>
          </div>
        </div>
      )}

      {/* --- Roles y permisos --- */}
      {tab === "permisos" && (
        <div className="space-y-5">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Permiso</th>
                  <th className="px-4 py-3 text-center">Broker</th>
                  <th className="px-4 py-3 text-center">Asesor Independiente</th>
                  <th className="px-4 py-3 text-center">Asesor de Equipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PERMISOS_REFERENCIA.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-slate-700">{p.label}</td>
                    <td className="px-4 py-3">
                      <Celda activo={p.broker} />
                    </td>
                    <td className="px-4 py-3">
                      <Celda activo={p.asesorIndependiente} />
                    </td>
                    <td className="px-4 py-3">
                      <Celda activo={p.asesorEquipo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="flex items-start gap-1.5 border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
              <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
              Definidos por el modelo de negocio confirmado: Broker y Asesor Independiente
              comparten el mismo rol con control total. Propietario y Cliente son de solo
              lectura y no aparecen en esta tabla. No editable en el MVP.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">
              Política por defecto — Asesor de Equipo
            </h3>
            <label className="mt-3 flex items-start gap-3">
              <input
                type="checkbox"
                checked={draftPermisoEquipo}
                onChange={(e) => setDraftPermisoEquipo(e.target.checked)}
                className="mt-0.5 size-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-600">
                Puede ver propiedades de otros asesores de la agencia
                <span className="mt-0.5 block text-xs text-slate-400">
                  Se aplica como valor inicial al invitar un nuevo Asesor de Equipo. Se puede
                  ajustar por persona desde Asesores → Editar permisos.
                </span>
              </span>
            </label>
            <div className="mt-4 flex justify-end">
              <button
                disabled={!dirtyPermisos}
                onClick={() => onGuardarPermisoEquipo(draftPermisoEquipo)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Notificaciones --- */}
      {tab === "notificaciones" && (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Bell className="size-4 text-slate-500" /> Eventos que generan notificación in-app
          </h3>
          <div className="divide-y divide-slate-100">
            {EVENTOS_NOTIFICACION.map((ev) => (
              <label key={ev.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-sm text-slate-700">{ev.label}</span>
                <input
                  type="checkbox"
                  checked={draftNotificaciones[ev.id] ?? false}
                  onChange={(e) =>
                    setDraftNotificaciones((prev) => ({ ...prev, [ev.id]: e.target.checked }))
                  }
                  className="size-4 rounded border-slate-300"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              disabled={!dirtyNotificaciones}
              onClick={() => onGuardarNotificaciones(draftNotificaciones)}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Guardar cambios
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
