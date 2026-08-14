// Detalle de propiedad — rediseño glass (Fase 1) + reglas de rol (ago 2026).
//
// - Broker / asesor independiente: editan la ficha y cambian el estado directo.
// - Asesor de equipo: solo consulta; el cambio de estado se SOLICITA y el
//   broker lo aprueba desde el banner de esta misma pantalla.
// - "Dónde se promociona": enlace público de EasyBroker (lo llena el sync)
//   más los portales que el broker registre a mano. El propietario ve esta
//   misma información en su portal.
import { useState } from "react";
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Calculator,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Home,
  Layers,
  Link2,
  Mail,
  MapPin,
  Megaphone,
  Pencil,
  Phone,
  Plus,
  Ruler,
  Sparkles,
  StickyNote,
  Tag,
  Trash2,
  XCircle,
} from "lucide-react";
import StatusBadge, { EnRevisionBadge } from "../components/StatusBadge";
import EstadoPropiedadModal from "../components/EstadoPropiedadModal";
import AntiguedadBadge from "../components/AntiguedadBadge";
import { etiquetaEtapa } from "../lib/metrics";
import type {
  CitaAgenda,
  Comparable,
  EnlacePromocion,
  Lead,
  PropertyStatus,
  Propiedad,
  SolicitudEstado,
  TipoEvento,
  TipoInmueble,
  TipoOperacion,
  Usuario,
} from "../types";
import { formatoMXN, puedeEditarPropiedades, solicitaCambioDeEstado } from "../types";

type Tab = "info" | "cronologia" | "leads" | "ofertas" | "documentos" | "comparativo";

const TABS: { key: Tab; label: string }[] = [
  { key: "info", label: "Información" },
  { key: "cronologia", label: "Cronología" },
  { key: "leads", label: "Leads y visitas" },
  { key: "ofertas", label: "Ofertas" },
  { key: "documentos", label: "Documentos" },
  { key: "comparativo", label: "Comparativo" },
];

const TIPOS_INMUEBLE: TipoInmueble[] = ["Casa", "Depto", "Terreno", "Local"];
const TIPOS_OPERACION: TipoOperacion[] = ["Venta", "Renta"];

const ICONO_EVENTO: Record<TipoEvento, typeof Tag> = {
  Estado: Tag,
  Documento: FileText,
  Nota: StickyNote,
  Publicacion: Megaphone,
};

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
const fmtFechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

interface Props {
  propiedad: Propiedad;
  usuario: Usuario;
  usuarios: Usuario[];
  leads: Lead[];
  citas: CitaAgenda[];
  solicitudes: SolicitudEstado[];
  onVolver: () => void;
  onCambiarEstado: (propiedadId: string, nuevoEstado: PropertyStatus, motivo?: string) => void;
  onSolicitarCambio: (propiedadId: string, nuevoEstado: PropertyStatus, motivo?: string) => void;
  onResolverSolicitud: (solicitud: SolicitudEstado, resultado: "aprobada" | "rechazada") => void;
  onGuardarInformacion: (propiedadId: string, cambios: Partial<Propiedad>) => void;
  onAgregarEvento: (propiedadId: string, descripcion: string) => void;
  onAgregarComparable: (propiedadId: string, comparable: Omit<Comparable, "id">) => void;
  onResolverOferta: (leadId: string, resultado: "Aceptada" | "Rechazada") => void;
  /** Solo se pasa cuando el usuario es asesor: abre la calculadora de comisiones. */
  onCalcularComision?: (propiedadId: string) => void;
}

export default function DetalleDePropiedad({
  propiedad,
  usuario,
  usuarios,
  leads,
  citas,
  solicitudes,
  onVolver,
  onCambiarEstado,
  onSolicitarCambio,
  onResolverSolicitud,
  onGuardarInformacion,
  onAgregarEvento,
  onAgregarComparable,
  onResolverOferta,
  onCalcularComision,
}: Props) {
  const [tab, setTab] = useState<Tab>("info");
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(propiedad);
  const [modalEstado, setModalEstado] = useState(false);
  const [notaNueva, setNotaNueva] = useState("");
  const [nuevoComparable, setNuevoComparable] = useState({ direccion: "", precio: "", m2: "", fuente: "" });
  const [fotoActiva, setFotoActiva] = useState(0);
  const [nuevoEnlace, setNuevoEnlace] = useState({ portal: "", url: "" });

  const puedeEditar = puedeEditarPropiedades(usuario.rol);
  const esAsesorEquipo = solicitaCambioDeEstado(usuario.rol);
  const esBroker = usuario.rol === "broker";

  const solicitudPendiente =
    solicitudes.find((s) => s.propiedadId === propiedad.id && s.estatus === "pendiente") ?? null;
  const nombreDe = (id?: string) => usuarios.find((u) => u.id === id)?.nombre ?? "Sin asignar";

  const leadsPropiedad = leads.filter((l) => l.interesPropiedadId === propiedad.id);
  const ofertas = leadsPropiedad.filter((l) => l.montoOferta !== undefined);
  const eventos = [...(propiedad.eventos ?? [])].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );
  // Visitas reales: citas de agenda tipo "visita" ligadas a esta propiedad.
  const visitasAgenda = citas
    .filter((c) => c.propiedadId === propiedad.id && c.tipo === "visita")
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
  const visitasRealizadas = visitasAgenda.filter((c) => c.estado === "Realizada").length;
  const comparables = propiedad.comparables ?? [];
  const precioM2Propio = propiedad.m2 ? Math.round(propiedad.precio / propiedad.m2) : 0;
  const promedioComparables = comparables.length
    ? Math.round(comparables.reduce((s, c) => s + c.precio, 0) / comparables.length)
    : null;

  const imagenes = propiedad.imagenes ?? [];
  const portada = imagenes[fotoActiva] ?? imagenes[0];
  const enlaces = propiedad.enlacesPromocion ?? [];

  const guardarInfo = () => {
    onGuardarInformacion(propiedad.id, form);
    setEditando(false);
  };
  const cancelarInfo = () => {
    setForm(propiedad);
    setEditando(false);
  };

  const agregarEnlace = () => {
    const url = nuevoEnlace.url.trim();
    if (!url) return;
    const enlace: EnlacePromocion = {
      portal: nuevoEnlace.portal.trim() || "Portal",
      url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
    };
    onGuardarInformacion(propiedad.id, { enlacesPromocion: [...enlaces, enlace] });
    setNuevoEnlace({ portal: "", url: "" });
  };
  const quitarEnlace = (index: number) => {
    onGuardarInformacion(propiedad.id, {
      enlacesPromocion: enlaces.filter((_, i) => i !== index),
    });
  };

  const estadoOferta = (l: Lead): "Aceptada" | "Rechazada" | "En negociación" =>
    l.etapa === "Cierre" ? "Aceptada" : l.etapa === "Negociacion" ? "En negociación" : "Rechazada";

  const specs = [
    { icono: BedDouble, valor: propiedad.recamaras, etiqueta: "rec" },
    { icono: Bath, valor: propiedad.banos, etiqueta: "baños" },
    { icono: Bath, valor: propiedad.mediosBanos, etiqueta: "medios" },
    { icono: Ruler, valor: propiedad.m2, etiqueta: "m² const." },
    { icono: Ruler, valor: propiedad.m2Terreno, etiqueta: "m² terreno" },
    { icono: Car, valor: propiedad.estacionamientos, etiqueta: "autos" },
    { icono: Layers, valor: propiedad.niveles, etiqueta: "niveles" },
  ].filter((s) => s.valor != null && Number(s.valor) > 0);

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <button
        onClick={onVolver}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="size-4" /> Volver al listado
      </button>

      {/* ---------- Banner de aprobación (solo broker con solicitud pendiente) ---------- */}
      {esBroker && solicitudPendiente && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 border-amber-200/80 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Megaphone className="size-4" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">
                {nombreDe(solicitudPendiente.solicitanteId)} solicita cambiar el estado:{" "}
                {solicitudPendiente.estadoActual} → {solicitudPendiente.estadoSolicitado}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {solicitudPendiente.motivo
                  ? `Motivo: ${solicitudPendiente.motivo} · `
                  : ""}
                Solicitado el {fmtFechaHora(solicitudPendiente.creadoEn)}. Al aprobar, el cambio se
                aplica en automático y se le avisa al asesor.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onResolverSolicitud(solicitudPendiente, "rechazada")}
              className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              <XCircle className="size-3.5" /> Rechazar
            </button>
            <button
              onClick={() => onResolverSolicitud(solicitudPendiente, "aprobada")}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-300/50 hover:bg-emerald-500"
            >
              <CheckCircle2 className="size-3.5" /> Aprobar cambio
            </button>
          </div>
        </div>
      )}

      {/* ---------- Hero ---------- */}
      <div className="glass overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-5">
          {/* Galería */}
          <div className="lg:col-span-2">
            <div className="relative flex h-56 items-center justify-center bg-gradient-to-br from-slate-500 via-slate-400 to-slate-300 sm:h-64 lg:h-full lg:min-h-[18rem]">
              {portada ? (
                <img
                  src={portada}
                  alt={propiedad.titulo}
                  className="size-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <Home className="size-12 text-white/50" />
              )}
              <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                <StatusBadge estatus={propiedad.estatus} />
                {solicitudPendiente && (
                  <EnRevisionBadge destino={solicitudPendiente.estadoSolicitado} />
                )}
              </div>
              <div className="absolute right-3 top-3">
                <AntiguedadBadge propiedad={propiedad} compacta />
              </div>
              {imagenes.length > 1 && (
                <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                  {fotoActiva + 1} / {imagenes.length}
                </span>
              )}
            </div>
            {imagenes.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto bg-white/40 p-2">
                {imagenes.slice(0, 12).map((img, i) => (
                  <button
                    key={img + i}
                    onClick={() => setFotoActiva(i)}
                    className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                      i === fotoActiva ? "ring-violet-500" : "ring-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={img} alt="" className="size-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Datos clave */}
          <div className="flex flex-col gap-3 p-5 lg:col-span-3 lg:p-6">
            <div>
              <h1 className="text-xl font-bold leading-snug text-slate-900">{propiedad.titulo}</h1>
              <p className="mt-1 flex items-start gap-1 text-sm text-slate-500">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                {propiedad.ubicacion}
                {propiedad.estado ? `, ${propiedad.estado}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-2xl font-black text-slate-900">{formatoMXN(propiedad.precio)}</p>
              {precioM2Propio > 0 && (
                <p className="text-xs font-semibold text-slate-400">
                  {formatoMXN(precioM2Propio)} / m²
                </p>
              )}
              <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                {propiedad.tipoInmueble} · {propiedad.tipoOperacion}
              </span>
            </div>

            {specs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {specs.map((s) => (
                  <span
                    key={s.etiqueta}
                    className="flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/70"
                  >
                    <s.icono className="size-3.5 text-slate-400" />
                    {s.valor} {s.etiqueta}
                  </span>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400">
              Asesor asignado: <span className="font-semibold text-slate-600">{nombreDe(propiedad.asesorId)}</span>
            </p>

            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              {onCalcularComision && (
                <button
                  onClick={() => onCalcularComision(propiedad.id)}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  <Calculator className="size-3.5" /> Calcular comisión
                </button>
              )}
              {puedeEditar && (
                <button
                  onClick={() => {
                    setTab("info");
                    setForm(propiedad);
                    setEditando(true);
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  <Pencil className="size-3.5" /> Editar
                </button>
              )}
              <button
                onClick={() => setModalEstado(true)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-md transition ${
                  esAsesorEquipo
                    ? solicitudPendiente
                      ? "bg-amber-500 shadow-amber-300/50 hover:bg-amber-600"
                      : "bg-violet-600 shadow-violet-300/60 hover:bg-violet-700"
                    : "bg-slate-900 shadow-slate-400/40 hover:bg-slate-700"
                }`}
              >
                {esAsesorEquipo
                  ? solicitudPendiente
                    ? "Cambio en revisión"
                    : "Solicitar cambio de estado"
                  : "Cambiar estado"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Tabs ---------- */}
      <div className="glass flex gap-1 overflow-x-auto p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              tab === t.key
                ? "bg-violet-600 text-white shadow-md shadow-violet-300/60"
                : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- Información ---------- */}
      {tab === "info" && !editando && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <section className="glass p-5">
              <h3 className="text-sm font-bold text-slate-900">Descripción</h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {propiedad.descripcion || "Sin descripción."}
              </p>
              {(propiedad.colonia || propiedad.calle || propiedad.codigoPostal) && (
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-200/60 pt-3 text-xs text-slate-500">
                  {propiedad.calle && <span>Calle: {propiedad.calle}</span>}
                  {propiedad.colonia && <span>Colonia: {propiedad.colonia}</span>}
                  {propiedad.municipio && <span>Municipio: {propiedad.municipio}</span>}
                  {propiedad.codigoPostal && <span>C.P. {propiedad.codigoPostal}</span>}
                </div>
              )}
            </section>

            {(propiedad.amenidades?.length ?? 0) > 0 && (
              <section className="glass p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Sparkles className="size-4 text-violet-400" /> Amenidades
                </h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {propiedad.amenidades!.map((a) => (
                    <span
                      key={a}
                      className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200/70"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Dónde se promociona: EB automático + portales manuales. */}
            <section className="glass p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Megaphone className="size-4 text-violet-400" /> Dónde se promociona
              </h3>
              <div className="mt-3 space-y-2">
                {propiedad.urlPublica && (
                  <a
                    href={propiedad.urlPublica}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-3.5 py-2.5 ring-1 ring-slate-200/70 transition hover:bg-white"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                        <Globe className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800">
                          Sitio público (EasyBroker)
                        </span>
                        <span className="block truncate text-[11px] text-slate-400">
                          {propiedad.urlPublica}
                        </span>
                      </span>
                    </span>
                    <ExternalLink className="size-4 shrink-0 text-slate-400" />
                  </a>
                )}
                {enlaces.map((e, i) => (
                  <div
                    key={e.url + i}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-3.5 py-2.5 ring-1 ring-slate-200/70"
                  >
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 flex-1 items-center gap-2.5 transition hover:opacity-80"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                        <Link2 className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800">{e.portal}</span>
                        <span className="block truncate text-[11px] text-slate-400">{e.url}</span>
                      </span>
                    </a>
                    <div className="flex shrink-0 items-center gap-1">
                      <a href={e.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${e.portal}`}>
                        <ExternalLink className="size-4 text-slate-400 hover:text-slate-600" />
                      </a>
                      {puedeEditar && (
                        <button
                          onClick={() => quitarEnlace(i)}
                          aria-label={`Quitar ${e.portal}`}
                          className="rounded-lg p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!propiedad.urlPublica && enlaces.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-300/80 px-4 py-6 text-center text-xs text-slate-400">
                    Aún no hay enlaces registrados. El enlace de EasyBroker aparece solo al
                    sincronizar; los portales (Inmuebles24, Vivanuncios…) se agregan aquí.
                  </p>
                )}
              </div>
              {puedeEditar && (
                <div className="mt-3 flex flex-col gap-2 border-t border-slate-200/60 pt-3 sm:flex-row">
                  <input
                    value={nuevoEnlace.portal}
                    onChange={(e) => setNuevoEnlace({ ...nuevoEnlace, portal: e.target.value })}
                    placeholder="Portal (p. ej. Inmuebles24)"
                    className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm focus:border-violet-400 focus:bg-white focus:outline-none sm:w-48"
                  />
                  <input
                    value={nuevoEnlace.url}
                    onChange={(e) => setNuevoEnlace({ ...nuevoEnlace, url: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && agregarEnlace()}
                    placeholder="https://…"
                    className="flex-1 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm focus:border-violet-400 focus:bg-white focus:outline-none"
                  />
                  <button
                    disabled={!nuevoEnlace.url.trim()}
                    onClick={agregarEnlace}
                    className="flex items-center justify-center gap-1 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-violet-300/60 hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                  >
                    <Plus className="size-4" /> Agregar
                  </button>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-5">
            <section className="glass p-5">
              <h3 className="text-sm font-bold text-slate-900">Propietario</h3>
              <p className="mt-2 text-sm font-semibold text-slate-800">
                {propiedad.propietario.nombre || "Sin registrar"}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                <Phone className="size-3.5 text-slate-400" />
                {propiedad.propietario.telefono || "—"}
              </p>
              <p className="mt-1 flex items-center gap-1.5 break-all text-sm text-slate-600">
                <Mail className="size-3.5 shrink-0 text-slate-400" />
                {propiedad.propietario.correo || "—"}
              </p>
            </section>

            <section className="glass p-5">
              <h3 className="text-sm font-bold text-slate-900">Condiciones</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Comisión</dt>
                  <dd className="font-semibold text-slate-700">
                    {propiedad.comisionValor != null
                      ? propiedad.comisionTipo === "meses"
                        ? `${propiedad.comisionValor} mes(es)`
                        : `${propiedad.comisionValor}%`
                      : "No pactada"}
                  </dd>
                </div>
                {propiedad.comisionCompartidaPct != null && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Compartida</dt>
                    <dd className="font-semibold text-slate-700">{propiedad.comisionCompartidaPct}%</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Exclusiva</dt>
                  <dd className="font-semibold text-slate-700">{propiedad.exclusiva ? "Sí" : "No"}</dd>
                </div>
                {propiedad.mantenimiento != null && propiedad.mantenimiento > 0 && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Mantenimiento</dt>
                    <dd className="font-semibold text-slate-700">{formatoMXN(propiedad.mantenimiento)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Capturada</dt>
                  <dd className="font-semibold text-slate-700">{fmtFecha(propiedad.capturadaEl)}</dd>
                </div>
                {propiedad.publicadaEl && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Publicada</dt>
                    <dd className="font-semibold text-slate-700">{fmtFecha(propiedad.publicadaEl)}</dd>
                  </div>
                )}
                {propiedad.crmOrigen && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Origen</dt>
                    <dd className="font-semibold capitalize text-slate-700">{propiedad.crmOrigen}</dd>
                  </div>
                )}
              </dl>
            </section>

            {(propiedad.videoUrl || propiedad.tourVirtualUrl) && (
              <section className="glass p-5">
                <h3 className="text-sm font-bold text-slate-900">Multimedia</h3>
                <div className="mt-2 space-y-1.5">
                  {propiedad.videoUrl && (
                    <a
                      href={propiedad.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-sm font-semibold text-violet-600 hover:text-violet-800"
                    >
                      <ExternalLink className="size-3.5" /> Video
                    </a>
                  )}
                  {propiedad.tourVirtualUrl && (
                    <a
                      href={propiedad.tourVirtualUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-sm font-semibold text-violet-600 hover:text-violet-800"
                    >
                      <ExternalLink className="size-3.5" /> Tour virtual
                    </a>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {/* ---------- Edición (broker / independiente) ---------- */}
      {tab === "info" && editando && puedeEditar && (
        <div className="glass p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Título" value={form.titulo} onChange={(v) => setForm({ ...form, titulo: v })} />
            <Input
              label="Precio"
              type="number"
              value={String(form.precio)}
              onChange={(v) => setForm({ ...form, precio: Number(v) || 0 })}
            />
            <Select
              label="Tipo de inmueble"
              value={form.tipoInmueble}
              opciones={TIPOS_INMUEBLE}
              onChange={(v) => setForm({ ...form, tipoInmueble: v as TipoInmueble })}
            />
            <Select
              label="Tipo de operación"
              value={form.tipoOperacion}
              opciones={TIPOS_OPERACION}
              onChange={(v) => setForm({ ...form, tipoOperacion: v as TipoOperacion })}
            />
            <Input
              label="Recámaras"
              type="number"
              value={String(form.recamaras)}
              onChange={(v) => setForm({ ...form, recamaras: Number(v) || 0 })}
            />
            <Input
              label="Baños"
              type="number"
              value={String(form.banos)}
              onChange={(v) => setForm({ ...form, banos: Number(v) || 0 })}
            />
            <Input
              label="m² construcción"
              type="number"
              value={String(form.m2)}
              onChange={(v) => setForm({ ...form, m2: Number(v) || 0 })}
            />
            <Input
              label="Estacionamientos"
              type="number"
              value={String(form.estacionamientos ?? 0)}
              onChange={(v) => setForm({ ...form, estacionamientos: Number(v) || 0 })}
            />
            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Descripción
              </label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                rows={4}
                className="input mt-1"
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <button
                onClick={guardarInfo}
                className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-violet-300/60 hover:bg-violet-700"
              >
                Guardar cambios
              </button>
              <button
                onClick={cancelarInfo}
                className="rounded-full border border-slate-200 bg-white/70 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Cronología ---------- */}
      {tab === "cronologia" && (
        <div className="glass p-5">
          <div className="mb-5 flex gap-2">
            <input
              value={notaNueva}
              onChange={(e) => setNotaNueva(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && notaNueva.trim() && (onAgregarEvento(propiedad.id, notaNueva.trim()), setNotaNueva(""))}
              placeholder="Agregar una nota a la cronología…"
              className="input flex-1"
            />
            <button
              disabled={!notaNueva.trim()}
              onClick={() => {
                onAgregarEvento(propiedad.id, notaNueva.trim());
                setNotaNueva("");
              }}
              className="flex items-center gap-1 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-violet-300/60 hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <Plus className="size-4" /> Agregar
            </button>
          </div>
          {eventos.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Aún no hay eventos registrados.</p>
          ) : (
            <ol className="space-y-1">
              {eventos.map((e, i) => {
                const Icono = ICONO_EVENTO[e.tipo] ?? StickyNote;
                return (
                  <li key={e.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                          e.tipo === "Estado"
                            ? "bg-violet-100 text-violet-600"
                            : e.tipo === "Publicacion"
                              ? "bg-emerald-100 text-emerald-600"
                              : e.tipo === "Documento"
                                ? "bg-sky-100 text-sky-600"
                                : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <Icono className="size-3.5" />
                      </span>
                      {i < eventos.length - 1 && <span className="w-px flex-1 bg-slate-200/80" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-5">
                      <p className="text-[11px] font-semibold text-slate-400">{fmtFechaHora(e.fecha)}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-700">{e.descripcion}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {/* ---------- Leads y visitas ---------- */}
      {tab === "leads" && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="glass p-4 text-center">
              <p className="text-2xl font-black text-slate-900">{leadsPropiedad.length}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Leads interesados
              </p>
            </div>
            <div className="glass p-4 text-center">
              <p className="text-2xl font-black text-slate-900">{visitasRealizadas}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Visitas realizadas
              </p>
            </div>
            <div className="glass p-4 text-center">
              <p className="text-2xl font-black text-slate-900">{ofertas.length}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Ofertas recibidas
              </p>
            </div>
          </div>

          <div className="glass overflow-hidden">
            <p className="border-b border-slate-200/60 px-4 py-3 text-sm font-bold text-slate-900">
              Leads interesados
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200/60">
                    <th className="px-4 py-2.5">Nombre</th>
                    <th className="px-4 py-2.5">Etapa</th>
                    <th className="px-4 py-2.5">Origen</th>
                    <th className="px-4 py-2.5">Asesor</th>
                    <th className="px-4 py-2.5">Registrado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {leadsPropiedad.map((l) => (
                    <tr key={l.id} className="hover:bg-white/60">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{l.nombre}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {etiquetaEtapa(l.etapa)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{l.origen}</td>
                      <td className="px-4 py-2.5 text-slate-600">{nombreDe(l.asesorId)}</td>
                      <td className="px-4 py-2.5 text-slate-500">{fmtFecha(l.creado)}</td>
                    </tr>
                  ))}
                  {leadsPropiedad.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        Sin leads interesados todavía.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass overflow-hidden">
            <p className="flex items-center gap-2 border-b border-slate-200/60 px-4 py-3 text-sm font-bold text-slate-900">
              <CalendarDays className="size-4 text-violet-400" /> Visitas agendadas
            </p>
            {visitasAgenda.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                Sin visitas agendadas. Se agendan desde la ficha del cliente o la Agenda.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100/80">
                {visitasAgenda.map((c) => {
                  const lead = leads.find((l) => l.id === c.leadId);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {lead?.nombre ?? c.titulo}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock className="size-3" /> {fmtFechaHora(c.inicio)} · {nombreDe(c.asesorId)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          c.estado === "Realizada"
                            ? "bg-emerald-100 text-emerald-700"
                            : c.estado === "Cancelada" || c.estado === "No asistió"
                              ? "bg-rose-50 text-rose-600"
                              : "bg-sky-100 text-sky-700"
                        }`}
                      >
                        {c.estado}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ---------- Ofertas ---------- */}
      {tab === "ofertas" && (
        <div className="glass overflow-hidden">
          <p className="border-b border-slate-200/60 px-4 py-3 text-sm font-bold text-slate-900">
            Ofertas recibidas
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200/60">
                  <th className="px-4 py-2.5">Cliente</th>
                  <th className="px-4 py-2.5">Monto</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {ofertas.map((l) => (
                  <tr key={l.id} className="hover:bg-white/60">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{l.nombre}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{formatoMXN(l.montoOferta!)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{estadoOferta(l)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {l.etapa === "Negociacion" ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => onResolverOferta(l.id, "Aceptada")}
                            className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                          >
                            <CheckCircle2 className="size-3.5" /> Aceptar
                          </button>
                          <button
                            onClick={() => onResolverOferta(l.id, "Rechazada")}
                            className="flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            <XCircle className="size-3.5" /> Rechazar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Sin acciones</span>
                      )}
                    </td>
                  </tr>
                ))}
                {ofertas.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      Sin ofertas registradas todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- Documentos ---------- */}
      {tab === "documentos" && (
        <div className="glass p-5">
          <p className="mb-4 text-sm font-bold text-slate-900">Documentos legales</p>
          <ul className="space-y-2">
            {propiedad.documentos.map((d) => (
              <li
                key={d.nombre}
                className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 ring-1 ring-slate-200/70"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  {d.aprobado ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : (
                    <Clock className="size-4 text-amber-500" />
                  )}
                  {d.nombre}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    d.aprobado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {d.aprobado ? "Validado" : "Pendiente"}
                </span>
              </li>
            ))}
            {propiedad.documentos.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300/80 px-4 py-8 text-center text-sm text-slate-400">
                Sin documentos registrados. La validación documental se gestiona desde la
                bandeja de Validación del broker.
              </p>
            )}
          </ul>
        </div>
      )}

      {/* ---------- Comparativo ---------- */}
      {tab === "comparativo" && (
        <div className="space-y-4">
          <div className="glass p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <MiniStat label="Precio propio" valor={formatoMXN(propiedad.precio)} />
              <MiniStat label="Precio / m² propio" valor={formatoMXN(precioM2Propio)} />
              <MiniStat
                label="Promedio de comparables"
                valor={promedioComparables ? formatoMXN(promedioComparables) : "Sin comparables"}
              />
            </div>
          </div>

          <div className="glass overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200/60">
                  <th className="px-4 py-2.5">Dirección</th>
                  <th className="px-4 py-2.5">Precio</th>
                  <th className="px-4 py-2.5">m²</th>
                  <th className="px-4 py-2.5">Precio / m²</th>
                  <th className="px-4 py-2.5">Fuente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {comparables.map((c) => (
                  <tr key={c.id} className="hover:bg-white/60">
                    <td className="px-4 py-2.5 text-slate-700">{c.direccion}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatoMXN(c.precio)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.m2}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatoMXN(Math.round(c.precio / c.m2))}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.fuente}</td>
                  </tr>
                ))}
                {comparables.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      Aún no hay comparables. Agrega el primero abajo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="glass flex flex-wrap items-end gap-2 p-4">
            <MiniInput
              label="Dirección"
              value={nuevoComparable.direccion}
              onChange={(v) => setNuevoComparable({ ...nuevoComparable, direccion: v })}
              className="min-w-[12rem] flex-1"
            />
            <MiniInput
              label="Precio"
              type="number"
              value={nuevoComparable.precio}
              onChange={(v) => setNuevoComparable({ ...nuevoComparable, precio: v })}
              className="w-32"
            />
            <MiniInput
              label="m²"
              type="number"
              value={nuevoComparable.m2}
              onChange={(v) => setNuevoComparable({ ...nuevoComparable, m2: v })}
              className="w-24"
            />
            <MiniInput
              label="Fuente"
              value={nuevoComparable.fuente}
              onChange={(v) => setNuevoComparable({ ...nuevoComparable, fuente: v })}
              className="w-40"
            />
            <button
              disabled={!nuevoComparable.direccion || !nuevoComparable.precio || !nuevoComparable.m2}
              onClick={() => {
                onAgregarComparable(propiedad.id, {
                  direccion: nuevoComparable.direccion,
                  precio: Number(nuevoComparable.precio) || 0,
                  m2: Number(nuevoComparable.m2) || 0,
                  fuente: nuevoComparable.fuente || "Captura manual",
                });
                setNuevoComparable({ direccion: "", precio: "", m2: "", fuente: "" });
              }}
              className="flex items-center gap-1 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-violet-300/60 hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <Plus className="size-4" /> Agregar comparable
            </button>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <StickyNote className="size-3.5" /> Captura manual del asesor — sin integración a portales en
            el MVP.
          </p>
        </div>
      )}

      {modalEstado && (
        <EstadoPropiedadModal
          propiedad={propiedad}
          rolUsuario={usuario.rol}
          solicitudPendiente={solicitudPendiente}
          onCerrar={() => setModalEstado(false)}
          onGuardar={(nuevoEstado, motivo) => {
            onCambiarEstado(propiedad.id, nuevoEstado, motivo);
            setModalEstado(false);
          }}
          onSolicitar={(nuevoEstado, motivo) => {
            onSolicitarCambio(propiedad.id, nuevoEstado, motivo);
            setModalEstado(false);
          }}
        />
      )}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="input mt-1" />
    </div>
  );
}

function Select({
  label,
  value,
  opciones,
  onChange,
}: {
  label: string;
  value: string;
  opciones: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input mt-1">
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function MiniStat({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900">{valor}</p>
    </div>
  );
}

function MiniInput({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm focus:border-violet-400 focus:bg-white focus:outline-none"
      />
    </div>
  );
}
