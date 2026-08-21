// Pantalla de acceso: iniciar sesión, crear cuenta y recuperar contraseña.
// Mobile-first: una sola columna, inputs grandes (44px+), sin scroll horizontal.
import { useState, type FormEvent } from "react";
import {
  Briefcase, Building2, Eye, EyeOff, Home, KeyRound, Loader2, Mail,
  User as UserIcon, Users,
} from "lucide-react";
import { MarcaHomeID } from "../components/LogoHomeID";
import { useAuth } from "../lib/authContext";
import type { UserRole } from "../types";

type Modo = "login" | "registro" | "recuperar" | "nueva-contrasena";

// El rol va PRIMERO en el formulario, no al final: es lo que decide qué datos
// se piden después. Un broker abre oficina y captura su ficha; todos los demás
// se unen a una oficina que ya existe.
const ROLES_REGISTRO: { valor: UserRole; titulo: string; descripcion: string; Icono: typeof Users }[] = [
  { valor: "broker", titulo: "Broker / Administrador", descripcion: "Abro la cuenta de mi inmobiliaria y doy de alta a mi equipo", Icono: Briefcase },
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
  const [codigoInvitacion, setCodigoInvitacion] = useState("");
  // Alta de oficina nueva (solo cuando el rol elegido es broker).
  const [codigoAlta, setCodigoAlta] = useState("");
  const [ofiNombre, setOfiNombre] = useState("");
  const [ofiTelefono, setOfiTelefono] = useState("");
  const [ofiDireccion, setOfiDireccion] = useState("");
  const [ofiCiudad, setOfiCiudad] = useState("");
  const [ofiSitio, setOfiSitio] = useState("");
  const [ofiCrm, setOfiCrm] = useState<"ninguno" | "easybroker">("ninguno");
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
        // Un broker puede llegar aquí por dos caminos distintos:
        //   - abre oficina nueva  -> captura la ficha y trae código de alta;
        //   - su oficina YA existe y el otro broker lo dio de alta con este
        //     correo -> no captura nada, y la base lo engancha por el correo.
        // Solo se exige el nombre de la inmobiliaria cuando es evidente que
        // está intentando lo primero. Si no llena nada, se manda sin ficha y
        // que decida la base: si el correo no estaba invitado, responde
        // "se requiere un código de alta", que es exactamente lo que pasa.
        const abriendoOficina =
          rol === "broker" && Boolean(ofiNombre.trim() || codigoAlta.trim());
        if (abriendoOficina && !ofiNombre.trim()) {
          setError("Escribe el nombre de tu inmobiliaria.");
          return;
        }
        const r = await registrarse({
          nombre,
          correo,
          telefono,
          contrasena,
          rolSolicitado: rol,
          codigoInvitacion,
          oficina: abriendoOficina
              ? {
                  codigoAlta,
                  nombre: ofiNombre,
                  telefono: ofiTelefono,
                  direccion: ofiDireccion,
                  ciudad: ofiCiudad,
                  sitioWeb: ofiSitio,
                  crm: ofiCrm,
                }
            : undefined,
        });
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
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10";

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-md">
        {/* Marca — vertical y centrada, en la proporción del logotipo original. */}
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <MarcaHomeID className="size-20" />
          <div>
            <p className="text-2xl font-bold tracking-[0.22em] text-slate-900">
              HOME<span className="text-violet-600">ID</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-slate-500">
              Plataforma inmobiliaria
            </p>
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
            {modo === "registro" &&
              (rol === "broker"
                ? "Vas a crear la cuenta de tu inmobiliaria. Después das de alta a tu equipo desde la app."
                : "Tu cuenta quedará pendiente hasta que el administrador de tu oficina la apruebe.")}
            {modo === "recuperar" && "Te enviaremos un enlace a tu correo."}
            {modo === "nueva-contrasena" && "Escribe tu nueva contraseña para continuar."}
          </p>

          {error && (
            <div role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          )}
          {aviso && (
            <div role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
              {aviso}
            </div>
          )}

          <form onSubmit={enviar} className="mt-5 space-y-4">
            {modo === "registro" && (
              <>
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
                        <Icono className={`size-5 shrink-0 ${rol === valor ? "text-slate-900" : "text-slate-500"}`} />
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">{titulo}</span>
                          <span className="block text-xs text-slate-500">{descripcion}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="auth-nombre" className="mb-1.5 block text-xs font-semibold text-slate-600">Nombre completo</label>
                  <input
                    id="auth-nombre"
                    className={inputBase}
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Ana Beltrán"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label htmlFor="auth-telefono" className="mb-1.5 block text-xs font-semibold text-slate-600">Teléfono (opcional)</label>
                  <input
                    id="auth-telefono"
                    className={inputBase}
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="55 0000 0000"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>
                {rol === "broker" ? (
                  /* Alta de oficina. Se piden los datos de la inmobiliaria
                     porque esta persona no se une a nada: está creando el
                     tenant, y esa ficha es lo que verán sus asesores, sus
                     propietarios y sus clientes dentro de la app. */
                  <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Datos de tu inmobiliaria
                    </p>
                    <p className="-mt-2 text-xs text-slate-500">
                      ¿Tu oficina ya existe y el otro administrador te dio de alta con este mismo
                      correo? Deja todo esto vacío: entras directo.
                    </p>
                    <div>
                      <label htmlFor="auth-ofi-nombre" className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Nombre de la inmobiliaria
                      </label>
                      <input
                        id="auth-ofi-nombre"
                        className={inputBase}
                        value={ofiNombre}
                        onChange={(e) => setOfiNombre(e.target.value)}
                        placeholder="Ej. Hábitat Bienes Raíces"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="auth-ofi-ciudad" className="mb-1.5 block text-xs font-semibold text-slate-600">Ciudad</label>
                        <input id="auth-ofi-ciudad" className={inputBase} value={ofiCiudad}
                          onChange={(e) => setOfiCiudad(e.target.value)} placeholder="Ej. Naucalpan" />
                      </div>
                      <div>
                        <label htmlFor="auth-ofi-telefono" className="mb-1.5 block text-xs font-semibold text-slate-600">Teléfono de la oficina</label>
                        <input id="auth-ofi-telefono" className={inputBase} value={ofiTelefono} inputMode="tel"
                          onChange={(e) => setOfiTelefono(e.target.value)} placeholder="55 0000 0000" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="auth-ofi-direccion" className="mb-1.5 block text-xs font-semibold text-slate-600">Dirección (opcional)</label>
                      <input id="auth-ofi-direccion" className={inputBase} value={ofiDireccion}
                        onChange={(e) => setOfiDireccion(e.target.value)} placeholder="Calle, número, colonia" />
                    </div>
                    <div>
                      <label htmlFor="auth-ofi-sitio" className="mb-1.5 block text-xs font-semibold text-slate-600">Sitio web (opcional)</label>
                      <input id="auth-ofi-sitio" className={inputBase} value={ofiSitio}
                        onChange={(e) => setOfiSitio(e.target.value)} placeholder="https://" />
                    </div>

                    {/* De dónde sale la información. Es la decisión que más
                        cambia la app: con CRM, el inventario y la cartera los
                        manda el CRM y la app no deja pisarlos; sin CRM, la
                        oficina captura todo aquí y esta plataforma ES su CRM. */}
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        ¿De dónde va a salir tu información?
                      </label>
                      <div className="grid gap-2">
                        {([
                          { valor: "ninguno" as const, titulo: "Sin CRM — capturo todo aquí",
                            detalle: "Esta plataforma es tu CRM: das de alta propiedades y clientes a mano." },
                          { valor: "easybroker" as const, titulo: "Uso EasyBroker",
                            detalle: "Tu inventario y tus contactos los manda EasyBroker; la app agrega el embudo y el seguimiento." },
                        ]).map((op) => (
                          <button
                            key={op.valor}
                            type="button"
                            onClick={() => setOfiCrm(op.valor)}
                            aria-pressed={ofiCrm === op.valor}
                            className={`rounded-xl border px-4 py-3 text-left transition ${
                              ofiCrm === op.valor
                                ? "border-slate-900 bg-white ring-1 ring-slate-900"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <span className="block text-sm font-semibold text-slate-900">{op.titulo}</span>
                            <span className="block text-xs text-slate-500">{op.detalle}</span>
                          </button>
                        ))}
                      </div>
                      {ofiCrm === "easybroker" && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          Después de crear la cuenta hay que conectar tu llave de EasyBroker. Te la pedimos
                          por separado: nunca viaja en este formulario.
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="auth-codigo-alta" className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Código de alta
                      </label>
                      <input
                        id="auth-codigo-alta"
                        className={`${inputBase} uppercase tracking-wider`}
                        value={codigoAlta}
                        onChange={(e) => setCodigoAlta(e.target.value.toUpperCase())}
                        placeholder="ALTA-XXXXXXXXXX"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <p className="mt-1.5 text-xs text-slate-500">
                        Te lo entrega la plataforma al contratar. Es lo que habilita crear una oficina nueva.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="auth-codigo-invitacion" className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Código de invitación
                    </label>
                    <input
                      id="auth-codigo-invitacion"
                      className={`${inputBase} uppercase tracking-wider`}
                      value={codigoInvitacion}
                      onChange={(e) => setCodigoInvitacion(e.target.value.toUpperCase())}
                      placeholder="INV-XXXXXXXX"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p className="mt-1.5 text-xs text-slate-500">
                      Te lo da el broker de tu oficina. Si tu broker ya te dio de alta con este mismo correo,
                      déjalo vacío: entras directo a tu oficina.
                    </p>
                  </div>
                )}
              </>
            )}

            {modo !== "nueva-contrasena" && (
              <div>
                <label htmlFor="auth-correo" className="mb-1.5 block text-xs font-semibold text-slate-600">Correo electrónico</label>
                <input
                  id="auth-correo"
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
                <label htmlFor="auth-contrasena" className="mb-1.5 block text-xs font-semibold text-slate-600">
                  {modo === "nueva-contrasena" ? "Nueva contraseña" : "Contraseña"}
                </label>
                <div className="relative">
                  <input
                    id="auth-contrasena"
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
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 hover:text-slate-600"
                    aria-label={verContrasena ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {verContrasena ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
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
