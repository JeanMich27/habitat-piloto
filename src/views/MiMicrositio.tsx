// Resumen embebido en Mi perfil. Ya no es una vista ni un destino del menú:
// el micrositio consume exactamente los datos del perfil del usuario.
import { useState } from "react";
import { Check, Copy, ExternalLink, Globe } from "lucide-react";
import type { AgenciaInfo, Usuario } from "../types";

export default function MiMicrositio({ usuario, agencia }: { usuario: Usuario; agencia: AgenciaInfo }) {
  const [copiado, setCopiado] = useState(false);
  const url = usuario.slugPublico ? `${window.location.origin}/m/${usuario.slugPublico}` : null;
  const faltantes = [
    ...(!usuario.fotoUrl ? ["foto"] : []),
    ...(!usuario.bioCorta ? ["biografía"] : []),
    ...(!usuario.especialidades?.length ? ["especialidades"] : []),
  ];

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch { /* El enlace permanece visible para copiarlo manualmente. */ }
  };

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/70 p-6" aria-labelledby="micrositio-perfil-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="micrositio-perfil-titulo" className="flex items-center gap-2 text-sm font-bold text-slate-800"><Globe className="size-4 text-violet-600" /> Tu micrositio público</h2>
          <p className="mt-1 text-xs text-slate-600">Se actualiza con la información de este perfil; no tienes que capturarla dos veces.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${faltantes.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>{faltantes.length ? "Por completar" : "Completo"}</span>
      </div>
      {faltantes.length > 0 && <p className="mt-3 text-xs text-amber-800">Te falta: {faltantes.join(", ")}.</p>}
      {url ? <><div className="mt-4 flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2"><span className="min-w-0 flex-1 truncate text-xs text-slate-600">{url}</span><button type="button" onClick={() => void copiar()} className="flex items-center gap-1 text-xs font-bold text-violet-700">{copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copiado ? "Copiado" : "Copiar"}</button></div><div className="mt-3 flex flex-wrap gap-2"><a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"><ExternalLink className="size-3.5" /> Ver micrositio</a><a href={`https://wa.me/?text=${encodeURIComponent(`Conoce mi perfil y propiedades en ${url}`)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700">Compartir por WhatsApp</a></div></> : <p className="mt-4 text-xs text-slate-500">El enlace público se generará al guardar tu perfil en la nube.</p>}
      <p className="mt-4 text-[11px] text-slate-500">Marca mostrada: {agencia.nombre}. No se publica tu correo ni información interna.</p>
    </section>
  );
}
