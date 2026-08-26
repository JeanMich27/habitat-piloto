import { useState, type ChangeEvent, type ReactNode } from "react";
import { Camera, ExternalLink, KeyRound, LoaderCircle, Mail, Phone, User, X } from "lucide-react";
import type { Usuario } from "../types";
import { canGenerateDocuments } from "../domain/documents/documentPolicy";
import { supabase } from "../lib/supabaseClient";

const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const telefonoValido = (v: string) => /^\d{10}$/.test(v.replace(/\D/g, ""));

const TIPOS_FOTO_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANO_MAXIMO_FOTO = 5 * 1024 * 1024;

const listaATexto = (valores?: string[]): string => (valores ?? []).join(", ");
const textoALista = (valor: string): string[] =>
  valor.split(",").map((parte) => parte.trim()).filter(Boolean);

interface Props {
  usuario: Usuario;
  onGuardar: (id: string, cambios: Partial<Usuario>) => Promise<boolean>;
  onCambiarContrasena: (actual: string, nueva: string) => Promise<string | null>;
  onCambiarCorreo?: (
    nuevo: string,
  ) => Promise<{ error?: string; requiereConfirmacion?: boolean }>;
  onIrAMicrositio?: () => void;
}

export default function PerfilPersonal({
  usuario,
  onGuardar,
  onCambiarContrasena,
  onCambiarCorreo,
  onIrAMicrositio,
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

  const mostrarInformacionPublica = canGenerateDocuments(usuario.rol);

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

      {mostrarInformacionPublica && (
        <InformacionPublica usuario={usuario} onGuardar={onGuardar} onIrAMicrositio={onIrAMicrositio} />
      )}

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

// Sección "Información pública": lo que alimenta el micrositio del asesor
// (ver decision-perfil-asesor-micrositio.md). Visible solo para los roles que
// pueden tener micrositio propio — broker, asesor independiente, asesor de
// equipo — porque es imagen personal, no un dato operativo de la cuenta.
//
// El micrositio ya está activo aunque estos campos estén vacíos (decisión de
// Jean, 26 ago 2026): esta sección nunca bloquea nada, solo ofrece guardar.
function InformacionPublica({
  usuario,
  onGuardar,
  onIrAMicrositio,
}: {
  usuario: Usuario;
  onGuardar: (id: string, cambios: Partial<Usuario>) => Promise<boolean>;
  onIrAMicrositio?: () => void;
}) {
  const redSocial = (red: string) => usuario.redesSociales?.find((r) => r.red === red)?.url ?? "";

  const [fotoUrl, setFotoUrl] = useState(usuario.fotoUrl ?? "");
  const [bioCorta, setBioCorta] = useState(usuario.bioCorta ?? "");
  const [especialidadesTexto, setEspecialidadesTexto] = useState(listaATexto(usuario.especialidades));
  const [anosExperiencia, setAnosExperiencia] = useState(
    usuario.anosExperiencia != null ? String(usuario.anosExperiencia) : "",
  );
  const [idiomasTexto, setIdiomasTexto] = useState(listaATexto(usuario.idiomas));
  const [certificacionesTexto, setCertificacionesTexto] = useState(listaATexto(usuario.certificaciones));
  const [instagram, setInstagram] = useState(redSocial("instagram"));
  const [linkedin, setLinkedin] = useState(redSocial("linkedin"));

  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hayCambios =
    fotoUrl !== (usuario.fotoUrl ?? "") ||
    bioCorta !== (usuario.bioCorta ?? "") ||
    especialidadesTexto !== listaATexto(usuario.especialidades) ||
    anosExperiencia !== (usuario.anosExperiencia != null ? String(usuario.anosExperiencia) : "") ||
    idiomasTexto !== listaATexto(usuario.idiomas) ||
    certificacionesTexto !== listaATexto(usuario.certificaciones) ||
    instagram !== redSocial("instagram") ||
    linkedin !== redSocial("linkedin");

  const anosValido = anosExperiencia.trim() === "" || /^\d+$/.test(anosExperiencia.trim());
  const valido = bioCorta.length <= 280 && anosValido;

  const subirFoto = async (archivo: File) => {
    if (!supabase) {
      setErrorFoto("La foto no se puede subir en modo demostración.");
      return;
    }
    setErrorFoto(null);
    setSubiendoFoto(true);
    try {
      const { data: sesion, error: errorSesion } = await supabase.auth.getUser();
      if (errorSesion || !sesion.user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      const extension = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
      const ruta = `${sesion.user.id}/foto.${extension}`;
      const { error: errorSubida } = await supabase.storage
        .from("avatares-publicos")
        .upload(ruta, archivo, { upsert: true, cacheControl: "3600" });
      if (errorSubida) throw errorSubida;
      const { data: publico } = supabase.storage.from("avatares-publicos").getPublicUrl(ruta);
      setFotoUrl(`${publico.publicUrl}?v=${Date.now()}`);
    } catch (e) {
      setErrorFoto(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setSubiendoFoto(false);
    }
  };

  const onSeleccionarFoto = (evento: ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;
    if (!TIPOS_FOTO_PERMITIDOS.includes(archivo.type)) {
      setErrorFoto("Solo se aceptan imágenes JPG, PNG o WEBP.");
      return;
    }
    if (archivo.size > TAMANO_MAXIMO_FOTO) {
      setErrorFoto("La imagen no debe superar 5MB.");
      return;
    }
    void subirFoto(archivo);
  };

  const guardarInformacionPublica = async () => {
    setGuardando(true);
    setError(null);
    const redesSociales = [
      ...(instagram.trim() ? [{ red: "instagram", url: instagram.trim() }] : []),
      ...(linkedin.trim() ? [{ red: "linkedin", url: linkedin.trim() }] : []),
    ];
    const ok = await onGuardar(usuario.id, {
      fotoUrl: fotoUrl.trim() || undefined,
      bioCorta: bioCorta.trim() || undefined,
      especialidades: textoALista(especialidadesTexto),
      anosExperiencia: anosExperiencia.trim() === "" ? undefined : Number(anosExperiencia.trim()),
      idiomas: textoALista(idiomasTexto),
      certificaciones: textoALista(certificacionesTexto),
      redesSociales,
    });
    setGuardando(false);
    if (!ok) {
      setError("No se pudo guardar tu información pública.");
      return;
    }
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2500);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Información pública</h2>
          <p className="mt-1 text-xs text-slate-500">
            Esto es lo que ven tus clientes en tu micrositio. Ya está activo con o sin esta
            información — tú decides cuándo se ve completo.
          </p>
        </div>
        {onIrAMicrositio && (
          <button
            onClick={onIrAMicrositio}
            className="flex shrink-0 items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
          >
            Ver mi micrositio <ExternalLink className="size-3" />
          </button>
        )}
      </div>

      <div className="mt-5 flex items-center gap-4">
        {fotoUrl ? (
          <img src={fotoUrl} alt={usuario.nombre} className="size-16 rounded-full object-cover" />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-xl font-bold text-white">
            {usuario.iniciales}
          </span>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {subiendoFoto ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Camera className="size-3.5" />
          )}
          {subiendoFoto ? "Subiendo…" : "Cambiar foto"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={subiendoFoto}
            onChange={onSeleccionarFoto}
          />
        </label>
      </div>
      {errorFoto && <p role="alert" className="mt-2 text-xs text-rose-600">{errorFoto}</p>}

      <div className="mt-5 space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Biografía corta
            </label>
            <span className={`text-[11px] ${bioCorta.length > 280 ? "text-rose-500" : "text-slate-400"}`}>
              {bioCorta.length}/280
            </span>
          </div>
          <textarea
            value={bioCorta}
            onChange={(e) => setBioCorta(e.target.value)}
            maxLength={280}
            rows={3}
            placeholder="Cuéntale a tus clientes qué te distingue: tu experiencia, tu zona, tu enfoque."
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Especialidades
          </label>
          <input
            value={especialidadesTexto}
            onChange={(e) => setEspecialidadesTexto(e.target.value)}
            placeholder="Residencial media-alta, Preventas, Terrenos"
            className="input"
          />
          <p className="mt-1 text-[11px] text-slate-400">Sepáralas con comas.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Años de experiencia
          </label>
          <input
            value={anosExperiencia}
            onChange={(e) => setAnosExperiencia(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Idiomas
          </label>
          <input
            value={idiomasTexto}
            onChange={(e) => setIdiomasTexto(e.target.value)}
            placeholder="Español, Inglés"
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Certificaciones
          </label>
          <input
            value={certificacionesTexto}
            onChange={(e) => setCertificacionesTexto(e.target.value)}
            placeholder="AMPI, Especialista en preventas"
            className="input"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Instagram
            </label>
            <input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="https://instagram.com/tu-usuario"
              className="input"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              LinkedIn
            </label>
            <input
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="https://linkedin.com/in/tu-usuario"
              className="input"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          disabled={guardando || !hayCambios || !valido}
          onClick={guardarInformacionPublica}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          {guardando ? "Guardando…" : "Guardar información pública"}
        </button>
        {guardadoOk && <span className="text-xs font-medium text-emerald-600">Guardado ✓</span>}
      </div>
      {!anosValido && (
        <p className="mt-2 text-xs text-rose-500">Los años de experiencia deben ser un número.</p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
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
