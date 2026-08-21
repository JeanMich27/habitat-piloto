// Estructura responsive de la app una vez con sesión iniciada.
//
// Rediseño Fase 1 (glass + neumórfico):
// - Desktop (md+): header translúcido con marca + usuario y una fila de
//   pestañas tipo píldora; la activa se marca con el acento violeta.
// - Móvil: header compacto y barra inferior FLOTANTE de vidrio (estilo
//   Samsung Health) con los 4 destinos principales + "Más" en hoja glass.
// Cada rol recibe solo sus destinos: el menú nunca muestra pantallas ajenas.
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { CloudOff, LogOut, Menu, X } from "lucide-react";
import LogoHomeID from "./LogoHomeID";

export interface NavItem {
  id: string;
  etiqueta: string;
  /** Etiqueta corta para la barra inferior en móvil */
  etiquetaCorta?: string;
  Icono: ComponentType<{ className?: string }>;
  badge?: number;
}

interface Props {
  items: NavItem[];
  vistaActiva: string;
  onNavegar: (id: string) => void;
  nombreUsuario: string;
  iniciales: string;
  etiquetaRol: string;
  modoNube: boolean;
  avisoNube?: string | null;
  onCerrarSesion: () => void;
  accionesExtra?: ReactNode;
  /** Campana de notificaciones (se inyecta desde App con los datos del usuario). */
  campana?: ReactNode;
  children: ReactNode;
}

export default function AppShell({
  items,
  vistaActiva,
  onNavegar,
  nombreUsuario,
  iniciales,
  etiquetaRol,
  modoNube,
  avisoNube,
  onCerrarSesion,
  accionesExtra,
  campana,
  children,
}: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [perfilAbierto, setPerfilAbierto] = useState(false);

  // Cierra las hojas al navegar.
  useEffect(() => {
    setMenuAbierto(false);
    setPerfilAbierto(false);
  }, [vistaActiva]);

  const principales = items.slice(0, 4);
  const secundarios = items.slice(4);
  const hayMas = secundarios.length > 0;
  const badgeTotalSecundarios = secundarios.reduce((acc, i) => acc + (i.badge ?? 0), 0);

  return (
    <div className="min-h-screen">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {/* El logo siempre regresa al inicio del rol (primer destino del menú). */}
            <button
              onClick={() => items[0] && onNavegar(items[0].id)}
              title="Ir al inicio"
              className="flex min-w-0 items-center gap-2 text-left"
            >
              <LogoHomeID />
            </button>
            <span
              title={
                modoNube
                  ? "Conectado a la base de datos compartida"
                  : "Modo local: los datos solo se guardan en este navegador"
              }
              className={`ml-1 hidden shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold backdrop-blur sm:flex ${
                modoNube && !avisoNube
                  ? "bg-emerald-50/80 text-emerald-700 ring-1 ring-emerald-200/80"
                  : "bg-amber-50/80 text-amber-700 ring-1 ring-amber-200/80"
              }`}
            >
              {modoNube && !avisoNube ? "● En vivo" : <><CloudOff className="size-3" /> Local</>}
            </span>
          </div>

          {/* Usuario */}
          <div className="relative flex shrink-0 items-center gap-2">
            {accionesExtra}
            {campana}
            <button
              onClick={() => setPerfilAbierto((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-white/70 bg-white/60 py-1 pl-1 pr-2.5 shadow-sm backdrop-blur transition-colors hover:bg-white/90"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-[11px] font-bold text-white">
                {iniciales}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block max-w-[140px] truncate text-xs font-bold text-slate-900">
                  {nombreUsuario}
                </span>
                <span className="block text-[10px] text-slate-500">{etiquetaRol}</span>
              </span>
            </button>
            {perfilAbierto && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPerfilAbierto(false)} />
                <div className="glass-strong absolute right-0 top-11 z-50 w-56 rounded-2xl p-2">
                  <div className="border-b border-slate-200/60 px-3 pb-2 pt-1 md:hidden">
                    <p className="truncate text-sm font-bold text-slate-900">{nombreUsuario}</p>
                    <p className="text-xs text-slate-500">{etiquetaRol}</p>
                  </div>
                  <button
                    onClick={onCerrarSesion}
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50/80"
                  >
                    <LogOut className="size-4" /> Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pestañas de navegación — solo desktop/tablet */}
        {items.length > 1 && (
          <div className="hidden border-t border-white/40 md:block">
            <div className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 py-1.5 sm:px-6">
              {items.map(({ id, etiqueta, Icono, badge }) => (
                <button
                  key={id}
                  onClick={() => onNavegar(id)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    vistaActiva === id
                      ? "bg-violet-600 text-white shadow-md shadow-violet-300/60"
                      : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
                  }`}
                >
                  <Icono className="size-3.5" />
                  {etiqueta}
                  {badge ? (
                    <span className="ml-0.5 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {avisoNube && (
        <div role="alert" className="mx-auto flex max-w-7xl items-center gap-2 px-4 pt-3 text-xs text-amber-700 sm:px-6">
          <CloudOff className="size-3.5 shrink-0" /> {avisoNube}
        </div>
      )}

      {/* ---------- Contenido ---------- */}
      {/* pb-28 en móvil deja espacio para la barra inferior flotante */}
      <div key={vistaActiva} className="animate-vista pb-28 md:pb-8">{children}</div>

      {/* ---------- Barra inferior flotante (solo móvil) ---------- */}
      {items.length > 1 && (
        <nav className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 md:hidden">
          {/* Fondo casi sólido: con vidrio muy translúcido la barra se perdía
              sobre el contenido al hacer scroll. */}
          <div className="mx-auto flex max-w-md items-stretch rounded-[1.75rem] border border-slate-200/80 bg-white px-1.5 py-1 shadow-xl shadow-slate-400/25">
            {principales.map(({ id, etiqueta, etiquetaCorta, Icono, badge }) => (
              <button
                key={id}
                onClick={() => onNavegar(id)}
                className={`relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                  vistaActiva === id ? "text-violet-700" : "text-slate-500"
                }`}
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-full transition ${
                    vistaActiva === id ? "bg-violet-100 shadow-inner" : ""
                  }`}
                >
                  <Icono className="size-5" />
                </span>
                {etiquetaCorta ?? etiqueta}
                {badge ? (
                  <span className="absolute right-1/4 top-1 rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white">
                    {badge}
                  </span>
                ) : null}
              </button>
            ))}
            {hayMas && (
              <button
                onClick={() => setMenuAbierto(true)}
                className={`relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                  secundarios.some((i) => i.id === vistaActiva) ? "text-violet-700" : "text-slate-500"
                }`}
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-full transition ${
                    secundarios.some((i) => i.id === vistaActiva) ? "bg-violet-100 shadow-inner" : ""
                  }`}
                >
                  <Menu className="size-5" />
                </span>
                Más
                {badgeTotalSecundarios ? (
                  <span className="absolute right-1/4 top-1 rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white">
                    {badgeTotalSecundarios}
                  </span>
                ) : null}
              </button>
            )}
          </div>
        </nav>
      )}

      {/* Hoja "Más" (móvil) */}
      {menuAbierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="animate-backdrop absolute inset-0 bg-slate-900/25 backdrop-blur-sm"
            onClick={() => setMenuAbierto(false)}
          />
          <div className="animate-modal absolute inset-x-0 bottom-0 rounded-t-[2rem] border-t border-slate-200/80 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300/70" />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">Más opciones</p>
              <button
                onClick={() => setMenuAbierto(false)}
                className="flex size-8 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-sm"
                aria-label="Cerrar menú"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {secundarios.map(({ id, etiqueta, Icono, badge }) => (
                <button
                  key={id}
                  onClick={() => onNavegar(id)}
                  className={`relative flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-center text-[11px] font-semibold leading-tight transition ${
                    vistaActiva === id
                      ? "bg-violet-600 text-white shadow-md shadow-violet-300/60"
                      : "bg-white/70 text-slate-600 shadow-sm hover:bg-white"
                  }`}
                >
                  <Icono className="size-5" />
                  {etiqueta}
                  {badge ? (
                    <span className="absolute right-2 top-2 rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white">
                      {badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
