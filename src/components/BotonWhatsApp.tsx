// Botón de WhatsApp con el mensaje ya redactado.
//
// Se desactiva solo cuando el teléfono no sirve, en vez de abrir un enlace
// roto: es preferible que el asesor vea "sin teléfono" a que WhatsApp le
// muestre un error sin explicación.
import type { Lead, Propiedad } from "../types";
import { enlaceWhatsApp, mensajeParaLead } from "../lib/whatsapp";

export function IconoWhatsApp({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.04 21.5h-.01c-1.75 0-3.47-.47-4.97-1.36l-.36-.21-3.7.97.99-3.61-.23-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.46-4.44 9.9-9.99 9.9m8.42-18.32A11.8 11.8 0 0 0 12.04 0C5.5 0 .17 5.33.17 11.88c0 2.09.55 4.13 1.59 5.93L.07 24l6.34-1.66a11.85 11.85 0 0 0 5.63 1.44h.01c6.54 0 11.87-5.33 11.87-11.88 0-3.17-1.24-6.15-3.48-8.4" />
    </svg>
  );
}

interface Props {
  lead: Lead;
  propiedad?: Propiedad;
  nombreAsesor?: string;
  /** Compacto = solo el ícono redondo (listas). */
  compacto?: boolean;
  /** Se dispara al abrir WhatsApp, para dejarlo asentado en el historial. */
  onContactar?: () => void;
}

export default function BotonWhatsApp({
  lead,
  propiedad,
  nombreAsesor,
  compacto = false,
  onContactar,
}: Props) {
  const enlace = enlaceWhatsApp(lead.telefono, mensajeParaLead(lead, propiedad, nombreAsesor));

  if (!enlace) {
    return compacto ? null : (
      <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-300">
        Sin teléfono
      </span>
    );
  }

  const comun =
    "shrink-0 items-center justify-center bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100";

  return (
    <a
      href={enlace}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.stopPropagation();
        onContactar?.();
      }}
      title={`Escribir a ${lead.nombre} por WhatsApp`}
      className={
        compacto
          ? `flex size-9 rounded-full ${comun}`
          : `flex gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${comun}`
      }
    >
      <IconoWhatsApp />
      {!compacto && "WhatsApp"}
    </a>
  );
}
