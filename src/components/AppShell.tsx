// Estructura responsive de la app una vez con sesión iniciada.
//
// - Desktop (md+): header con marca + usuario, y una fila de pestañas.
// - Móvil: header compacto, barra de navegación inferior fija con los 4
//   destinos principales del rol + botón "Más" que abre una hoja con el resto.
// Cada rol recibe solo sus destinos: el menú nunca muestra pantallas ajenas.
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { CloudOff, LogOut, Menu, X } from "lucide-react";

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
    <div className="min-h-screen bg-white">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-black tracking-tight text-white">
              RE
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold text-slate-900">Real Estate</p>
              <p className="hidden text-[10px] uppercase tracking-widest text-slate-400 sm:block">
                Plataforma Inmobiliaria
              </p>
            </div>
            <span
              title={
                modoNube
                  ? "Conectado a la base de datos compartida"
                  : "Modo local: los datos solo se guardan en este navegador"
              }
              className={`ml-1 hidden shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold sm:flex ${
                modoNube && !avisoNube
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
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
              className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-2.5 transition-colors hover:bg-slate-50"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                {iniciales}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block max-w-[140px] truncate text-xs font-bold text-slate-900">
                  {nombreUsuario}
                </span>
                <span className="block text-[10px] text-slate-400">{etiquetaRol}</span>
              </span>
            </button>
            {perfilAbierto && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPerfilAbierto(false)} />
                <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                  <div className="border-b border-slate-100 px-3 pb-2 pt-1 md:hidden">
                    <p className="truncate text-sm font-bold text-slate-900">{nombreUsuario}</p>
                    <p className="text-xs text-slate-400">{etiquetaRol}</p>
                  </div>
                  <button
                    onClick={onCerrarSesion}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
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
          <div className="hidden border-t border-slate-100 md:block">
            <div className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 py-1.5 sm:px-6">
              {items.map(({ id, etiqueta, Icono, badge }) => (
                <button
                  key={id}
                  onClick={() => onNavegar(id)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    vistaActiva === id
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
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
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 pt-3 text-xs text-amber-700 sm:px-6">
          <CloudOff className="size-3.5 shrink-0" /> {avisoNube}
        </div>
      )}

      {/* ---------- Contenido ---------- */}
      {/* pb-24 en móvil deja espacio para la barra inferior */}
      <div key={vistaActiva} className="animate-vista pb-24 md:pb-8">{children}</div>

      {/* ---------- Barra inferior (solo móvil) ---------- */}
      {items.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-md items-stretch">
            {principales.map(({ id, etiqueta, etiquetaCorta, Icono, badge }) => (
              <button
                key={id}
                onClick={() => onNavegar(id)}
                className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                  vistaActiva === id ? "text-slate-900" : "text-slate-400"
                }`}
              >
                <Icono className="size-5" />
                {etiquetaCorta ?? etiqueta}
                {badge ? (
                  <span className="absolute right-1/4 top-1.5 rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white">
                    {badge}
                  </span>
                ) : null}
                {vistaActiva === id && (
                  <span className="absolute inset-x-4 top-0 h-0.5 rounded-b bg-slate-900" />
                )}
              </button>
            ))}
            {hayMas && (
              <button
                onClick={() => setMenuAbierto(true)}
                className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                  secundarios.some((i) => i.id === vistaActiva) ? "text-slate-900" : "text-slate-400"
                }`}
              >
                <Menu className="size-5" />
                Más
                {badgeTotalSecundarios ? (
                  <span className="absolute right-1/4 top-1.5 rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white">
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
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuAbierto(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">Más opciones</p>
              <button
                onClick={() => setMenuAbierto(false)}
                className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
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
                  className={`relative flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center text-[11px] font-semibold leading-tight ${
                    vistaActiva === id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
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
