// Equipo de la oficina (solo Broker). Tres cosas en una pantalla:
//
//   1. DAR DE ALTA a alguien: el broker captura nombre y correo, y la persona
//      queda "Invitada". Cuando esa persona cree su cuenta CON ESE MISMO
//      CORREO, la base la engancha sola a esta oficina, con el rol que el
//      broker le puso, y la pasa a "Activa". No hace falta que el broker le
//      mande ningún código: el correo ES la invitación.
//   2. QUIÉN ESTÁ y en qué estado.
//   3. SOLICITUDES PENDIENTES: gente que se registró por su cuenta con el
//      código de la oficina y espera aprobación.
//
// Por qué el alta por correo y no por código: con el código, quien lo tenga
// entra. Dando de alta el correo, el broker decide exactamente quién puede
// entrar a su oficina, y de qué tamaño es su equipo no depende de quién
// reenvió un mensaje de WhatsApp.
import { useMemo, useState } from "react";
import { Check, Copy, ShieldQuestion, UserPlus, X } from "lucide-react";
import type { AgenciaInfo, UserRole, Usuario } from "../types";

const ETIQUETAS_ROL: Record<UserRole, string> = {
  broker: "Broker / Admin",
  asesor_independiente: "Asesor independiente",
  asesor_equipo: "Asesor de equipo",
  propietario: "Propietario",
  cliente: "Cliente",
};

// Al APROBAR una solicitud el broker no puede otorgar el rol broker: eso sería
// escalar permisos con un clic distraído. Para nombrar a un segundo
// administrador se usa el alta de arriba, que es un acto deliberado.
const ROLES_ASIGNABLES: UserRole[] = ["asesor_equipo", "asesor_independiente", "propietario", "cliente"];
const ROLES_ALTA: UserRole[] = ["asesor_equipo", "asesor_independiente", "propietario", "cliente", "broker"];

interface Props {
  usuarios: Usuario[];
  agencia: AgenciaInfo;
  onResolver: (usuarioId: string, cambios: Partial<Usuario>) => void;
  /** Devuelve un mensaje de error, o null si el alta salió bien. */
  onInvitar: (datos: { nombre: string; correo: string; telefono: string; rol: UserRole }) => Promise<string | null>;
}

const COLOR_ESTADO: Record<string, string> = {
  Activo: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Invitado: "bg-sky-50 text-sky-700 ring-sky-200",
  Pendiente: "bg-amber-50 text-amber-700 ring-amber-200",
  Inactivo: "bg-slate-100 text-slate-500 ring-slate-200",
};

export default function SolicitudesAcceso({ usuarios, agencia, onResolver, onInvitar }: Props) {
  const pendientes = usuarios.filter((u) => u.estadoCuenta === "Pendiente");
  const equipo = useMemo(
    () =>
      usuarios
        .filter((u) => u.estadoCuenta !== "Pendiente")
        .slice()
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [usuarios],
  );
  const [rolesElegidos, setRolesElegidos] = useState<Record<string, UserRole>>({});
  const rolDe = (u: Usuario) => rolesElegidos[u.id] ?? u.rol;

  const maxBrokers = agencia.maxBrokers ?? 2;
  const brokersActuales = usuarios.filter((u) => u.rol === "broker" && u.estadoCuenta !== "Inactivo").length;
  const cupoDeBroker = brokersActuales < maxBrokers;

  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [rolNuevo, setRolNuevo] = useState<UserRole>("asesor_equipo");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const limpiar = () => {
    setNombre(""); setCorreo(""); setTelefono(""); setRolNuevo("asesor_equipo");
  };

  const enviarAlta = async () => {
    setError(null); setAviso(null);
    const correoLimpio = correo.trim().toLowerCase();
    if (!nombre.trim()) return setError("Escribe el nombre de la persona.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correoLimpio)) return setError("Ese correo no se ve bien.");
    if (usuarios.some((u) => u.correo.toLowerCase() === correoLimpio))
      return setError("Ese correo ya está en tu equipo.");
    if (rolNuevo === "broker" && !cupoDeBroker)
      return setError(`Tu oficina admite ${maxBrokers} administradores y ya los tiene.`);

    setOcupado(true);
    const err = await onInvitar({ nombre: nombre.trim(), correo: correoLimpio, telefono: telefono.trim(), rol: rolNuevo });
    setOcupado(false);
    if (err) return setError(err);
    setAviso(`Listo. Dile a ${nombre.trim()} que cree su cuenta con ${correoLimpio} y entrará directo a tu oficina.`);
    limpiar();
    setAbierto(false);
  };

  const copiarCodigo = async () => {
    if (!agencia.codigoInvitacion) return;
    try {
      await navigator.clipboard.writeText(agencia.codigoInvitacion);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("Tu navegador no dejó copiar. Selecciona el código a mano.");
    }
  };

  const inputBase =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-bold text-slate-900">Equipo</h1>
      <p className="mt-1 text-sm text-slate-500">
        Da de alta a tu gente con su correo. Cuando creen su cuenta con ese mismo correo, entran
        directo a {agencia.nombre || "tu oficina"} con el rol que les asignes.
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

      {/* ---------- Alta ---------- */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        {!abierto ? (
          <button
            onClick={() => { setAbierto(true); setError(null); setAviso(null); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700"
          >
            <UserPlus className="size-4" /> Agregar persona al equipo
          </button>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-bold text-slate-900">Nueva persona</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="alta-nombre" className="mb-1.5 block text-xs font-semibold text-slate-600">Nombre completo</label>
                <input id="alta-nombre" className={inputBase} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Karla Torres" />
              </div>
              <div>
                <label htmlFor="alta-correo" className="mb-1.5 block text-xs font-semibold text-slate-600">Correo</label>
                <input id="alta-correo" className={inputBase} type="email" inputMode="email" value={correo}
                  onChange={(e) => setCorreo(e.target.value)} placeholder="persona@tuinmobiliaria.mx" />
              </div>
              <div>
                <label htmlFor="alta-telefono" className="mb-1.5 block text-xs font-semibold text-slate-600">Teléfono (opcional)</label>
                <input id="alta-telefono" className={inputBase} inputMode="tel" value={telefono}
                  onChange={(e) => setTelefono(e.target.value)} placeholder="55 0000 0000" />
              </div>
              <div>
                <label htmlFor="alta-rol" className="mb-1.5 block text-xs font-semibold text-slate-600">Rol</label>
                <select id="alta-rol" value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 focus:border-slate-900 focus:outline-none">
                  {ROLES_ALTA.map((r) => (
                    <option key={r} value={r} disabled={r === "broker" && !cupoDeBroker}>
                      {ETIQUETAS_ROL[r]}
                      {r === "broker" && !cupoDeBroker ? " — sin cupo" : ""}
                    </option>
                  ))}
                </select>
                {rolNuevo === "broker" && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Un segundo administrador ve y edita todo lo de la oficina. Tu oficina admite {maxBrokers};
                    hoy hay {brokersActuales}.
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => { setAbierto(false); setError(null); limpiar(); }}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={enviarAlta} disabled={ocupado}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60">
                {ocupado ? "Dando de alta…" : "Dar de alta"}
              </button>
            </div>
          </div>
        )}

        {agencia.codigoInvitacion && (
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-600">Código de invitación de tu oficina</p>
              <p className="text-xs text-slate-500">
                Alternativa al alta por correo: quien lo tenga puede registrarse y queda pendiente de tu aprobación.
              </p>
            </div>
            <button onClick={copiarCodigo}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm font-bold tracking-wider text-slate-900 hover:bg-slate-50">
              {agencia.codigoInvitacion}
              {copiado ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4 text-slate-400" />}
            </button>
          </div>
        )}
      </div>

      {/* ---------- Solicitudes pendientes ---------- */}
      <h2 className="mt-8 text-sm font-bold text-slate-900">
        Solicitudes pendientes {pendientes.length > 0 && <span className="text-slate-400">({pendientes.length})</span>}
      </h2>
      {pendientes.length === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
          <ShieldQuestion className="size-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">No hay solicitudes pendientes</p>
          <p className="text-xs text-slate-500">
            Aquí aparece quien se registre con el código de la oficina sin que tú lo hayas dado de alta.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {pendientes.map((u) => (
            <div key={u.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                  {u.iniciales || u.nombre.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{u.nombre}</p>
                  <p className="truncate text-xs text-slate-500">{u.correo}</p>
                  {u.telefono && <p className="text-xs text-slate-500">{u.telefono}</p>}
                  <p className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    Solicitó: {ETIQUETAS_ROL[u.rol]}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  value={rolDe(u)}
                  onChange={(e) => setRolesElegidos((prev) => ({ ...prev, [u.id]: e.target.value as UserRole }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 focus:border-slate-900 focus:outline-none sm:w-56"
                >
                  {ROLES_ASIGNABLES.map((r) => (
                    <option key={r} value={r}>{ETIQUETAS_ROL[r]}</option>
                  ))}
                </select>
                <div className="flex gap-2 sm:ml-auto">
                  <button
                    onClick={() => onResolver(u.id, { rol: rolDe(u), estadoCuenta: "Activo" })}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 sm:flex-none"
                  >
                    <Check className="size-4" /> Aprobar
                  </button>
                  <button
                    onClick={() => onResolver(u.id, { estadoCuenta: "Inactivo" })}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 sm:flex-none"
                  >
                    <X className="size-4" /> Rechazar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Quién está ---------- */}
      <h2 className="mt-8 text-sm font-bold text-slate-900">
        Tu equipo <span className="text-slate-400">({equipo.length})</span>
      </h2>
      <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {equipo.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
              {u.iniciales || u.nombre.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{u.nombre}</p>
              <p className="truncate text-xs text-slate-500">{u.correo}</p>
            </div>
            <span className="shrink-0 text-xs text-slate-500">{ETIQUETAS_ROL[u.rol]}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                COLOR_ESTADO[u.estadoCuenta] ?? COLOR_ESTADO.Inactivo
              }`}
              title={u.estadoCuenta === "Invitado" ? "Todavía no ha creado su cuenta" : undefined}
            >
              {u.estadoCuenta}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
