import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

/**
 * Banner que invita a instalar la app en la pantalla de inicio del teléfono.
 *
 * Dos caminos distintos porque los navegadores no se comportan igual:
 *  - Android/Chrome/Edge: disparan `beforeinstallprompt` y podemos instalar
 *    con un botón real.
 *  - iOS/Safari: Apple no expone ninguna API de instalación. Lo único posible
 *    es explicarle al usuario la ruta manual (Compartir → Añadir a inicio).
 *
 * Si la app ya está instalada, el banner no se muestra nunca.
 */

const CLAVE_DESCARTADO = "banner-instalacion-descartado";
const DIAS_ANTES_DE_REINSISTIR = 30;

type PromptInstalacion = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function yaEstaInstalada() {
  if (typeof window === "undefined") return false;
  const enStandalone = window.matchMedia("(display-mode: standalone)").matches;
  // Safari en iOS no soporta display-mode; usa esta propiedad propietaria.
  const enStandaloneIOS =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return enStandalone || enStandaloneIOS;
}

function esIOS() {
  const ua = window.navigator.userAgent;
  const iPadOS13oMayor = /Macintosh/.test(ua) && "ontouchend" in document;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS13oMayor;
}

function esSafari() {
  const ua = window.navigator.userAgent;
  // En iOS, Chrome (CriOS) y Firefox (FxiOS) NO pueden instalar PWAs.
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function fueDescartadoRecientemente() {
  try {
    const guardado = window.localStorage.getItem(CLAVE_DESCARTADO);
    if (!guardado) return false;
    const dias = (Date.now() - Number(guardado)) / 86_400_000;
    return dias < DIAS_ANTES_DE_REINSISTIR;
  } catch {
    return false;
  }
}

export default function BannerInstalacion() {
  const [prompt, setPrompt] = useState<PromptInstalacion | null>(null);
  const [mostrarPasosIOS, setMostrarPasosIOS] = useState(false);
  const [oculto, setOculto] = useState(true);

  useEffect(() => {
    if (yaEstaInstalada() || fueDescartadoRecientemente()) return;

    // Android y escritorio: esperamos el evento del navegador.
    const alRecibirPrompt = (evento: Event) => {
      evento.preventDefault();
      setPrompt(evento as PromptInstalacion);
      setOculto(false);
    };
    window.addEventListener("beforeinstallprompt", alRecibirPrompt);

    // iOS: no hay evento, así que decidimos nosotros si mostrar instrucciones.
    if (esIOS() && esSafari()) {
      setMostrarPasosIOS(true);
      setOculto(false);
    }

    const alInstalar = () => setOculto(true);
    window.addEventListener("appinstalled", alInstalar);

    return () => {
      window.removeEventListener("beforeinstallprompt", alRecibirPrompt);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  const descartar = () => {
    setOculto(true);
    try {
      window.localStorage.setItem(CLAVE_DESCARTADO, String(Date.now()));
    } catch {
      /* modo privado: no pasa nada, solo no recordamos el descarte */
    }
  };

  const instalar = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setOculto(true);
    else descartar();
    setPrompt(null);
  };

  if (oculto) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white shadow-xl">
        <img
          src="/icon-192.png"
          alt=""
          className="size-10 shrink-0 rounded-xl"
          width={40}
          height={40}
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Instala la app en tu teléfono</p>

          {mostrarPasosIOS ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs leading-relaxed text-slate-300">
              Toca
              <Share className="inline size-3.5 shrink-0" aria-label="Compartir" />
              <span className="font-semibold text-white">Compartir</span>
              y luego
              <SquarePlus className="inline size-3.5 shrink-0" aria-hidden />
              <span className="font-semibold text-white">Añadir a pantalla de inicio</span>.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                Acceso directo, pantalla completa y abre más rápido.
              </p>
              <button
                onClick={instalar}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-400"
              >
                <Download className="size-3.5" />
                Instalar
              </button>
            </>
          )}
        </div>

        <button
          onClick={descartar}
          aria-label="Cerrar aviso de instalación"
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
