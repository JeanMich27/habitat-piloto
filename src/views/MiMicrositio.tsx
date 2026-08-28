// Pantalla para editar, revisar y compartir el micrositio desde un solo lugar.
import { useState } from "react";
import { Check, Copy, ExternalLink, Globe } from "lucide-react";
import type { AgenciaInfo, Usuario } from "../types";
import { InformacionPublica } from "./PerfilPersonal";

interface Props {
  usuario: Usuario;
  agencia: AgenciaInfo;
  onGuardar: (id: string, cambios: Partial<Usuario>) => Promise<boolean>;
  onSubirFoto?: (archivo: File) => Promise<{ url: string | null; error: string | null }>;
}

const CAMPOS_CLAVE: { clave: keyof Usuario; etiqueta: string }[] = [
  { clave: "fotoUrl", etiqueta: "foto" },
  { clave: "bioCorta", etiqueta: "bio" },
  { clave: "especialidades", etiqueta: "especialidades" },
];

function faltantes(usuario: Usuario): string[] {
  return CAMPOS_CLAVE.filter(({ clave }) => {
    const valor = usuario[clave];
    if (Array.isArray(valor)) return valor.length === 0;
    return valor == null || valor === "";
  }).map(({ etiqueta }) => etiqueta);
}

export default function MiMicrositio({ usuario, agencia, onGuardar, onSubirFoto }: Props) {
  const [copiado, setCopiado] = useState(false);
  const slug = usuario.slugPublico;
  const url = slug ? `${window.location.origin}/m/${slug}` : null;
  const pendientes = faltantes(usuario);
  const porcentaje = Math.round(((CAMPOS_CLAVE.length - pendientes.length) / CAMPOS_CLAVE.length) * 100);

  const copiarEnlace = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el enlace ya está visible en pantalla
      // para copiar a mano, así que no hace falta un mensaje de error.
    }
  };

  const mensajeWhatsApp = url
    ? `https://wa.me/?text=${encodeURIComponent(
        `Conoce más sobre mí y mis propiedades en mi micrositio: ${url}`,
      )}`
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-xl font-bold text-slate-900">Mi Micrositio</h1>
        <p className="text-sm text-slate-500">
          Edita tu información pública, revisa el resultado y comparte el enlace.
        </p>
      </header>

      <InformacionPublica usuario={usuario} onGuardar={onGuardar} onSubirFoto={onSubirFoto} />

      {/* Tarjeta de vista previa */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-4">
          {usuario.fotoUrl ? (
            <img
              src={usuario.fotoUrl}
              alt={usuario.nombre}
              className="size-16 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-xl font-bold text-white">
              {usuario.iniciales}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{usuario.nombre}</p>
            <p className="truncate text-sm text-slate-500">{usuario.puesto}</p>
            <p className="truncate text-xs text-slate-400">{agencia.nombre}</p>
          </div>
          <span
            className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              pendientes.length === 0
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
            }`}
          >
            {pendientes.length === 0 ? "Completo" : "Incompleto"}
          </span>
        </div>

        {pendientes.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <div className="mb-1.5 flex items-center justify-between font-semibold">
              <span>Tu micrositio está a {porcentaje}% de completarse</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${porcentaje}%` }}
              />
            </div>
            <p className="mt-2">
              Falta: {pendientes.join(", ")}. Sigue visible y activo — pero se ve más completo con
              esta información.
            </p>
            <p className="mt-2 font-semibold">Completa los campos de edición que aparecen arriba.</p>
          </div>
        )}

        {!url && (
          <p className="mt-4 text-xs text-slate-400">
            Tu enlace se está generando. Si no aparece en unos segundos, vuelve a entrar a la app.
          </p>
        )}

        {url && (
          <>
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <Globe className="size-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{url}</span>
              <button
                onClick={copiarEnlace}
                title="Copiar enlace"
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50"
              >
                {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
              >
                <ExternalLink className="size-3.5" /> Ver mi micrositio
              </a>
              {mensajeWhatsApp && (
                <a
                  href={mensajeWhatsApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  Compartir por WhatsApp
                </a>
              )}
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Cualquier persona con este enlace puede ver tu perfil público y tus propiedades publicadas —
        no requiere iniciar sesión. Nunca se muestra tu correo ni datos internos.
      </p>
    </div>
  );
}
