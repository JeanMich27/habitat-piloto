// Marca HomeID.
//
// El logotipo vive aquí como SVG en línea, no como <img src="...">, por tres
// razones prácticas:
//   1. No agrega una petición de red al primer render (importa en móvil 4G).
//   2. Escala sin pixelarse en cualquier densidad de pantalla.
//   3. El degradado se puede reusar en dos variantes (color y monocromo)
//      sin duplicar archivos.
//
// El id del degradado se genera por instancia: dos <svg> con el mismo id de
// <linearGradient> en el mismo documento hacen que el segundo herede el
// primero — un bug clásico y difícil de ver.
import { useId } from "react";

const TRAZOS = [
  // Techo con alero
  "M9 51 L50 12 L91 51",
  // Muros
  "M18.5 45.5 V 88",
  "M81.5 45.5 V 88",
  // Chimenea
  "M72.5 33 V 21.5 H 79.5 V 40",
  // Huella dactilar: arcos concéntricos
  "M25.5 70 V 60 A 24.5 24.5 0 0 1 74.5 60 V 70",
  "M34 80 V 62 A 16 16 0 0 1 66 62 V 80",
  "M42.5 88 V 65.5 A 7.5 7.5 0 0 1 57.5 65.5 V 84",
  "M50 88 V 76",
];

interface MarcaProps {
  className?: string;
  /** "color" = degradado violeta · "blanco" = monocromo para fondos oscuros */
  variante?: "color" | "blanco";
}

export function MarcaHomeID({ className = "size-9", variante = "color" }: MarcaProps) {
  const id = useId();
  const trazo = variante === "blanco" ? "#FFFFFF" : `url(#${id})`;
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="HomeID">
      {variante === "color" && (
        <defs>
          <linearGradient id={id} x1="10" y1="8" x2="90" y2="92" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7C3AED" />
            <stop offset="0.5" stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#6D28D9" />
          </linearGradient>
        </defs>
      )}
      <g
        fill="none"
        stroke={trazo}
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {TRAZOS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

interface LogoProps {
  /** sm = header · lg = pantalla de acceso */
  tamano?: "sm" | "lg";
  /** Oculta el descriptor "Plataforma inmobiliaria" */
  sinBajada?: boolean;
  className?: string;
}

/** Marca + palabra, en la proporción del logotipo original. */
export default function LogoHomeID({ tamano = "sm", sinBajada = false, className = "" }: LogoProps) {
  const grande = tamano === "lg";
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      <MarcaHomeID className={grande ? "size-12" : "size-9 shrink-0"} />
      <span className="min-w-0 leading-tight">
        <span
          className={`block truncate font-bold tracking-[0.18em] text-slate-900 ${
            grande ? "text-xl" : "text-sm"
          }`}
        >
          HOME<span className="text-violet-600">ID</span>
        </span>
        {!sinBajada && (
          <span
            className={`block uppercase tracking-[0.22em] text-slate-500 ${
              grande ? "text-[10px]" : "hidden text-[9px] sm:block"
            }`}
          >
            Plataforma inmobiliaria
          </span>
        )}
      </span>
    </span>
  );
}
