import { useEffect, useState, type ChangeEvent } from "react";
import { Bell, Building2, Check, LoaderCircle, ShieldQuestion, Upload, X } from "lucide-react";
import {
  EVENTOS_NOTIFICACION,
  PERMISOS_REFERENCIA,
} from "../data/configuracionOpciones";
import type { AgenciaInfo } from "../types";
import { urlPublicaSegura } from "../lib/urlPublica";

type Tab = "agencia" | "permisos" | "notificaciones";

const TABS: { key: Tab; label: string }[] = [
  { key: "agencia", label: "Datos de agencia" },
  { key: "permisos", label: "Roles y permisos" },
  { key: "notificaciones", label: "Notificaciones" },
];

interface Props {
  agencia: AgenciaInfo;
  onGuardarAgencia: (agencia: AgenciaInfo) => Promise<boolean>;
  onSubirLogoAgencia?: (archivo: File) => Promise<{ url: string | null; error: string | null }>;
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
  onSubirLogoAgencia,
  permisoEquipoVerTodas,
  onGuardarPermisoEquipo,
  notificaciones,
  onGuardarNotificaciones,
}: Props) {
  const [tab, setTab] = useState<Tab>("agencia");

  // --- Datos de agencia ---
  const [draftAgencia, setDraftAgencia] = useState(agencia);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [estadoLogo, setEstadoLogo] = useState<{ tipo: "ok" | "error"; mensaje: string } | null>(null);
  useEffect(() => setDraftAgencia(agencia), [agencia]);
  const dirtyAgencia = JSON.stringify(draftAgencia) !== JSON.stringify(agencia);
  const sitioWebSeguro = urlPublicaSegura(draftAgencia.sitioWeb ?? "");
  const sitioWebInvalido = Boolean(draftAgencia.sitioWeb?.trim()) && !sitioWebSeguro;

  const onLogoSeleccionado = async (evento: ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) {
      setEstadoLogo({ tipo: "error", mensaje: "Usa un archivo JPG, PNG o WEBP." });
      return;
    }
    if (archivo.size > 5 * 1024 * 1024) {
      setEstadoLogo({ tipo: "error", mensaje: "El logo no debe superar 5 MB." });
      return;
    }
    if (!onSubirLogoAgencia) {
      setEstadoLogo({ tipo: "error", mensaje: "El logo no se puede subir sin conexión a la nube." });
      return;
    }

    setSubiendoLogo(true);
    setEstadoLogo(null);
    const resultado = await onSubirLogoAgencia(archivo);
    if (!resultado.url || resultado.error) {
      setEstadoLogo({ tipo: "error", mensaje: resultado.error ?? "No se pudo subir el logo." });
      setSubiendoLogo(false);
      return;
    }

    const siguiente = { ...agencia, logoUrl: resultado.url };
    const guardado = await onGuardarAgencia(siguiente);
    setSubiendoLogo(false);
    if (!guardado) {
      setEstadoLogo({ tipo: "error", mensaje: "El archivo subió, pero no se pudo asociar a la oficina." });
      return;
    }
    setDraftAgencia(siguiente);
    setEstadoLogo({ tipo: "ok", mensaje: "Logo actualizado en el micrositio." });
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
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
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
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
              {draftAgencia.logoUrl ? (
                <img src={draftAgencia.logoUrl} alt="Logo de la agencia" className="size-full object-contain p-1" />
              ) : (
                <Building2 className="size-7 text-slate-300" />
              )}
            </div>
            <div>
              <label className={`flex w-fit items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition ${subiendoLogo ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-slate-50"}`}>
                {subiendoLogo ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {subiendoLogo ? "Publicando…" : "Cambiar logo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={subiendoLogo}
                  onChange={(e) => void onLogoSeleccionado(e)}
                />
              </label>
              <p className="mt-1 text-xs text-slate-500">JPG, PNG o WEBP · máximo 5 MB</p>
              {estadoLogo && (
                <p role={estadoLogo.tipo === "error" ? "alert" : "status"} className={`mt-1 text-xs ${estadoLogo.tipo === "error" ? "text-rose-600" : "text-emerald-600"}`}>
                  {estadoLogo.mensaje}
                </p>
              )}
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

          <div>
            <label htmlFor="agencia-sitio-web" className="mb-1 block text-xs font-semibold text-slate-500">
              Sitio web público
            </label>
            <input
              id="agencia-sitio-web"
              type="url"
              value={draftAgencia.sitioWeb ?? ""}
              onChange={(e) => setDraftAgencia((prev) => ({ ...prev, sitioWeb: e.target.value }))}
              placeholder="https://inmobiliaria.mx"
              className="input"
            />
            {sitioWebInvalido && <p role="alert" className="mt-1 text-xs text-rose-600">Usa una dirección completa que comience con https://.</p>}
          </div>

          <div className="flex justify-end">
            <button
              disabled={!dirtyAgencia || sitioWebInvalido}
              onClick={() => void onGuardarAgencia({ ...draftAgencia, sitioWeb: sitioWebSeguro ?? undefined })}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Guardar cambios
            </button>
          </div>
        </div>
      )}

      {/* --- Roles y permisos --- */}
      {tab === "permisos" && (
        <div className="space-y-5">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
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
            <p className="flex items-start gap-1.5 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
              Definidos por el modelo de negocio confirmado: Broker y Asesor Independiente
              comparten el mismo rol con control total. Propietario y Cliente son de solo
              lectura y no aparecen en esta tabla. No editable en el MVP.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
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
                <span className="mt-0.5 block text-xs text-slate-500">
                  Se aplica como valor inicial al invitar un nuevo Asesor de Equipo. Se puede
                  ajustar por persona desde Asesores → Editar permisos.
                </span>
              </span>
            </label>
            <div className="mt-4 flex justify-end">
              <button
                disabled={!dirtyPermisos}
                onClick={() => onGuardarPermisoEquipo(draftPermisoEquipo)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Notificaciones --- */}
      {tab === "notificaciones" && (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
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
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Guardar cambios
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
