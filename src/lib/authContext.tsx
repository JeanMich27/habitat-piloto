// Contexto de autenticación (Supabase Auth).
//
// Vincula la sesión de Auth con el perfil de public.usuarios (vía auth_id o
// correo). Expone: sesión, perfil, y acciones de registro / login / logout /
// recuperación de contraseña. En modo local (sin Supabase) no se usa; App.tsx
// muestra un selector de usuario de demostración.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { rowToUsuario } from "./rowMappers";
import { setAgenciaActual } from "./agenciaActual";
import type { UserRole, Usuario } from "../types";

interface AuthContextValue {
  sesion: Session | null;
  perfil: Usuario | null;
  cargando: boolean;
  /** true mientras Supabase procesa un enlace de recuperación de contraseña */
  enRecuperacion: boolean;
  registrarse: (datos: {
    nombre: string;
    correo: string;
    telefono: string;
    contrasena: string;
    rolSolicitado: UserRole;
    /** Código de la oficina. Obligatorio salvo que el correo ya haya sido invitado. */
    codigoInvitacion: string;
  }) => Promise<{ error?: string; requiereConfirmacion?: boolean }>;
  iniciarSesion: (correo: string, contrasena: string) => Promise<{ error?: string }>;
  cerrarSesion: () => Promise<void>;
  enviarRecuperacion: (correo: string) => Promise<{ error?: string }>;
  actualizarContrasena: (nueva: string) => Promise<{ error?: string }>;
  recargarPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Mensajes de error de Supabase traducidos a algo entendible.
function traducirError(mensaje?: string): string {
  if (!mensaje) return "Ocurrió un error. Intenta de nuevo.";
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Confirma tu correo antes de entrar (revisa tu bandeja).";
  if (m.includes("already registered")) return "Ya existe una cuenta con ese correo. Inicia sesión.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera un minuto e intenta de nuevo.";
  // Errores que lanza el trigger de alta multi-tenant.
  if (m.includes("código de invitación") || m.includes("codigo de invitacion"))
    return "El código de invitación no es válido. Pídeselo al broker de tu oficina.";
  if (m.includes("se requiere un código")) return "Necesitas el código de invitación de tu oficina para registrarte.";
  return mensaje;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(Boolean(supabase));
  const [enRecuperacion, setEnRecuperacion] = useState(false);

  const cargarPerfil = useCallback(async (s: Session | null) => {
    if (!supabase || !s?.user) {
      setPerfil(null);
      setAgenciaActual(null);
      return;
    }
    // Solo por auth_id. El respaldo por correo se eliminó: con RLS multi-tenant
    // una sesión sin perfil vinculado no ve ninguna fila, así que esa consulta
    // siempre devolvía null; y buscar por correo entre oficinas es justo el
    // patrón que se quiere evitar. El trigger de alta vincula el auth_id.
    const { data } = await supabase
      .from("usuarios")
      .select("*")
      .eq("auth_id", s.user.id)
      .maybeSingle();

    const usuario = data ? rowToUsuario(data) : null;
    setPerfil(usuario);
    // Debe fijarse ANTES de cualquier escritura: los mappers lo leen de aquí.
    setAgenciaActual(usuario?.agenciaId ?? null);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      setSesion(data.session);
      await cargarPerfil(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (evento, s) => {
      setSesion(s);
      if (evento === "PASSWORD_RECOVERY") setEnRecuperacion(true);
      await cargarPerfil(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [cargarPerfil]);

  const registrarse: AuthContextValue["registrarse"] = async ({
    nombre,
    correo,
    telefono,
    contrasena,
    rolSolicitado,
    codigoInvitacion,
  }) => {
    if (!supabase) return { error: "Sin conexión a la nube." };
    const { data, error } = await supabase.auth.signUp({
      email: correo.trim().toLowerCase(),
      password: contrasena,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          rol_solicitado: rolSolicitado,
          codigo_invitacion: codigoInvitacion.trim().toUpperCase(),
        },
      },
    });
    if (error) return { error: traducirError(error.message) };
    // Si no hay sesión inmediata, Supabase pide confirmar el correo.
    return { requiereConfirmacion: !data.session };
  };

  const iniciarSesion: AuthContextValue["iniciarSesion"] = async (correo, contrasena) => {
    if (!supabase) return { error: "Sin conexión a la nube." };
    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim().toLowerCase(),
      password: contrasena,
    });
    return error ? { error: traducirError(error.message) } : {};
  };

  const cerrarSesion = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setPerfil(null);
    setAgenciaActual(null);
    setEnRecuperacion(false);
  };

  const enviarRecuperacion: AuthContextValue["enviarRecuperacion"] = async (correo) => {
    if (!supabase) return { error: "Sin conexión a la nube." };
    const { error } = await supabase.auth.resetPasswordForEmail(correo.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });
    return error ? { error: traducirError(error.message) } : {};
  };

  const actualizarContrasena: AuthContextValue["actualizarContrasena"] = async (nueva) => {
    if (!supabase) return { error: "Sin conexión a la nube." };
    const { error } = await supabase.auth.updateUser({ password: nueva });
    if (!error) setEnRecuperacion(false);
    return error ? { error: traducirError(error.message) } : {};
  };

  const recargarPerfil = useCallback(async () => {
    await cargarPerfil(sesion);
  }, [cargarPerfil, sesion]);

  return (
    <AuthContext.Provider
      value={{
        sesion,
        perfil,
        cargando,
        enRecuperacion,
        registrarse,
        iniciarSesion,
        cerrarSesion,
        enviarRecuperacion,
        actualizarContrasena,
        recargarPerfil,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
