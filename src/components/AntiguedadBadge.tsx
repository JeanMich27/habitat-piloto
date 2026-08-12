// Píldora "termómetro" de antigüedad: color + tiempo publicada.
// Se usa dentro de PropertyCard, tabla de propiedades y detalle.
import { Thermometer } from "lucide-react";
import type { Propiedad } from "../types";
import { ANTIGUEDAD_ESTILOS, antiguedadDe } from "../lib/antiguedad";

interface Props {
  propiedad: Propiedad;
  ahora?: number;
  /** compacta = solo icono + tiempo (para tarjetas chicas) */
  compacta?: boolean;
}

export default function AntiguedadBadge({ propiedad, ahora, compacta = false }: Props) {
  const a = antiguedadDe(propiedad, ahora);
  const estilo = ANTIGUEDAD_ESTILOS[a.nivel];
  return (
    <span
      title={`${a.dias} días en el sistema${a.estimada ? " (desde su captura; aún sin publicar)" : " desde su publicación"}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold backdrop-blur ${estilo.pill}`}
    >
      <Thermometer className="size-3" />
      {a.etiqueta}
      {!compacta && a.estimada && <span className="font-medium opacity-70">· sin publicar</span>}
    </span>
  );
}
