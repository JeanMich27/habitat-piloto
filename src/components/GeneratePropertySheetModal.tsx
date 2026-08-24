import { useState } from "react";
import { Check, Clipboard, Download, FileText, Link2, LoaderCircle } from "lucide-react";
import type { DocumentOptions } from "../domain/documents/documentPolicy";
import type { GeneratedDocumentOutcome } from "../app/application/documentActions";
import GlassModal from "./GlassModal";

interface Props {
  propertyTitle: string;
  onClose: () => void;
  onGenerate: (options: DocumentOptions) => Promise<GeneratedDocumentOutcome>;
}

export default function GeneratePropertySheetModal({ propertyTitle, onClose, onGenerate }: Props) {
  const [includeAdvisorData, setIncludeAdvisorData] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState<1 | 7 | 30>(7);
  const [working, setWorking] = useState<"pdf" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [share, setShare] = useState<GeneratedDocumentOutcome | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async (output: "pdf" | "temporary_link") => {
    setWorking(output === "pdf" ? "pdf" : "link");
    setError(null); setSuccess(null); setCopied(false);
    try {
      const result = await onGenerate({ includeAdvisorData, output, expiresInDays });
      if (result.download) {
        const url = URL.createObjectURL(result.download);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `ficha-${propertyTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "propiedad"}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
        setSuccess(result.reused ? "Ficha lista y descargada." : "Ficha generada correctamente.");
      } else if (result.shareUrl) {
        setShare(result);
        setSuccess("Enlace generado.");
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
    <GlassModal titulo="Generar ficha" subtitulo={propertyTitle} onCerrar={onClose}>
      <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-violet-600 text-white"><FileText className="size-5" /></span>
          <div><p className="text-sm font-bold text-slate-900">Ficha técnica</p><p className="text-xs text-slate-500">PDF privado con la información disponible de la propiedad.</p></div>
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-bold text-slate-800">Datos de contacto</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {([{ value: true, label: "Con mis datos", help: "Incluye tu nombre, teléfono y correo." }, { value: false, label: "Sin mis datos", help: "Conserva únicamente el branding de la inmobiliaria." }] as const).map((option) => (
            <label key={String(option.value)} className={`cursor-pointer rounded-xl border p-3 transition ${includeAdvisorData === option.value ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white/70 hover:bg-white"}`}>
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><input type="radio" name="advisor-data" aria-label={option.label} checked={includeAdvisorData === option.value} onChange={() => setIncludeAdvisorData(option.value)} className="accent-violet-600" />{option.label}</span>
              <span className="mt-1 block pl-5 text-[11px] leading-relaxed text-slate-500">{option.help}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-5 block text-sm font-bold text-slate-800" htmlFor="share-expiration">Vigencia del enlace</label>
      <select id="share-expiration" value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value) as 1 | 7 | 30)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200">
        <option value={1}>24 horas</option><option value={7}>7 días</option><option value={30}>30 días</option>
      </select>

      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {success && <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><Check className="size-4" />{success}</p>}

      {share?.shareUrl && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3">
          <p className="text-xs font-semibold text-slate-600">Expira en {expiresInDays === 1 ? "24 horas" : `${expiresInDays} días`}.</p>
          <input aria-label="Enlace generado" readOnly value={share.shareUrl} onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600" />
          <button onClick={copy} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100">
            {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}{copied ? "Enlace copiado." : "Copiar enlace"}
          </button>
        </div>
      )}

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button disabled={working !== null} onClick={() => generate("pdf")} className="flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {working === "pdf" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{working === "pdf" ? "Generando ficha..." : "Descargar PDF"}
        </button>
        <button disabled={working !== null} onClick={() => generate("temporary_link")} className="flex items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-200 hover:bg-violet-700 disabled:opacity-60">
          {working === "link" ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />}{working === "link" ? "Generando enlace..." : "Generar enlace"}
        </button>
      </div>
    </GlassModal>
  );
}
