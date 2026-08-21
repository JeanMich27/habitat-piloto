// Campana de notificaciones del encabezado.
//
// Regla de usabilidad: ninguna notificación es informativa a secas. Todas
// llevan de un toque al registro que las originó — si el aviso dice "cliente
// sin contactar", tocarlo abre ese cliente, no una lista donde buscarlo.
import { useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import type { Notificacion } from "../lib/notificaciones";
import { tiempoRelativo } from "../lib/notificaciones";

interface Props {
  notificaciones: Notificacion[];
  vistas: Set<string>;
  onAbrir: (n: Notificacion) => void;
  onMarcarTodasLeidas: () => void;
}

export default function CampanaNotificaciones({
  notificaciones,
  vistas,
  onAbrir,
  onMarcarTodasLeidas,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  const sinLeer = notificaciones.filter((n) => !vistas.has(n.id));

  // Cierra con Escape: es lo que la gente intenta primero.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  return (
    <div ref={contenedor} className="relative shrink-0">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label={
          sinLeer.length ? `${sinLeer.length} notificaciones sin leer` : "Notificaciones"
        }
        className="relative flex size-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
      >
        <Bell className="size-4" />
        {sinLeer.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {sinLeer.length > 9 ? "9+" : sinLeer.length}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-11 z-50 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <p className="text-sm font-bold text-slate-900">Notificaciones</p>
              {sinLeer.length > 0 && (
                <button
                  onClick={onMarcarTodasLeidas}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <Check className="size-3" /> Marcar todas
                </button>
              )}
            </div>

            <div className="max-h-[calc(70vh-44px)] overflow-y-auto">
              {notificaciones.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">
                  Todo al día. No hay nada pendiente.
                </p>
              ) : (
                notificaciones.slice(0, 40).map((n) => {
                  const nueva = !vistas.has(n.id);
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        onAbrir(n);
                        setAbierto(false);
                      }}
                      className={`flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${
                        nueva ? "bg-slate-50/60" : ""
                      }`}
                    >
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          nueva ? (n.urgente ? "bg-amber-500" : "bg-blue-500") : "bg-transparent"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">
                          {n.titulo}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                          {n.detalle}
                        </span>
                        <span className="mt-1 block text-[10px] text-slate-500">
                          {tiempoRelativo(n.fecha)}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
