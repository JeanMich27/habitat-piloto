// Pantalla para cuentas registradas que aún no aprueba el broker.
import { useState } from "react";
import { Clock, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "../lib/authContext";

export default function PendienteAprobacion() {
  const { perfil, cerrarSesion, recargarPerfil } = useAuth();
  const [revisando, setRevisando] = useState(false);

  const revisar = async () => {
    setRevisando(true);
    await recargarPerfil();
    setRevisando(false);
  };

  const rechazada = perfil?.estadoCuenta === "Inactivo";

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center">
        <div className={`mx-auto flex size-14 items-center justify-center rounded-full ${rechazada ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500"}`}>
          <Clock className="size-7" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">
          {rechazada ? "Cuenta desactivada" : "Cuenta pendiente de aprobación"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {rechazada
            ? "Tu cuenta fue desactivada. Si crees que es un error, contacta al administrador de la agencia."
            : `Hola${perfil ? ` ${perfil.nombre.split(" ")[0]}` : ""}. Tu registro se recibió correctamente. El administrador debe aprobar tu cuenta antes de que puedas entrar; te avisaremos por correo.`}
        </p>
        <div className="mt-6 space-y-2">
          {!rechazada && (
            <button
              onClick={revisar}
              disabled={revisando}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${revisando ? "animate-spin" : ""}`} />
              Revisar si ya fue aprobada
            </button>
          )}
          <button
            onClick={cerrarSesion}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="size-4" /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
