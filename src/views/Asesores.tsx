import { useMemo, useState } from "react";
import { MoreVertical, UserPlus, X } from "lucide-react";
import PermisosModal from "../components/PermisosModal";
import { formatMin, minutosRespuesta, promedio } from "../lib/metrics";
import type { Lead, Propiedad, Usuario } from "../types";

const MS_DIA = 1000 * 60 * 60 * 24;
const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const ESTADO_ESTILO: Record<string, string> = {
  Activo: "bg-emerald-100 text-emerald-700",
  Invitado: "bg-sky-100 text-sky-700",
  Inactivo: "bg-slate-200 text-slate-500",
};

interface Props {
  usuarios: Usuario[];
  propiedades: Propiedad[];
  leads: Lead[];
  onInvitar: (nombre: string, correo: string) => void;
  onDesactivar: (asesorId: string, reasignarAId: string) => void;
  onReactivar: (asesorId: string) => void;
  onEditarPermisos: (asesorId: string, puedeVerOtras: boolean) => void;
  onVerDesempeno: (asesorId: string) => void;
}

export default function Asesores({
  usuarios,
  propiedades,
  leads,
  onInvitar,
  onDesactivar,
  onReactivar,
  onEditarPermisos,
  onVerDesempeno,
}: Props) {
  const ahora = useMemo(() => Date.now(), []);
  const asesores = usuarios.filter(
    (u) => u.rol === "asesor_equipo" || u.rol === "asesor_independiente",
  );

  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [modalInvitar, setModalInvitar] = useState(false);
  const [modalDesactivar, setModalDesactivar] = useState<Usuario | null>(null);
  const [modalPermisos, setModalPermisos] = useState<Usuario | null>(null);

  const metricasDe = (u: Usuario) => {
    const propiedadesActivas = propiedades.filter(
      (p) => p.asesorId === u.id && p.estatus === "Publicada",
    ).length;
    const leadsAsesor = leads.filter((l) => l.asesorId === u.id);
    const cierresMes = leadsAsesor.filter(
      (l) => l.etapa === "Cierre" && (ahora - new Date(l.creado).getTime()) / MS_DIA <= 31,
    ).length;
    const tiempoResp = promedio(
      leadsAsesor.map(minutosRespuesta).filter((m): m is number => m !== null),
    );
    return { propiedadesActivas, leadsAtendidos: leadsAsesor.length, cierresMes, tiempoResp };
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Asesores</h1>
          <p className="text-sm text-slate-500">
            {asesores.length} asesor{asesores.length === 1 ? "" : "es"} en la agencia
          </p>
        </div>
        <button
          onClick={() => setModalInvitar(true)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          <UserPlus className="size-4" /> Invitar asesor
        </button>
      </header>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Asesor</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Propiedades activas</th>
              <th className="px-4 py-3">Leads atendidos</th>
              <th className="px-4 py-3">Cierres del mes</th>
              <th className="px-4 py-3">Tiempo de respuesta</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {asesores.map((u) => {
              const m = metricasDe(u);
              return (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="flex items-center gap-2 px-4 py-3">
                    <span className="flex size-7 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">
                      {u.iniciales}
                    </span>
                    <div>
                      <p className="font-medium text-slate-800">{u.nombre}</p>
                      <p className="text-xs text-slate-500">{u.puesto}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.correo}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_ESTILO[u.estadoCuenta]}`}
                    >
                      {u.estadoCuenta}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.propiedadesActivas}</td>
                  <td className="px-4 py-3 text-slate-600">{m.leadsAtendidos}</td>
                  <td className="px-4 py-3 text-slate-600">{m.cierresMes}</td>
                  <td className="px-4 py-3 text-slate-600">{formatMin(m.tiempoResp)}</td>
                  <td className="relative px-4 py-3 text-right">
                    <button
                      onClick={() => setMenuAbierto(menuAbierto === u.id ? null : u.id)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                    {menuAbierto === u.id && (
                      <div className="absolute right-4 top-10 z-10 w-52 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-sm">
                        <button
                          onClick={() => {
                            onVerDesempeno(u.id);
                            setMenuAbierto(null);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Ver desempeño
                        </button>
                        <button
                          onClick={() => {
                            setModalPermisos(u);
                            setMenuAbierto(null);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Editar permisos
                        </button>
                        {u.estadoCuenta === "Inactivo" ? (
                          <button
                            onClick={() => {
                              onReactivar(u.id);
                              setMenuAbierto(null);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                          >
                            Reactivar
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setModalDesactivar(u);
                              setMenuAbierto(null);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                          >
                            Desactivar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalInvitar && (
        <ModalInvitar
          usuarios={usuarios}
          onCerrar={() => setModalInvitar(false)}
          onEnviar={(nombre, correo) => {
            onInvitar(nombre, correo);
            setModalInvitar(false);
          }}
        />
      )}

      {modalPermisos && (
        <PermisosModal
          asesor={modalPermisos}
          onCerrar={() => setModalPermisos(null)}
          onGuardar={(valor) => {
            onEditarPermisos(modalPermisos.id, valor);
            setModalPermisos(null);
          }}
        />
      )}

      {modalDesactivar && (
        <ModalDesactivar
          asesor={modalDesactivar}
          otrosAsesores={asesores.filter((a) => a.id !== modalDesactivar.id && a.estadoCuenta === "Activo")}
          onCerrar={() => setModalDesactivar(null)}
          onConfirmar={(reasignarAId) => {
            onDesactivar(modalDesactivar.id, reasignarAId);
            setModalDesactivar(null);
          }}
        />
      )}
    </div>
  );
}

function ModalInvitar({
  usuarios,
  onCerrar,
  onEnviar,
}: {
  usuarios: Usuario[];
  onCerrar: () => void;
  onEnviar: (nombre: string, correo: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const yaExiste = usuarios.some((u) => u.correo.toLowerCase() === correo.toLowerCase());
  const correoInvalido = correo !== "" && !emailValido(correo);
  const puedeEnviar = nombre.trim() !== "" && emailValido(correo) && !yaExiste;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900">Invitar asesor</h2>
          <button onClick={onCerrar} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Nombre
        </label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="input mt-1"
          placeholder="Nombre completo"
        />

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Correo
        </label>
        <input
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          className="input mt-1"
          placeholder="nombre@correo.com"
        />
        {correoInvalido && <p className="mt-1 text-xs text-rose-500">Correo inválido.</p>}
        {yaExiste && <p className="mt-1 text-xs text-rose-500">Ya existe una cuenta con este correo.</p>}

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Rol
        </label>
        <div className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Asesor de Equipo (único rol invitable en el MVP)
        </div>

        <button
          disabled={!puedeEnviar}
          onClick={() => onEnviar(nombre.trim(), correo.trim())}
          className="mt-6 w-full rounded-lg bg-slate-800 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          Enviar invitación
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">
          Crea la cuenta en estado "Invitado" — sin envío real de correo en el prototipo.
        </p>
      </div>
    </div>
  );
}

function ModalDesactivar({
  asesor,
  otrosAsesores,
  onCerrar,
  onConfirmar,
}: {
  asesor: Usuario;
  otrosAsesores: Usuario[];
  onCerrar: () => void;
  onConfirmar: (reasignarAId: string) => void;
}) {
  const [reasignarA, setReasignarA] = useState(otrosAsesores[0]?.id ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Desactivar a {asesor.nombre}</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          Sus propiedades y leads activos deben reasignarse para no quedar huérfanos.
        </p>

        {otrosAsesores.length === 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-200">
            No hay otro asesor activo disponible para reasignar. Invita o reactiva a alguien primero.
          </p>
        ) : (
          <>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Reasignar a
            </label>
            <select
              value={reasignarA}
              onChange={(e) => setReasignarA(e.target.value)}
              className="input mt-1"
            >
              {otrosAsesores.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            disabled={otrosAsesores.length === 0}
            onClick={() => onConfirmar(reasignarA)}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white enabled:hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            Sí, desactivar
          </button>
        </div>
      </div>
    </div>
  );
}
