import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Clipboard, Download, FileText, ImageOff, Link2, LoaderCircle, MapPin, QrCode } from "lucide-react";
import {
  MAX_PROPERTY_SHEET_IMAGES,
  sanitizePropertySheetFilename,
  type DocumentOptions,
} from "../domain/documents/documentPolicy";
import type { GeneratedDocumentOutcome } from "../app/application/documentActions";
import type { AgenciaInfo, Propiedad, Usuario } from "../types";
import { formatoMXN } from "../types";
import GlassModal from "./GlassModal";

interface Props {
  property: Pick<Propiedad, "titulo" | "ubicacion" | "municipio" | "estado" | "precio" | "imagenes" | "urlPublica">;
  advisor: Pick<Usuario, "nombre" | "telefono" | "correo" | "puesto">;
  agency: Pick<AgenciaInfo, "nombre" | "logoUrl">;
  onClose: () => void;
  onGenerate: (options: DocumentOptions) => Promise<GeneratedDocumentOutcome>;
}

const hasWhatsapp = (phone: string) => phone.replace(/\D/g, "").length >= 10;

export default function GeneratePropertySheetModal({ property, advisor, agency, onClose, onGenerate }: Props) {
  const images = useMemo(() => property.imagenes ?? [], [property.imagenes]);
  const [includeAdvisorData, setIncludeAdvisorData] = useState(true);
  const [includeQr, setIncludeQr] = useState(true);
  const [selectedImageIndexes, setSelectedImageIndexes] = useState(() => images.slice(0, MAX_PROPERTY_SHEET_IMAGES).map((_, index) => index));
  const [expiresInDays, setExpiresInDays] = useState<1 | 7 | 30>(7);
  const [working, setWorking] = useState<"pdf" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [share, setShare] = useState<GeneratedDocumentOutcome | null>(null);
  const [copied, setCopied] = useState(false);

  const qrAvailable = includeAdvisorData ? hasWhatsapp(advisor.telefono) : Boolean(property.urlPublica);
  const selectedImages = useMemo(() => selectedImageIndexes.map((index) => ({ index, url: images[index] })).filter((image) => Boolean(image.url)), [images, selectedImageIndexes]);
  const approximateLocation = [property.ubicacion, property.municipio, property.estado].filter(Boolean).join(", ");

  const toggleImage = (index: number) => {
    setError(null);
    setSelectedImageIndexes((current) => {
      if (current.includes(index)) return current.filter((value) => value !== index);
      if (current.length >= MAX_PROPERTY_SHEET_IMAGES) {
        setError(`Puedes incluir como máximo ${MAX_PROPERTY_SHEET_IMAGES} fotografías.`);
        return current;
      }
      return [...current, index];
    });
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    setSelectedImageIndexes((current) => {
      const position = current.indexOf(index);
      const target = position + direction;
      if (position < 0 || target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[position], reordered[target]] = [reordered[target], reordered[position]];
      return reordered;
    });
  };

  const generate = async (output: "pdf" | "temporary_link") => {
    setWorking(output === "pdf" ? "pdf" : "link");
    setError(null); setSuccess(null); setCopied(false);
    try {
      const result = await onGenerate({
        includeAdvisorData,
        output,
        expiresInDays,
        selectedImageIndexes,
        includeQr: includeQr && qrAvailable,
        locationMode: "approximate",
        template: "commercial",
      });
      if (result.download) {
        const url = URL.createObjectURL(result.download);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = sanitizePropertySheetFilename(property.titulo);
        anchor.click();
        URL.revokeObjectURL(url);
        setSuccess(result.reused ? "Ficha lista y descargada." : "Ficha comercial generada correctamente.");
      } else if (result.shareUrl) {
        setShare(result);
        setSuccess("Enlace generado para esta versión de la ficha.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos generar la ficha.");
    } finally {
      setWorking(null);
    }
  };

  const copy = async () => {
    if (!share?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(share.shareUrl);
      setCopied(true);
    } catch {
      setError("No se pudo copiar automáticamente. Selecciona y copia el enlace.");
    }
  };

  return (
    <GlassModal titulo="Generar ficha" subtitulo={property.titulo} onCerrar={onClose} ancho="lg">
      <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-violet-600 text-white"><FileText className="size-5" /></span>
              <div><p className="text-sm font-bold text-slate-900">Ficha comercial</p><p className="text-xs text-slate-500">PDF A4 privado, optimizado para compartir e imprimir.</p></div>
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-bold text-slate-800">Datos del asesor</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {([{ value: true, label: "Con mis datos", help: "Incluye tus datos reales disponibles." }, { value: false, label: "Sin mis datos", help: "Muestra únicamente el branding de la inmobiliaria." }] as const).map((option) => (
                <label key={String(option.value)} className={`cursor-pointer rounded-xl border p-3 transition ${includeAdvisorData === option.value ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white/70 hover:bg-white"}`}>
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><input type="radio" name="advisor-data" aria-label={option.label} checked={includeAdvisorData === option.value} onChange={() => setIncludeAdvisorData(option.value)} className="accent-violet-600" />{option.label}</span>
                  <span className="mt-1 block pl-5 text-[11px] leading-relaxed text-slate-500">{option.help}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <section className="mt-5" aria-labelledby="photo-selection-title">
            <div className="flex items-center justify-between gap-3">
              <h3 id="photo-selection-title" className="text-sm font-bold text-slate-800">Fotografías</h3>
              <span className="text-xs font-medium text-slate-500">{selectedImageIndexes.length}/{MAX_PROPERTY_SHEET_IMAGES}</span>
            </div>
            {images.length === 0 ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/50 px-3 py-4 text-xs text-slate-500"><ImageOff className="size-4" />La propiedad no tiene fotografías disponibles. Se generará una ficha textual.</div>
            ) : (
              <>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {images.map((url, index) => {
                    const selected = selectedImageIndexes.includes(index);
                    return (
                      <label key={`${url}-${index}`} className={`relative cursor-pointer overflow-hidden rounded-xl border bg-slate-100 ${selected ? "border-violet-500 ring-2 ring-violet-200" : "border-slate-200"}`}>
                        <img src={url} alt={`Fotografía ${index + 1} de ${property.titulo}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                        <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-white/95 shadow"><input type="checkbox" aria-label={`Incluir fotografía ${index + 1}`} checked={selected} onChange={() => toggleImage(index)} className="accent-violet-600" /></span>
                      </label>
                    );
                  })}
                </div>
                {selectedImages.length > 0 && (
                  <ol aria-label="Orden de fotografías" className="mt-3 space-y-1.5">
                    {selectedImages.map(({ index, url }, position) => (
                      <li key={index} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 p-2">
                        <img src={url} alt="" className="size-10 rounded-lg object-cover" />
                        <span className="min-w-0 flex-1 text-xs font-semibold text-slate-700">{position === 0 ? "Portada" : `Galería ${position}`}</span>
                        <button type="button" aria-label={`Mover fotografía ${index + 1} arriba`} disabled={position === 0} onClick={() => moveImage(index, -1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="size-4" /></button>
                        <button type="button" aria-label={`Mover fotografía ${index + 1} abajo`} disabled={position === selectedImages.length - 1} onClick={() => moveImage(index, 1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="size-4" /></button>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </section>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><MapPin className="size-4" />Ubicación</p>
              <div className="mt-2 rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-600"><span className="font-semibold">Zona aproximada</span><p className="mt-1 line-clamp-2">{approximateLocation || "Sin ubicación comercial disponible."}</p></div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">La dirección completa permanece oculta porque el modelo actual no tiene autorización explícita para publicarla.</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><QrCode className="size-4" />Código QR</p>
              <label className={`mt-2 flex items-start gap-2 rounded-xl border p-3 ${qrAvailable ? "cursor-pointer border-slate-200 bg-white/70" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                <input type="checkbox" aria-label="Incluir código QR" checked={includeQr && qrAvailable} disabled={!qrAvailable} onChange={(event) => setIncludeQr(event.target.checked)} className="mt-0.5 accent-violet-600" />
                <span className="text-xs"><strong className="block text-slate-700">Incluir QR</strong>{qrAvailable ? (includeAdvisorData ? "Abre WhatsApp con un mensaje sobre la propiedad." : "Abre la publicación pública existente.") : "No existe un destino público o WhatsApp válido; se omitirá."}</span>
              </label>
            </div>
          </div>

          <label className="mt-5 block text-sm font-bold text-slate-800" htmlFor="share-expiration">Vigencia del enlace</label>
          <select id="share-expiration" value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value) as 1 | 7 | 30)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200">
            <option value={1}>24 horas</option><option value={7}>7 días</option><option value={30}>30 días</option>
          </select>
        </div>

        <aside aria-label="Vista previa de la ficha" className="lg:sticky lg:top-0 lg:self-start">
          <p className="mb-2 text-sm font-bold text-slate-800">Vista previa</p>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            {selectedImages[0] ? <img src={selectedImages[0].url} alt="Fotografía principal seleccionada" className="aspect-[16/9] w-full object-cover" /> : <div className="flex aspect-[16/9] items-center justify-center bg-slate-100 text-xs text-slate-400"><ImageOff className="mr-2 size-4" />Sin fotografía</div>}
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-600">{property.titulo}</p>
              <p className="mt-2 text-xl font-black text-slate-900">{formatoMXN(property.precio)}</p>
              <p className="mt-1 text-xs text-slate-500">{approximateLocation || "Ubicación no disponible"}</p>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-xs font-bold text-slate-800">{agency.nombre || "Inmobiliaria"}</p>
                {includeAdvisorData && <p className="mt-1 text-[11px] text-slate-500">{advisor.nombre}{advisor.puesto ? ` · ${advisor.puesto}` : ""}</p>}
              </div>
              <p className="mt-3 text-[10px] text-slate-400">{selectedImageIndexes.length} fotografía{selectedImageIndexes.length === 1 ? "" : "s"} · A4 vertical · Ficha comercial</p>
            </div>
          </div>
        </aside>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {success && <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><Check className="size-4" />{success}</p>}

      {share?.shareUrl && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3">
          <p className="text-xs font-semibold text-slate-600">Expira en {expiresInDays === 1 ? "24 horas" : `${expiresInDays} días`}.</p>
          <input aria-label="Enlace generado" readOnly value={share.shareUrl} onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600" />
          <button type="button" onClick={copy} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100">
            {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}{copied ? "Enlace copiado." : "Copiar enlace"}
          </button>
        </div>
      )}

      <div className="sticky bottom-0 z-10 mt-5 grid gap-2 border-t border-slate-200/70 bg-white/95 pt-4 backdrop-blur sm:grid-cols-2">
        <button type="button" disabled={working !== null} onClick={() => generate("pdf")} className="flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60">
          {working === "pdf" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{working === "pdf" ? "Generando ficha..." : "Descargar PDF"}
        </button>
        <button type="button" disabled={working !== null} onClick={() => generate("temporary_link")} className="flex items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-200 hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60">
          {working === "link" ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />}{working === "link" ? "Generando enlace..." : "Generar enlace"}
        </button>
      </div>
    </GlassModal>
  );
}
