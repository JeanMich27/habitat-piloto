// Tarjeta de detalles superpuesta (glassmorphism) — el patrón central del
// rediseño: en lugar de navegar a una pantalla nueva, el detalle emerge
// sobre la pantalla actual, que queda visible pero desenfocada detrás.
//
// Uso:
//   {abierto && (
//     <GlassModal titulo="Puntuación energía" onCerrar={() => setAbierto(false)}>
//       ...gráficos y desglose...
//     </GlassModal>
//   )}
//
// Comportamiento:
//   - Móvil: hoja inferior con esquinas superiores muy redondeadas.
//   - Desktop: tarjeta centrada.
//   - Cierra con Escape, clic en el fondo o el botón X.
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  titulo?: string;
  subtitulo?: string;
  onCerrar: () => void;
  /** md = detalle puntual · lg = tablas o gráficos anchos */
  ancho?: "md" | "lg";
  children: ReactNode;
}

export default function GlassModal({ titulo, subtitulo, onCerrar, ancho = "md", children }: Props) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    // Congela el scroll del fondo mientras la tarjeta está abierta.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowPrevio;
    };
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      {/* Fondo: la pantalla principal sigue visible pero desenfocada. */}
      <div
        className="animate-backdrop absolute inset-0 bg-slate-900/25 backdrop-blur-md"
        onClick={onCerrar}
      />

      <div
        className={`animate-modal glass-strong relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[2rem] pb-[env(safe-area-inset-bottom)] sm:rounded-[2rem] ${
          ancho === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl"
        }`}
      >
        {/* Asa visual en móvil, como una hoja nativa. */}
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-300/70 sm:hidden" />

        <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            {titulo && <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>}
            {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-sm hover:bg-white hover:text-slate-800"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-6 pt-4 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
