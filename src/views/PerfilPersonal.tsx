import { useState, type ReactNode } from "react";
import { Camera, KeyRound, Mail, Phone, User, X } from "lucide-react";
import type { Usuario } from "../types";

const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const telefonoValido = (v: string) => /^\d{10}$/.test(v.replace(/\D/g, ""));

interface Props {
  usuario: Usuario;
  onGuardar: (id: string, cambios: Partial<Usuario>) => Promise<boolean>;
  onCambiarContrasena: (actual: string, nueva: string) => Promise<string | null>;
  onCambiarCorreo?: (
    nuevo: string,
  ) => Promise<{ error?: string; requiereConfirmacion?: boolean }>;
}

export default function PerfilPersonal({
  usuario,
  onGuardar,
  onCambiarContrasena,
  onCambiarCorreo,
}: Props) {
  const [nombre, setNombre] = useState(usuario.nombre);
  const [correo, setCorreo] = useState(usuario.correo);
  const [telefono, setTelefono] = useState(usuario.telefono);
  const [guardado, setGuardado] = useState(false);
  const [modalPassword, setModalPassword] = useState(false);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState<string | null>(null);
  const [correoPendiente, setCorreoPendiente] = useState(false);

  const hayCambios =
    nombre !== usuario.nombre || correo !== usuario.correo || telefono !== usuario.telefono;
  const valido = nombre.trim() !== "" && emailValido(correo) && telefonoValido(telefono);

  const guardar = async () => {
    setGuardandoPerfil(true);
    setErrorPerfil(null);
    setCorreoPendiente(false);
    const correoCambio = correo.trim().toLowerCase() !== usuario.correo.toLowerCase();
    if (correoCambio) {
      if (!onCambiarCorreo) {
        setErrorPerfil("El cambio de correo no está disponible en esta sesión.");
        setGuardandoPerfil(false);
        return;
      }
      const resultadoCorreo = await onCambiarCorreo(correo);
      if (resultadoCorreo.error) {
        setErrorPerfil(resultadoCorreo.error);
        setGuardandoPerfil(false);
        return;
      }
      setCorreoPendiente(resultadoCorreo.requiereConfirmacion === true);
    }

    const cambioPerfil = nombre !== usuario.nombre || telefono !== usuario.telefono;
    const ok = cambioPerfil
      ? await onGuardar(usuario.id, { nombre: nombre.trim(), telefono })
      : true;
    setGuardandoPerfil(false);
    if (!ok) {
      setErrorPerfil("No se pudieron guardar los datos del perfil.");
      return;
    }
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-xl font-bold text-slate-900">Mi perfil</h1>
        <p className="text-sm text-slate-500">{usuario.puesto}</p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-full bg-slate-800 text-xl font-bold text-white">
            {usuario.iniciales}
          </span>
          <button
            disabled
            title="Sin almacenamiento de archivos en el prototipo"
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-300 cursor-not-allowed"
          >
            <Camera className="size-3.5" /> Cambiar foto
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <Campo label="Nombre" icon={User}>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" />
          </Campo>
          <Campo
            label="Correo"
            icon={Mail}
            error={correo !== "" && !emailValido(correo) ? "Correo inválido" : undefined}
          >
            <input value={correo} onChange={(e) => setCorreo(e.target.value)} className="input" />
          </Campo>
          <Campo
            label="Teléfono"
            icon={Phone}
            error={telefono !== "" && !telefonoValido(telefono) ? "Deben ser 10 dígitos" : undefined}
          >
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="input" />
          </Campo>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            disabled={guardandoPerfil || !hayCambios || !valido}
            onClick={guardar}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {guardandoPerfil ? "Guardando…" : "Guardar cambios"}
          </button>
          {guardado && <span className="text-xs font-medium text-emerald-600">Guardado ✓</span>}
        </div>
        {correoPendiente && (
          <p role="status" className="mt-3 text-xs text-amber-700">
            Revisa ambos correos para confirmar el cambio. Hasta entonces seguirás entrando con {usuario.correo}.
          </p>
        )}
        {errorPerfil && <p role="alert" className="mt-3 text-xs text-rose-600">{errorPerfil}</p>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-700">Seguridad</h2>
        <p className="mt-1 text-xs text-slate-500">
          Estado de la cuenta: <span className="font-semibold">{usuario.estadoCuenta}</span>
        </p>
        <button
          onClick={() => setModalPassword(true)}
          className="mt-4 flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <KeyRound className="size-3.5" /> Cambiar contraseña
        </button>
      </div>

      {modalPassword && (
        <ModalPassword onCerrar={() => setModalPassword(false)} onCambiar={onCambiarContrasena} />
      )}
    </div>
  );
}

function Campo({
  label,
  icon: Icon,
  error,
  children,
}: {
  label: string;
  icon: typeof User;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="size-3.5" /> {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </div>
  );
}

function ModalPassword({
  onCerrar,
  onCambiar,
}: {
  onCerrar: () => void;
  onCambiar: (actual: string, nueva: string) => Promise<string | null>;
}) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [listo, setListo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeGuardar = actual !== "" && nueva.length >= 8 && nueva === confirmar;

  if (listo) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-emerald-700">Contraseña actualizada ✓</p>
          <button
            onClick={onCerrar}
            className="mt-4 w-full rounded-lg bg-slate-800 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900">Cambiar contraseña</h2>
          <button onClick={onCerrar} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Contraseña actual
        </label>
        <input
          type="password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          className="input mt-1"
        />

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Nueva contraseña
        </label>
        <input
          type="password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          className="input mt-1"
        />
        {nueva !== "" && nueva.length < 8 && (
          <p className="mt-1 text-xs text-rose-500">Mínimo 8 caracteres.</p>
        )}

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Confirmar nueva contraseña
        </label>
        <input
          type="password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          className="input mt-1"
        />
        {confirmar !== "" && confirmar !== nueva && (
          <p className="mt-1 text-xs text-rose-500">Las contraseñas no coinciden.</p>
        )}

        <button
          disabled={!puedeGuardar || guardando}
          onClick={async () => {
            setGuardando(true);
            setError(null);
            const resultado = await onCambiar(actual, nueva);
            setGuardando(false);
            if (resultado) setError(resultado);
            else setListo(true);
          }}
          className="mt-6 w-full rounded-lg bg-slate-800 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          {guardando ? "Guardando…" : "Guardar nueva contraseña"}
        </button>
        {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
