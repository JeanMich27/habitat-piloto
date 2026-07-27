// Pantalla de acceso: iniciar sesión, crear cuenta y recuperar contraseña.
// Mobile-first: una sola columna, inputs grandes (44px+), sin scroll horizontal.
import { useState, type FormEvent } from "react";
import { Building2, Eye, EyeOff, Home, KeyRound, Loader2, Mail, User as UserIcon, Users } from "lucide-react";
import { useAuth } from "../lib/authContext";
import type { UserRole } from "../types";

type Modo = "login" | "registro" | "recuperar" | "nueva-contrasena";

const ROLES_REGISTRO: { valor: UserRole; titulo: string; descripcion: string; Icono: typeof Users }[] = [
  { valor: "asesor_equipo", titulo: "Asesor de equipo", descripcion: "Trabajo con un broker y su inventario", Icono: Users },
  { valor: "asesor_independiente", titulo: "Asesor independiente", descripcion: "Manejo mi propia operación", Icono: Building2 },
  { valor: "propietario", titulo: "Propietario", descripcion: "Quiero dar seguimiento a mi propiedad", Icono: Home },
  { valor: "cliente", titulo: "Cliente / Comprador", descripcion: "Estoy en proceso de compra o renta", Icono: UserIcon },
];

export default function AuthScreen() {
  const { registrarse, iniciarSesion, enviarRecuperacion, actualizarContrasena, enRecuperacion } = useAuth();
  const [modo, setModo] = useState<Modo>(enRecuperacion ? "nueva-contrasena" : "login");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [rol, setRol] = useState<UserRole>("asesor_equipo");
  const [verContrasena, setVerContrasena] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Si Supabase detecta un enlace de recuperación después de montar.
  if (enRecuperacion && modo !== "nueva-contrasena") setModo("nueva-contrasena");

  const cambiarModo = (m: Modo) => {
    setModo(m);
    setError(null);
    setAviso(null);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      if (modo === "login") {
        const r = await iniciarSesion(correo, contrasena);
        if (r.error) setError(r.error);
      } else if (modo === "registro") {
        if (!nombre.trim()) {
          setError("Escribe tu nombre completo.");
          return;
        }
        const r = await registrarse({ nombre, correo, telefono, contrasena, rolSolicitado: rol });
        if (r.error) {
          setError(r.error);
        } else if (r.requiereConfirmacion) {
          setAviso("Cuenta creada. Revisa tu correo y confirma tu dirección para poder entrar.");
          setModo("login");
        }
      } else if (modo === "recuperar") {
        const r = await enviarRecuperacion(correo);
        if (r.error) setError(r.error);
        else setAviso("Si el correo existe, te enviamos un enlace para restablecer tu contraseña.");
      } else if (modo === "nueva-contrasena") {
        if (contrasena.length < 6) {
          setError("La contraseña debe tener al menos 6 caracteres.");
          return;
        }
        const r = await actualizarContrasena(contrasena);
        if (r.error) setError(r.error);
      }
    } finally {
      setOcupado(false);
    }
  };

  const inputBase =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10";

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-md">
        {/* Marca */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-900 text-sm font-black tracking-tight text-white">
            RE
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">Real Estate</p>
            <p className="text-[11px] uppercase tracking-widest text-slate-400">Plataforma Inmobiliaria</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <h1 className="text-lg font-bold text-slate-900">
            {modo === "login" && "Iniciar sesión"}
            {modo === "registro" && "Crear cuenta"}
            {modo === "recuperar" && "Recuperar contraseña"}
            {modo === "nueva-contrasena" && "Nueva contraseña"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {modo === "login" && "Entra con tu correo y contraseña."}
            {modo === "registro" && "Tu cuenta quedará pendiente hasta que el administrador la apruebe."}
            {modo === "recuperar" && "Te enviaremos un enlace a tu correo."}
            {modo === "nueva-contrasena" && "Escribe tu nueva contraseña para continuar."}
          </p>

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          )}
          {aviso && (
            <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
              {aviso}
            </div>
          )}

          <form onSubmit={enviar} className="mt-5 space-y-4">
            {modo === "registro" && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Nombre completo</label>
                  <input
                    className={inputBase}
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Ana Beltrán"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Teléfono (opcional)</label>
                  <input
                    className={inputBase}
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="55 0000 0000"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>
              </>
            )}

            {modo !== "nueva-contrasena" && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Correo electrónico</label>
                <input
                  className={inputBase}
                  type="email"
                  required
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="tu@correo.com"
                  inputMode="email"
                  autoComplete="email"
                />
              </div>
            )}

            {modo !== "recuperar" && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  {modo === "nueva-contrasena" ? "Nueva contraseña" : "Contraseña"}
                </label>
                <div className="relative">
                  <input
                    className={`${inputBase} pr-12`}
                    type={verContrasena ? "text" : "password"}
                    required
                    minLength={6}
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    autoComplete={modo === "login" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setVerContrasena((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-600"
                    aria-label={verContrasena ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {verContrasena ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>
            )}

            {modo === "registro" && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">¿Cuál es tu rol?</label>
                <div className="grid gap-2">
                  {ROLES_REGISTRO.map(({ valor, titulo, descripcion, Icono }) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => setRol(valor)}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                        rol === valor
                          ? "border-slate-900 bg-slate-900/5 ring-1 ring-slate-900"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <Icono className={`size-5 shrink-0 ${rol === valor ? "text-slate-900" : "text-slate-400"}`} />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{titulo}</span>
                        <span className="block text-xs text-slate-500">{descripcion}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={ocupado}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {ocupado && <Loader2 className="size-4 animate-spin" />}
              {modo === "login" && "Entrar"}
              {modo === "registro" && "Crear cuenta"}
              {modo === "recuperar" && "Enviar enlace"}
              {modo === "nueva-contrasena" && "Guardar contraseña"}
            </button>
          </form>

          {/* Cambios de modo */}
          <div className="mt-5 space-y-2 text-center text-sm">
            {modo === "login" && (
              <>
                <button onClick={() => cambiarModo("recuperar")} className="flex w-full items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700">
                  <KeyRound className="size-3.5" /> Olvidé mi contraseña
                </button>
                <p className="text-slate-500">
                  ¿No tienes cuenta?{" "}
                  <button onClick={() => cambiarModo("registro")} className="font-semibold text-slate-900 underline">
                    Regístrate
                  </button>
                </p>
              </>
            )}
            {modo === "registro" && (
              <p className="text-slate-500">
                ¿Ya tienes cuenta?{" "}
                <button onClick={() => cambiarModo("login")} className="font-semibold text-slate-900 underline">
                  Inicia sesión
                </button>
              </p>
            )}
            {modo === "recuperar" && (
              <button onClick={() => cambiarModo("login")} className="flex w-full items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700">
                <Mail className="size-3.5" /> Volver a iniciar sesión
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
