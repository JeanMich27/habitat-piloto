import { useEffect, useState } from "react";
import { Download, FileWarning, LoaderCircle } from "lucide-react";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/supabaseClient";

interface Props { token: string; }
interface ShareError { error?: string; }

export default function PublicSharedDocument({ token }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    const load = async () => {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { setError("Este enlace no está disponible."); return; }
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/share-document?token=${encodeURIComponent(token)}`, { headers: { apikey: SUPABASE_ANON_KEY } });
        if (!response.ok) {
          const details = await response.json().catch(() => null) as ShareError | null;
          setError(details?.error ?? "Este enlace no es válido."); return;
        }
        objectUrl = URL.createObjectURL(await response.blob()); setPdfUrl(objectUrl);
      } catch { setError("No pudimos abrir el documento. Revisa tu conexión."); }
    };
    void load();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [token]);

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
        <span className="text-sm font-bold tracking-wide">HomeID · Documento compartido</span>
        {pdfUrl && <a href={pdfUrl} download="ficha-tecnica.pdf" className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900"><Download className="size-3.5" /> Descargar PDF</a>}
      </header>
      <div className="flex flex-1 items-center justify-center p-3 sm:p-6">
        {!pdfUrl && !error && <div role="status" className="flex items-center gap-2 text-sm text-slate-300"><LoaderCircle className="size-5 animate-spin" />Abriendo documento seguro…</div>}
        {error && <div className="max-w-sm text-center"><FileWarning className="mx-auto size-10 text-slate-500" /><h1 className="mt-4 text-lg font-bold">{error}</h1><p className="mt-2 text-sm text-slate-400">Solicita un enlace nuevo a la persona que compartió el documento.</p></div>}
        {pdfUrl && <iframe title="Ficha técnica compartida" src={pdfUrl} className="h-[calc(100vh-6rem)] w-full max-w-5xl rounded-xl bg-white" />}
      </div>
    </main>
  );
}
