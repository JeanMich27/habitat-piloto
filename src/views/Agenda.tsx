// Agenda de citas.
//
// Dos lecturas del mismo dato, según quién mira y desde dónde:
//   - Asesor (y móvil en general): lista cronológica agrupada por día. Es la
//     forma en que se usa una agenda en la calle — "qué sigue", no "cómo se ve
//     el mes". Una rejilla de mes en un teléfono es bonita e inútil.
//   - Broker en escritorio: rejilla semanal por asesor, que es la pregunta que
//     él sí se hace — quién tiene la semana vacía y quién saturada.
//
// Propietario y cliente nunca llegan aquí: App.tsx no les da el destino y RLS
// no les devuelve filas.
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Link2,
  List,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import GlassModal from "../components/GlassModal";
import {
  agruparPorDia,
  citasVisibles,
  descargarICS,
  descripcionCita,
  esMismoDia,
  etiquetaDia,
  fmtDiaCorto,
  fmtHora,
  inicioDeSemana,
  inicioDelDia,
  ordenarPorInicio,
  sumarDias,
  urlGoogleCalendar,
  urlsDeSuscripcion,
} from "../lib/agenda";
import type {
  CitaAgenda,
  EstadoCitaAgenda,
  Lead,
  Propiedad,
  Usuario,
} from "../types";

interface Props {
  usuario: Usuario;
  usuarios: Usuario[];
  citas: CitaAgenda[];
  leads: Lead[];
  propiedades: Propiedad[];
  onNueva: (fecha?: Date) => void;
  onEditar: (cita: CitaAgenda) => void;
  onCambiarEstado: (citaId: string, estado: EstadoCitaAgenda) => Promise<boolean>;
  onEliminar: (citaId: string) => Promise<boolean>;
  onVerCliente: (leadId: string) => void;
  /** Token del feed ICS. null mientras carga o si no hay nube. */
  tokenAgenda: string | null;
  urlSupabase: string | null;
  onRotarToken: () => void;
}

const COLOR_ESTADO: Record<EstadoCitaAgenda, string> = {
  Agendada: "bg-violet-100 text-violet-700 ring-violet-200",
  Confirmada: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  Realizada: "bg-slate-100 text-slate-600 ring-slate-200",
  "No asistió": "bg-red-100 text-red-700 ring-red-200",
  Cancelada: "bg-slate-100 text-slate-500 ring-slate-200",
};

export default function Agenda({
  usuario,
  usuarios,
  citas,
  leads,
  propiedades,
  onNueva,
  onEditar,
  onCambiarEstado,
  onEliminar,
  onVerCliente,
  tokenAgenda,
  urlSupabase,
  onRotarToken,
}: Props) {
  const esBroker = usuario.rol === "broker";
  const [modo, setModo] = useState<"lista" | "semana">("lista");
  const [semanaBase, setSemanaBase] = useState(() => inicioDeSemana(new Date()));
  const [asesorFiltro, setAsesorFiltro] = useState<string>("todos");
  const [detalle, setDetalle] = useState<CitaAgenda | null>(null);
  const [sincroAbierta, setSincroAbierta] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const mias = useMemo(() => citasVisibles(citas, usuario), [citas, usuario]);

  const filtradas = useMemo(
    () => (asesorFiltro === "todos" ? mias : mias.filter((c) => c.asesorId === asesorFiltro)),
    [mias, asesorFiltro],
  );

  const hoy = inicioDelDia(new Date());

  // La lista arranca hoy: lo que ya pasó rara vez es lo que se busca al abrir.
  const proximas = useMemo(
    () => filtradas.filter((c) => new Date(c.inicio) >= hoy && c.estado !== "Cancelada"),
    [filtradas, hoy],
  );

  const porDia = useMemo(() => agruparPorDia(proximas), [proximas]);

  const deHoy = useMemo(
    () => ordenarPorInicio(filtradas.filter((c) => esMismoDia(new Date(c.inicio), new Date()))),
    [filtradas],
  );

  const porConfirmar = useMemo(
    () => proximas.filter((c) => c.estado === "Agendada").length,
    [proximas],
  );

  const nombreAsesor = (id: string) => usuarios.find((u) => u.id === id)?.nombre ?? "Sin asignar";

  const urls = tokenAgenda && urlSupabase ? urlsDeSuscripcion(urlSupabase, tokenAgenda) : null;

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Safari en http bloquea el portapapeles: el input queda seleccionable.
    }
  };

  // --- Rejilla semanal (escritorio) ---
  const diasSemana = Array.from({ length: 7 }, (_, i) => sumarDias(semanaBase, i));
  const asesoresConCitas = useMemo(() => {
    const ids = new Set(filtradas.map((c) => c.asesorId));
    return usuarios.filter((u) => ids.has(u.id));
  }, [filtradas, usuarios]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Agenda</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {esBroker
              ? `${proximas.length} citas próximas en la oficina`
              : `${proximas.length} citas próximas`}
            {porConfirmar > 0 && ` · ${porConfirmar} sin confirmar`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {urlSupabase && (
            <button
              onClick={() => setSincroAbierta(true)}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-white"
            >
              <Link2 className="size-3.5" /> Sincronizar
            </button>
          )}
          <button
            onClick={() => onNueva()}
            className="flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-violet-300/60 hover:bg-violet-700"
          >
            <CalendarPlus className="size-3.5" /> Agendar
          </button>
        </div>
      </div>

      {/* Hoy: lo primero que necesita ver un asesor al abrir la app */}
      {deHoy.length > 0 && (
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 p-4 text-white shadow-lg shadow-violet-300/40">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Hoy</p>
          <div className="mt-2 space-y-2">
            {deHoy.map((c) => (
              <button
                key={c.id}
                onClick={() => setDetalle(c)}
                className="flex w-full items-center gap-3 rounded-xl bg-white/15 px-3 py-2.5 text-left backdrop-blur transition hover:bg-white/25"
              >
                <span className="shrink-0 text-sm font-bold tabular-nums">{fmtHora(c.inicio)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.titulo}</span>
                  {c.ubicacion && (
                    <span className="block truncate text-[11px] opacity-75">{c.ubicacion}</span>
                  )}
                </span>
                {c.estado === "Agendada" && (
                  <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold">
                    Sin confirmar
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controles */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-slate-100 p-0.5">
          {(["lista", "semana"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                modo === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              } ${m === "semana" ? "hidden md:flex" : ""}`}
            >
              {m === "lista" ? <List className="size-3.5" /> : <CalendarDays className="size-3.5" />}
              {m === "lista" ? "Lista" : "Semana"}
            </button>
          ))}
        </div>
        {esBroker && (
          <select
            value={asesorFiltro}
            onChange={(e) => setAsesorFiltro(e.target.value)}
            className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-600"
          >
            <option value="todos">Todo el equipo</option>
            {usuarios
              .filter((u) => u.estadoCuenta === "Activo")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
          </select>
        )}
      </div>

      {/* --- Lista --- */}
      {modo === "lista" && (
        <div className="mt-4 space-y-5">
          {porDia.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 py-12 text-center">
              <CalendarDays className="mx-auto size-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-500">No hay citas próximas</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Agenda desde aquí o desde la ficha de un prospecto.
              </p>
            </div>
          )}
          {porDia.map(({ dia, citas: delDia }) => {
            const fecha = new Date(`${dia}T12:00:00`);
            return (
              <div key={dia}>
                <div className="sticky top-[104px] z-10 -mx-1 mb-2 flex items-baseline gap-2 bg-slate-50/80 px-1 py-1 backdrop-blur md:top-[132px]">
                  <p className="text-sm font-bold capitalize text-slate-900">{etiquetaDia(fecha)}</p>
                  <p className="text-[11px] text-slate-500">
                    {delDia.length} {delDia.length === 1 ? "cita" : "citas"}
                  </p>
                </div>
                <div className="space-y-2">
                  {delDia.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setDetalle(c)}
                      className="flex w-full items-stretch gap-3 rounded-2xl border border-white/70 bg-white/80 p-3 text-left shadow-sm backdrop-blur transition hover:shadow-md"
                    >
                      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-50 py-1">
                        <span className="text-sm font-bold tabular-nums text-slate-900">
                          {fmtHora(c.inicio).replace(/\s?[ap]\.?\s?m\.?/i, "")}
                        </span>
                        <span className="text-[9px] font-semibold uppercase text-slate-500">
                          {new Date(c.inicio).getHours() < 12 ? "am" : "pm"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{c.titulo}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                          {c.ubicacion && (
                            <span className="flex min-w-0 items-center gap-1">
                              <MapPin className="size-3 shrink-0" />
                              <span className="truncate">{c.ubicacion}</span>
                            </span>
                          )}
                          {esBroker && (
                            <span className="flex items-center gap-1">
                              <UserIcon className="size-3" />
                              {nombreAsesor(c.asesorId)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                          COLOR_ESTADO[c.estado]
                        }`}
                      >
                        {c.estado}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- Rejilla semanal (solo escritorio) --- */}
      {modo === "semana" && (
        <div className="mt-4 hidden md:block">
          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={() => setSemanaBase(sumarDias(semanaBase, -7))}
              className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white/70 text-slate-500 hover:bg-white"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setSemanaBase(inicioDeSemana(new Date()))}
              className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
            >
              Esta semana
            </button>
            <button
              onClick={() => setSemanaBase(sumarDias(semanaBase, 7))}
              className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white/70 text-slate-500 hover:bg-white"
            >
              <ChevronRight className="size-4" />
            </button>
            <p className="ml-1 text-xs font-semibold text-slate-500">
              {semanaBase.toLocaleDateString("es-MX", { day: "numeric", month: "long" })} —{" "}
              {sumarDias(semanaBase, 6).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/70 bg-white/70 backdrop-blur">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr>
                  <th className="w-40 border-b border-r border-slate-200/70 p-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {esBroker ? "Asesor" : ""}
                  </th>
                  {diasSemana.map((d) => (
                    <th
                      key={d.toISOString()}
                      className={`border-b border-slate-200/70 p-2 text-center text-[11px] font-bold capitalize ${
                        esMismoDia(d, new Date()) ? "bg-violet-50 text-violet-700" : "text-slate-500"
                      }`}
                    >
                      {fmtDiaCorto(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(esBroker && asesoresConCitas.length > 0 ? asesoresConCitas : [usuario]).map(
                  (a) => (
                    <tr key={a.id}>
                      <td className="border-r border-slate-200/70 p-2 align-top">
                        <p className="truncate text-xs font-bold text-slate-800">{a.nombre}</p>
                        <p className="text-[10px] text-slate-500">
                          {
                            filtradas.filter(
                              (c) =>
                                c.asesorId === a.id &&
                                new Date(c.inicio) >= semanaBase &&
                                new Date(c.inicio) < sumarDias(semanaBase, 7),
                            ).length
                          }{" "}
                          esta semana
                        </p>
                      </td>
                      {diasSemana.map((d) => {
                        const delDia = ordenarPorInicio(
                          filtradas.filter(
                            (c) => c.asesorId === a.id && esMismoDia(new Date(c.inicio), d),
                          ),
                        );
                        return (
                          <td
                            key={d.toISOString()}
                            onClick={() => delDia.length === 0 && onNueva(d)}
                            className={`min-w-[110px] cursor-pointer border-b border-slate-200/50 p-1 align-top transition hover:bg-violet-50/40 ${
                              esMismoDia(d, new Date()) ? "bg-violet-50/50" : ""
                            }`}
                          >
                            <div className="space-y-1">
                              {delDia.map((c) => (
                                <button
                                  key={c.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetalle(c);
                                  }}
                                  className={`block w-full rounded-lg px-1.5 py-1 text-left text-[10px] font-semibold ring-1 ${
                                    COLOR_ESTADO[c.estado]
                                  }`}
                                >
                                  <span className="block tabular-nums opacity-80">
                                    {fmtHora(c.inicio)}
                                  </span>
                                  <span className="block truncate">{c.titulo}</span>
                                </button>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- Detalle de una cita --- */}
      {detalle && (
        <DetalleCita
          cita={detalle}
          lead={leads.find((l) => l.id === detalle.leadId)}
          propiedad={propiedades.find((p) => p.id === detalle.propiedadId)}
          asesor={usuarios.find((u) => u.id === detalle.asesorId)}
          puedeEliminar={esBroker}
          onCerrar={() => setDetalle(null)}
          onEditar={() => {
            const c = detalle;
            setDetalle(null);
            onEditar(c);
          }}
          onCambiarEstado={async (estado) => {
            if (await onCambiarEstado(detalle.id, estado)) setDetalle({ ...detalle, estado });
          }}
          onEliminar={async () => {
            if (await onEliminar(detalle.id)) setDetalle(null);
          }}
          onVerCliente={() => {
            if (detalle.leadId) {
              const id = detalle.leadId;
              setDetalle(null);
              onVerCliente(id);
            }
          }}
        />
      )}

      {/* --- Sincronizar con calendario externo --- */}
      {sincroAbierta && (
        <GlassModal
          titulo="Ver tus citas en tu calendario"
          subtitulo="Se suscribe una vez y se actualiza solo"
          onCerrar={() => setSincroAbierta(false)}
        >
          {!urls ? (
            <p className="py-6 text-center text-sm text-slate-500">Generando tu enlace…</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Tu enlace privado
                </p>
                <div className="mt-1.5 flex gap-2">
                  <input
                    readOnly
                    value={urls.https}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-[11px] text-slate-600"
                  />
                  <button
                    onClick={() => copiar(urls.https)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                  >
                    {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copiado ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Es privado: quien tenga este enlace ve tus citas. No lo compartas.
                </p>
              </div>

              <div className="space-y-2">
                <a
                  href={urls.webcal}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 px-3.5 py-3 text-sm font-semibold text-slate-800 hover:bg-white"
                >
                  <span>
                    iPhone / iPad / Mac
                    <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                      Abre el diálogo de suscripción. Pon el refresco en 5 minutos.
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-500" />
                </a>
                <a
                  href={urls.google}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 px-3.5 py-3 text-sm font-semibold text-slate-800 hover:bg-white"
                >
                  <span>
                    Google Calendar
                    <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                      Google revisa el enlace cada 8 a 24 horas, no al instante.
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-500" />
                </a>
              </div>

              <p className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800 ring-1 ring-amber-200">
                Para una cita de hoy o mañana no esperes a que el calendario se
                actualice solo: abre la cita y usa <strong>Añadir a mi calendario</strong>.
                Aparece al instante.
              </p>

              <button
                onClick={onRotarToken}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw className="size-3.5" /> Generar un enlace nuevo (invalida el anterior)
              </button>
            </div>
          )}
        </GlassModal>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

function DetalleCita({
  cita,
  lead,
  propiedad,
  asesor,
  puedeEliminar,
  onCerrar,
  onEditar,
  onCambiarEstado,
  onEliminar,
  onVerCliente,
}: {
  cita: CitaAgenda;
  lead?: Lead;
  propiedad?: Propiedad;
  asesor?: Usuario;
  puedeEliminar: boolean;
  onCerrar: () => void;
  onEditar: () => void;
  onCambiarEstado: (e: EstadoCitaAgenda) => Promise<void>;
  onEliminar: () => Promise<void>;
  onVerCliente: () => void;
}) {
  const descripcion = descripcionCita(cita, lead, propiedad, asesor);
  const yaPaso = new Date(cita.fin).getTime() < Date.now();
  const mapa = cita.ubicacion
    ? `https://maps.google.com/?q=${encodeURIComponent(cita.ubicacion)}`
    : null;
  // Eliminar es irreversible: pide un segundo toque antes de borrar de verdad.
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  return (
    <GlassModal titulo={cita.titulo} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="flex items-center gap-1.5 font-semibold text-slate-900">
            <Clock className="size-4 text-slate-500" />
            {etiquetaDia(new Date(cita.inicio))} · {fmtHora(cita.inicio)} a {fmtHora(cita.fin)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
              COLOR_ESTADO[cita.estado]
            }`}
          >
            {cita.estado}
          </span>
        </div>

        {cita.ubicacion && (
          <a
            href={mapa ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          >
            <MapPin className="mt-0.5 size-4 shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1">{cita.ubicacion}</span>
            <span className="shrink-0 text-[11px] font-bold text-violet-600">Cómo llegar</span>
          </a>
        )}

        {lead && (
          <div className="flex items-center gap-3 rounded-xl bg-white/70 p-3 ring-1 ring-slate-200">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {lead.nombre.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <button onClick={onVerCliente} className="block truncate text-sm font-bold text-slate-900 hover:text-violet-700">
                {lead.nombre}
              </button>
              <p className="text-[11px] text-slate-500">{lead.etapa}</p>
            </div>
            {lead.telefono && (
              <a
                href={`tel:${lead.telefono}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"
              >
                <Phone className="size-4" />
              </a>
            )}
          </div>
        )}

        {cita.notas && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nota</p>
            <p className="mt-1 text-sm text-slate-700">{cita.notas}</p>
          </div>
        )}

        {/* Cierre de la cita: es lo que convierte la agenda en información
            de pipeline en vez de en un calendario decorativo. */}
        {yaPaso && cita.estado !== "Realizada" && cita.estado !== "No asistió" && (
          <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-xs font-bold text-amber-900">¿Cómo salió esta cita?</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => onCambiarEstado("Realizada")}
                className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Sí se realizó
              </button>
              <button
                onClick={() => onCambiarEstado("No asistió")}
                className="flex-1 rounded-lg border border-amber-300 bg-white py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
              >
                No asistió
              </button>
            </div>
          </div>
        )}

        {!yaPaso && cita.estado === "Agendada" && (
          <button
            onClick={() => onCambiarEstado("Confirmada")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
          >
            <Check className="size-4" /> Marcar como confirmada por el cliente
          </button>
        )}

        {/* Puente inmediato al calendario del teléfono */}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={urlGoogleCalendar(cita, descripcion)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <CalendarPlus className="size-3.5" /> Google Calendar
          </a>
          <button
            onClick={() => descargarICS(cita, descripcion)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <CalendarPlus className="size-3.5" /> iPhone / Outlook
          </button>
        </div>

        {confirmandoEliminar ? (
          // Segundo toque obligatorio: eliminar una cita es irreversible y no
          // se puede deshacer, a diferencia de cancelarla.
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3"
          >
            <p className="text-xs font-semibold text-red-800">
              ¿Eliminar esta cita para siempre? No se puede deshacer.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setConfirmandoEliminar(false)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
              >
                Cancelar
              </button>
              <button
                onClick={onEliminar}
                className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-700"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 border-t border-slate-200/70 pt-3">
            <button
              onClick={onEditar}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="size-3.5" /> Editar
            </button>
            {cita.estado !== "Cancelada" && (
              <button
                onClick={() => onCambiarEstado("Cancelada")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <X className="size-3.5" /> Cancelar cita
              </button>
            )}
            {puedeEliminar && (
              <button
                onClick={() => setConfirmandoEliminar(true)}
                title="Eliminar definitivamente"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-red-200 text-red-500 hover:bg-red-50"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </GlassModal>
  );
}
