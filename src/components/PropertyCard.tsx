import { Bath, BedDouble, Home, MapPin, Ruler } from "lucide-react";
import type { Propiedad } from "../types";
import { formatoMXN } from "../types";
import StatusBadge from "./StatusBadge";

export default function PropertyCard({ propiedad }: { propiedad: Propiedad }) {
  return (
    <article className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {/* Placeholder de foto */}
      <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500">
        <Home className="size-10 text-white/40" />
        <div className="absolute left-3 top-3">
          <StatusBadge estatus={propiedad.estatus} />
        </div>
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

        <div className="mt-auto flex items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
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
