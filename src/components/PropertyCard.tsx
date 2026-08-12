// Tarjeta de propiedad — rediseño Fase 1.
//
// El contorno de la tarjeta ES el termómetro de antigüedad:
//   verde 1–2 meses · amarillo 3–4 · naranja 5–6 · rojo +6.
// Además lleva la píldora con el tiempo exacto sobre la foto, para que
// el asesor identifique de un vistazo qué inventario se está enfriando.
//
// El ancho lo controla el contenedor padre (w-full aquí): en el dashboard
// va en carrusel con w-72, en listados puede ir en grid fluido.
import { Bath, BedDouble, Home, MapPin, Ruler } from "lucide-react";
import type { Propiedad } from "../types";
import { formatoMXN } from "../types";
import { ANTIGUEDAD_ESTILOS, antiguedadDe } from "../lib/antiguedad";
import AntiguedadBadge from "./AntiguedadBadge";
import StatusBadge from "./StatusBadge";

export default function PropertyCard({ propiedad }: { propiedad: Propiedad }) {
  const totalFotos = propiedad.imagenes?.length ?? 0;
  const portada = propiedad.imagenes?.[0];
  const antiguedad = antiguedadDe(propiedad);
  const estiloAnt = ANTIGUEDAD_ESTILOS[antiguedad.nivel];

  return (
    <article
      className={`glass flex h-full w-full flex-col overflow-hidden ring-2 transition-transform hover:-translate-y-0.5 ${estiloAnt.ring}`}
    >
      {/* Foto real del CRM. El degradado solo aparece si no hay ninguna. */}
      <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-slate-500 via-slate-400 to-slate-300">
        {portada ? (
          <img
            src={portada}
            alt={propiedad.titulo}
            loading="lazy"
            className="size-full object-cover"
            // Si la URL del CRM se cae, se oculta la imagen y queda el
            // degradado de siempre en vez de un ícono de imagen rota.
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Home className="size-10 text-white/50" />
        )}
        <div className="absolute left-3 top-3">
          <StatusBadge estatus={propiedad.estatus} />
        </div>
        {/* Termómetro de antigüedad */}
        <div className="absolute right-2 top-3">
          <AntiguedadBadge propiedad={propiedad} compacta />
        </div>
        {totalFotos > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
            {totalFotos} fotos
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-lg font-bold text-slate-900">
          {formatoMXN(propiedad.precio)}
        </p>
        <h3 className="text-sm font-semibold leading-snug text-slate-800">
          {propiedad.titulo}
        </h3>
        <p className="flex items-start gap-1 text-xs text-slate-500">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          {propiedad.ubicacion}, {propiedad.estado}
        </p>

        <div className="mt-auto flex items-center gap-4 border-t border-slate-200/60 pt-3 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <BedDouble className="size-3.5" /> {propiedad.recamaras} rec
          </span>
          <span className="flex items-center gap-1">
            <Bath className="size-3.5" /> {propiedad.banos} baños
          </span>
          <span className="flex items-center gap-1">
            <Ruler className="size-3.5" /> {propiedad.m2} m²
          </span>
        </div>
      </div>
    </article>
  );
}
