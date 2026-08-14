// Agendar una cita en dos toques.
//
// Regla de diseño de esta pantalla: el asesor está en la calle, con una mano,
// probablemente hablando por teléfono. Cada campo que tiene que teclear es una
// cita que no se va a registrar. Por eso:
//   - El día se elige con chips (Hoy / Mañana / pasado…), no con un date picker.
//   - La hora se elige de una rejilla de horas cerradas y medias.
//   - Título, ubicación y duración se deducen del lead, la propiedad y el tipo.
//   - Solo dos campos pueden quedar vacíos sin consecuencia: notas y ubicación.
//
// El asesor solo agenda para sí mismo; el broker puede elegir a quién.
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Clock, MapPin } from "lucide-react";
import GlassModal from "./GlassModal";
import {
  citasEncimadas,
  duracionPorTipo,
  etiquetaDia,
  fmtHora,
  inicioDelDia,
  isoALocal,
  localAISO,
  sumarDias,
} from "../lib/agenda";
import { TIPOS_CITA, type CitaAgenda, type Lead, type Propiedad, type TipoCitaAgenda, type Usuario } from "../types";

interface Props {
  usuario: Usuario;
  usuarios: Usuario[];
  leads: Lead[];
  propiedades: Propiedad[];
  citas: CitaAgenda[];
  /** Cita existente a editar. Sin ella, el modal crea una nueva. */
  citaExistente?: CitaAgenda | null;
  /** Prospecto precargado (al entrar desde su ficha). */
  leadInicialId?: string | null;
  /** Fecha precargada (al tocar un hueco de la agenda). */
  fechaInicial?: Date | null;
  onGuardar: (cita: CitaAgenda) => void;
  onCerrar: () => void;
}

// Horas visitables. Ninguna inmobiliaria de residencial media-alta enseña a
// las 7 de la mañana ni a las 10 de la noche; ofrecer 24 horas solo alarga la
// lista y hace más lento elegir.
const HORAS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30",
];

const nuevoId = () =>
  `cita-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export default function AgendarVisitaModal({
  usuario,
  usuarios,
  leads,
  propiedades,
  citas,
  citaExistente,
  leadInicialId,
  fechaInicial,
  onGuardar,
  onCerrar,
}: Props) {
  const editando = Boolean(citaExistente);
  const esBroker = usuario.rol === "broker";

  const partesIniciales = citaExistente
    ? isoALocal(citaExistente.inicio)
    : { fecha: null as string | null, hora: "" };

  const [tipo, setTipo] = useState<TipoCitaAgenda>(citaExistente?.tipo ?? "visita");
  const [asesorId, setAsesorId] = useState(citaExistente?.asesorId ?? usuario.id);
  const [leadId, setLeadId] = useState(citaExistente?.leadId ?? leadInicialId ?? "");
  const [propiedadId, setPropiedadId] = useState(citaExistente?.propiedadId ?? "");
  const [fecha, setFecha] = useState<string>(
    partesIniciales.fecha ?? isoALocal((fechaInicial ?? new Date()).toISOString()).fecha,
  );
  const [hora, setHora] = useState(partesIniciales.hora);
  const [duracion, setDuracion] = useState(
    citaExistente
      ? Math.round(
          (new Date(citaExistente.fin).getTime() - new Date(citaExistente.inicio).getTime()) / 60000,
        )
      : duracionPorTipo("visita"),
  );
  const [ubicacion, setUbicacion] = useState(citaExistente?.ubicacion ?? "");
  const [notas, setNotas] = useState(citaExistente?.notas ?? "");
  const [tocoUbicacion, setTocoUbicacion] = useState(Boolean(citaExistente?.ubicacion));

  const asesores = useMemo(
    () =>
      usuarios.filter(
        (u) =>
          u.estadoCuenta === "Activo" &&
          (u.rol === "asesor_equipo" || u.rol === "asesor_independiente" || u.rol === "broker"),
      ),
    [usuarios],
  );

  // Prospectos elegibles: los del asesor dueño de la cita. Un broker agendando
  // por su asesor ve la cartera de ese asesor, no la suya.
  const leadsElegibles = useMemo(() => {
    const propios = leads.filter((l) => l.asesorId === asesorId);
    // Si viene precargado un lead de otra cartera, no se esconde.
    const precargado = leads.find((l) => l.id === leadId);
    return precargado && !propios.some((l) => l.id === precargado.id)
      ? [precargado, ...propios]
      : propios;
  }, [leads, asesorId, leadId]);

  const lead = leads.find((l) => l.id === leadId);
  const propiedad = propiedades.find((p) => p.id === propiedadId);

  // Al elegir un prospecto, su propiedad de interés se precarga sola.
  const alElegirLead = (id: string) => {
    setLeadId(id);
    const l = leads.find((x) => x.id === id);
    if (l?.interesPropiedadId && !propiedadId) {
      setPropiedadId(l.interesPropiedadId);
      const p = propiedades.find((x) => x.id === l.interesPropiedadId);
      if (p && !tocoUbicacion) setUbicacion([p.calle, p.colonia, p.municipio].filter(Boolean).join(", ") || p.ubicacion);
    }
  };

  const alElegirPropiedad = (id: string) => {
    setPropiedadId(id);
    const p = propiedades.find((x) => x.id === id);
    if (p && !tocoUbicacion) {
      setUbicacion([p.calle, p.colonia, p.municipio].filter(Boolean).join(", ") || p.ubicacion);
    }
  };

  const alElegirTipo = (t: TipoCitaAgenda) => {
    setTipo(t);
    setDuracion(duracionPorTipo(t));
  };

  // Título automático: es lo que va a ver en su teléfono a las 8 de la mañana.
  const titulo = useMemo(() => {
    const etiqueta = TIPOS_CITA.find((t) => t.valor === tipo)?.etiqueta ?? "Cita";
    if (lead && propiedad) return `${etiqueta.split(" ")[0]}: ${lead.nombre} · ${propiedad.titulo}`;
    if (lead) return `${etiqueta}: ${lead.nombre}`;
    if (propiedad) return `${etiqueta}: ${propiedad.titulo}`;
    return etiqueta;
  }, [tipo, lead, propiedad]);

  const inicioISO = hora ? localAISO(fecha, hora) : null;
  const finISO = inicioISO
    ? new Date(new Date(inicioISO).getTime() + duracion * 60000).toISOString()
    : null;

  const choques = useMemo(() => {
    if (!inicioISO || !finISO) return [];
    return citasEncimadas(
      { id: citaExistente?.id ?? "", asesorId, inicio: inicioISO, fin: finISO },
      citas,
    );
  }, [inicioISO, finISO, asesorId, citas, citaExistente]);

  const enPasado = inicioISO ? new Date(inicioISO).getTime() < Date.now() : false;
  const puedeGuardar = Boolean(hora && titulo);

  const guardar = () => {
    if (!inicioISO || !finISO) return;
    onGuardar({
      id: citaExistente?.id ?? nuevoId(),
      asesorId,
      leadId: leadId || undefined,
      propiedadId: propiedadId || undefined,
      titulo,
      tipo,
      inicio: inicioISO,
      fin: finISO,
      ubicacion,
      notas,
      estado: citaExistente?.estado ?? "Agendada",
      creadaPor: citaExistente?.creadaPor ?? usuario.id,
      creadoEn: citaExistente?.creadoEn ?? new Date().toISOString(),
    });
    onCerrar();
  };

  // Chips de día: los próximos 10 días. Cubre el 95% de lo que se agenda en
  // campo; para algo más lejano está el selector de fecha.
  const hoy = inicioDelDia(new Date());
  const dias = Array.from({ length: 10 }, (_, i) => sumarDias(hoy, i));

  return (
    <GlassModal
      titulo={editando ? "Editar cita" : "Agendar visita"}
      subtitulo={editando ? undefined : "Se guarda en tu agenda y en la del equipo"}
      ancho="lg"
      onCerrar={onCerrar}
    >
      <div className="space-y-5">
        {/* Tipo */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Tipo de cita
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS_CITA.map((t) => (
              <button
                key={t.valor}
                onClick={() => alElegirTipo(t.valor)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  tipo === t.valor
                    ? "bg-violet-600 text-white shadow-md shadow-violet-300/60"
                    : "bg-white/70 text-slate-600 ring-1 ring-slate-200 hover:bg-white"
                }`}
              >
                {t.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {/* Asesor: solo el broker elige */}
        {esBroker && (
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Asesor a cargo
            </label>
            <select
              value={asesorId}
              onChange={(e) => {
                setAsesorId(e.target.value);
                setLeadId("");
              }}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm font-medium text-slate-800"
            >
              {asesores.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                  {a.id === usuario.id ? " (yo)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Prospecto y propiedad */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Prospecto
            </label>
            <select
              value={leadId}
              onChange={(e) => alElegirLead(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm font-medium text-slate-800"
            >
              <option value="">Sin prospecto</option>
              {leadsElegibles.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Propiedad
            </label>
            <select
              value={propiedadId}
              onChange={(e) => alElegirPropiedad(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm font-medium text-slate-800"
            >
              <option value="">Sin propiedad</option>
              {propiedades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Día */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Día
          </p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {dias.map((d) => {
              const clave = isoALocal(d.toISOString()).fecha;
              const activo = clave === fecha;
              return (
                <button
                  key={clave}
                  onClick={() => setFecha(clave)}
                  className={`flex min-w-[62px] shrink-0 flex-col items-center rounded-2xl px-2.5 py-2 text-xs font-semibold transition ${
                    activo
                      ? "bg-violet-600 text-white shadow-md shadow-violet-300/60"
                      : "bg-white/70 text-slate-600 ring-1 ring-slate-200"
                  }`}
                >
                  <span className="text-[9px] uppercase tracking-wide opacity-80">
                    {etiquetaDia(d) === "Hoy" || etiquetaDia(d) === "Mañana"
                      ? etiquetaDia(d)
                      : d.toLocaleDateString("es-MX", { weekday: "short" })}
                  </span>
                  <span className="text-base font-bold leading-tight">{d.getDate()}</span>
                </button>
              );
            })}
          </div>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-medium text-slate-600"
          />
        </div>

        {/* Hora */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Hora de inicio
          </p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {HORAS.map((h) => (
              <button
                key={h}
                onClick={() => setHora(h)}
                className={`rounded-xl py-2 text-xs font-semibold transition ${
                  hora === h
                    ? "bg-violet-600 text-white shadow-md shadow-violet-300/60"
                    : "bg-white/70 text-slate-600 ring-1 ring-slate-200 hover:bg-white"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        {/* Duración */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Duración
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[30, 45, 60, 90, 120].map((m) => (
              <button
                key={m}
                onClick={() => setDuracion(m)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  duracion === m
                    ? "bg-slate-900 text-white"
                    : "bg-white/70 text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {m < 60 ? `${m} min` : m === 60 ? "1 h" : `${m / 60} h`}
              </button>
            ))}
          </div>
        </div>

        {/* Ubicación y notas */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Punto de encuentro
            </label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={ubicacion}
                onChange={(e) => {
                  setUbicacion(e.target.value);
                  setTocoUbicacion(true);
                }}
                placeholder="Se llena con la propiedad"
                className="w-full rounded-xl border border-slate-200 bg-white/80 py-2.5 pl-8 pr-3 text-sm text-slate-800"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Nota para ti
            </label>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Llevar comparativo de la zona"
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-800"
            />
          </div>
        </div>

        {/* Resumen y avisos */}
        {inicioISO && finISO && (
          <div className="rounded-2xl bg-slate-50/80 p-3.5 ring-1 ring-slate-200">
            <p className="text-sm font-bold text-slate-900">{titulo}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="size-3.5" />
              {etiquetaDia(new Date(inicioISO))} · {fmtHora(inicioISO)} a {fmtHora(finISO)}
            </p>
          </div>
        )}

        {enPasado && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Esta cita queda en el pasado. Se puede guardar (sirve para registrar una
            visita que ya ocurrió), pero no llegará ningún recordatorio.
          </p>
        )}

        {choques.length > 0 && (
          <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800 ring-1 ring-red-200">
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="size-3.5 shrink-0" />
              Se encima con {choques.length === 1 ? "otra cita" : `${choques.length} citas`}
            </p>
            <ul className="mt-1.5 space-y-0.5 pl-5">
              {choques.map((c) => (
                <li key={c.id} className="list-disc">
                  {fmtHora(c.inicio)} · {c.titulo}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 opacity-80">
              Se puede guardar de todos modos, pero considera el traslado entre una y otra.
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCerrar}
            className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={!puedeGuardar}
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white shadow-md shadow-violet-300/60 transition hover:bg-violet-700 disabled:bg-slate-300 disabled:shadow-none"
          >
            <Check className="size-4" />
            {editando ? "Guardar cambios" : "Agendar"}
          </button>
        </div>
        {!hora && (
          <p className="-mt-3 text-center text-[11px] text-slate-400">Falta elegir la hora</p>
        )}
      </div>
    </GlassModal>
  );
}
