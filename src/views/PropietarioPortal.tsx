import { useMemo, useState } from "react";
import {
  Building2,
  Download,
  ExternalLink,
  Globe,
  Home,
  Link2,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Phone,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import KpiCard from "../components/KpiCard";
import StatusBadge from "../components/StatusBadge";
import type { Lead, Propiedad, Usuario } from "../types";
import { formatoMXN } from "../types";

type Tab = "resumen" | "promocion" | "cronologia" | "documentos" | "comparativo";

const TABS: { key: Tab; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "promocion", label: "Promoción" },
  { key: "cronologia", label: "Cronología" },
  { key: "documentos", label: "Documentos" },
  { key: "comparativo", label: "Comparativo" },
];

const MS_DIA = 1000 * 60 * 60 * 24;
const diasDesde = (fechaISO: string, ahora: number) => Math.floor((ahora - new Date(fechaISO).getTime()) / MS_DIA);
const fmtFechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

interface Props {
  // Todas las propiedades de este propietario (identificado por correo, sin cuenta
  // formal todavía — el acceso simplificado del propietario queda como supuesto
  // pendiente de definir con el equipo técnico, igual que en la especificación).
  propiedadesPropietario: Propiedad[];
  usuarios: Usuario[];
  leads: Lead[];
}

export default function PropietarioPortal({ propiedadesPropietario, usuarios, leads }: Props) {
  const ahora = useMemo(() => Date.now(), []);
  const [propiedadId, setPropiedadId] = useState(propiedadesPropietario[0]?.id);
  const [tab, setTab] = useState<Tab>("resumen");
  const [modalContacto, setModalContacto] = useState(false);

  const propiedad = propiedadesPropietario.find((p) => p.id === propiedadId);

  if (!propiedad) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 text-center text-slate-500">
        No hay propiedades asociadas a este propietario todavía.
      </div>
    );
  }

  const asesor = usuarios.find((u) => u.id === propiedad.asesorId);
  const leadsPropiedad = leads.filter((l) => l.interesPropiedadId === propiedad.id);
  const visitas = leadsPropiedad.filter((l) =>
    (["Visitado", "Negociacion", "Cierre"] as const).includes(
      l.etapa as "Visitado" | "Negociacion" | "Cierre",
    ),
  ).length;
  const ofertas = leadsPropiedad.filter((l) => l.montoOferta !== undefined).length;
  const dias = propiedad.publicadaEl ? diasDesde(propiedad.publicadaEl, ahora) : null;
  const eventos = [...(propiedad.eventos ?? [])].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );
  const comparables = propiedad.comparables ?? [];
  // Dónde se está promocionando su inmueble: es la pregunta número uno del
  // propietario y hasta ahora tenía que preguntársela al asesor.
  const enlaces = propiedad.enlacesPromocion ?? [];
  const totalEnlaces = enlaces.length + (propiedad.urlPublica ? 1 : 0);
  const precioM2Propio = Math.round(propiedad.precio / propiedad.m2);
  const promedioComparables = comparables.length
    ? Math.round(comparables.reduce((s, c) => s + c.precio, 0) / comparables.length)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="glass flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500">
            <Building2 className="size-6 text-white/70" />
          </div>
          <div>
            {propiedadesPropietario.length > 1 ? (
              <select
                value={propiedadId}
                onChange={(e) => setPropiedadId(e.target.value)}
                className="rounded-xl border border-white/70 bg-white/70 px-2 py-1 text-sm font-bold text-slate-900 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/30 focus:outline-none"
              >
                {propiedadesPropietario.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titulo}
                  </option>
                ))}
              </select>
            ) : (
              <h1 className="text-lg font-bold text-slate-900">{propiedad.titulo}</h1>
            )}
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
              <MapPin className="size-3.5" /> {propiedad.ubicacion}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <StatusBadge estatus={propiedad.estatus} />
              {dias !== null && <span className="text-xs text-slate-500">Publicada hace {dias} días</span>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-slate-900">{formatoMXN(propiedad.precio)}</p>
          <button
            onClick={() => setModalContacto(true)}
            className="mt-2 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
          >
            <MessageCircle className="size-3.5" /> Contactar a mi asesor
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="glass flex gap-1 overflow-x-auto p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.key
                ? "bg-violet-600 text-white shadow-md shadow-violet-300/60"
                : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Resumen */}
      {tab === "resumen" && (
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Leads recibidos" value={String(leadsPropiedad.length)} icon={Users} accent="text-blue-500" />
            <KpiCard label="Visitas realizadas" value={String(visitas)} icon={TrendingUp} accent="text-amber-500" />
            <KpiCard label="Ofertas recibidas" value={String(ofertas)} icon={Target} accent="text-emerald-600" />
            <KpiCard
              label="Días en mercado"
              value={dias === null ? "—" : String(dias)}
              icon={Building2}
              accent="text-slate-500"
            />
          </section>

          {/* Dónde se anuncia: acceso directo desde el resumen. */}
          <section className="glass p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Megaphone className="size-4 text-violet-400" /> Dónde se anuncia tu propiedad
              </h2>
              {totalEnlaces > 0 && (
                <button
                  onClick={() => setTab("promocion")}
                  className="text-xs font-semibold text-violet-600 hover:text-violet-800"
                >
                  Ver los {totalEnlaces} enlaces
                </button>
              )}
            </div>
            {totalEnlaces === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Todavía no hay enlaces publicados. Tu asesor los registra aquí en cuanto la
                propiedad sale a los portales.
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                Publicada en{" "}
                <span className="font-semibold text-slate-800">
                  {totalEnlaces} {totalEnlaces === 1 ? "medio" : "medios"}
                </span>
                {enlaces.length > 0 && `: ${enlaces.map((e) => e.portal).join(", ")}`}
                {propiedad.urlPublica && enlaces.length > 0 && " y el sitio de la inmobiliaria"}
                {propiedad.urlPublica && enlaces.length === 0 && ": sitio de la inmobiliaria"}.
              </p>
            )}
          </section>

          <section className="glass p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Actividad reciente
            </h2>
            {eventos.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Aún no hay actividad registrada.</p>
            ) : (
              <ul className="space-y-2">
                {eventos.slice(0, 4).map((e) => (
                  <li key={e.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400" />
                    <div>
                      <p className="text-slate-700">{e.descripcion}</p>
                      <p className="text-xs text-slate-500">{fmtFechaHora(e.fecha)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {eventos.length > 4 && (
              <button
                onClick={() => setTab("cronologia")}
                className="mt-3 text-xs font-semibold text-slate-500 underline hover:text-slate-700"
              >
                Ver cronología completa
              </button>
            )}
          </section>

          <section className="glass p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Comentarios de prospectos
            </h2>
            {leadsPropiedad.filter((l) => l.nota?.trim()).length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                Aún no hay comentarios de prospectos.
              </p>
            ) : (
              <ul className="space-y-3">
                {[...leadsPropiedad]
                  .filter((l) => l.nota?.trim())
                  .sort((a, b) => new Date(b.creado).getTime() - new Date(a.creado).getTime())
                  .slice(0, 4)
                  .map((l) => (
                    <li key={l.id} className="text-sm">
                      <p className="italic text-slate-600">“{l.nota}”</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {l.nombre} · {new Date(l.creado).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section className="glass p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Comparativo rápido
            </h2>
            {promedioComparables === null ? (
              <p className="text-sm text-slate-500">Tu asesor aún no ha cargado comparables de la zona.</p>
            ) : (
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-xs text-slate-500">Tu precio</p>
                  <p className="text-lg font-bold text-slate-900">{formatoMXN(propiedad.precio)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Promedio de la zona</p>
                  <p className="text-lg font-bold text-slate-900">{formatoMXN(promedioComparables)}</p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Promoción — solo lectura para el propietario */}
      {tab === "promocion" && (
        <div className="space-y-4">
          <div className="glass p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Megaphone className="size-4 text-violet-400" /> Enlaces de publicación
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Ábrelos para ver tu propiedad tal como la ve un comprador.
            </p>
            <div className="mt-4 space-y-2">
              {propiedad.urlPublica && (
                <a
                  href={propiedad.urlPublica}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-3.5 py-3 ring-1 ring-slate-200/70 transition hover:bg-white"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                      <Globe className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">
                        Sitio de la inmobiliaria
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {propiedad.urlPublica}
                      </span>
                    </span>
                  </span>
                  <ExternalLink className="size-4 shrink-0 text-slate-500" />
                </a>
              )}
              {enlaces.map((e, i) => (
                <a
                  key={e.url + i}
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-3.5 py-3 ring-1 ring-slate-200/70 transition hover:bg-white"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                      <Link2 className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">{e.portal}</span>
                      <span className="block truncate text-[11px] text-slate-500">{e.url}</span>
                    </span>
                  </span>
                  <ExternalLink className="size-4 shrink-0 text-slate-500" />
                </a>
              ))}
              {totalEnlaces === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300/80 px-4 py-10 text-center">
                  <Home className="mx-auto size-7 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-600">
                    Tu propiedad todavía no tiene enlaces publicados
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                    En cuanto tu asesor la publique en los portales, los enlaces aparecerán
                    aquí y podrás verlos cuando quieras.
                  </p>
                </div>
              )}
            </div>
          </div>

          {(propiedad.videoUrl || propiedad.tourVirtualUrl) && (
            <div className="glass p-5">
              <h2 className="text-sm font-bold text-slate-900">Material audiovisual</h2>
              <div className="mt-3 space-y-1.5">
                {propiedad.videoUrl && (
                  <a
                    href={propiedad.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-sm font-semibold text-violet-600 hover:text-violet-800"
                  >
                    <ExternalLink className="size-3.5" /> Video de la propiedad
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
            </div>
          )}
        </div>
      )}

      {/* Cronología */}
      {tab === "cronologia" && (
        <div className="glass p-5">
          {eventos.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Aún no hay eventos registrados.</p>
          ) : (
            <ol className="space-y-4 border-l-2 border-slate-100 pl-4">
              {eventos.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1 flex size-3 items-center justify-center rounded-full bg-slate-800" />
                  <p className="text-xs text-slate-500">{fmtFechaHora(e.fecha)}</p>
                  <p className="text-sm text-slate-700">{e.descripcion}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Documentos */}
      {tab === "documentos" && (
        <div className="glass p-5">
          <ul className="space-y-2">
            {propiedad.documentos.map((d) => (
              <li
                key={d.nombre}
                className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 ring-1 ring-slate-200/70"
              >
                <span className="text-sm font-medium text-slate-700">{d.nombre}</span>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      d.aprobado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {d.aprobado ? "Validado" : "Pendiente"}
                  </span>
                  <button
                    disabled
                    title="Función todavía no disponible"
                    className="flex cursor-not-allowed items-center gap-1 text-xs font-semibold text-slate-300"
                  >
                    <Download className="size-3.5" /> Descargar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Función todavía no disponible: los documentos no tienen almacenamiento real.
          </p>
        </div>
      )}

      {/* Comparativo */}
      {tab === "comparativo" && (
        <div className="space-y-4">
          <div className="glass p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Precio propio</p>
                <p className="text-lg font-bold text-slate-900">{formatoMXN(propiedad.precio)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Precio / m² propio</p>
                <p className="text-lg font-bold text-slate-900">{formatoMXN(precioM2Propio)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Promedio zona</p>
                <p className="text-lg font-bold text-slate-900">
                  {promedioComparables ? formatoMXN(promedioComparables) : "Sin datos"}
                </p>
              </div>
            </div>
          </div>
          <div className="glass overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Dirección</th>
                  <th className="px-4 py-2.5">Precio</th>
                  <th className="px-4 py-2.5">m²</th>
                  <th className="px-4 py-2.5">Fuente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparables.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 text-slate-700">{c.direccion}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatoMXN(c.precio)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.m2}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.fuente}</td>
                  </tr>
                ))}
                {comparables.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Tu asesor todavía no ha cargado comparables.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalContacto && asesor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="glass-strong w-full max-w-sm rounded-3xl p-6">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">Tu asesor</h2>
              <button
                onClick={() => setModalContacto(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-sm font-bold text-white">
                {asesor.iniciales}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{asesor.nombre}</p>
                <p className="text-xs text-slate-500">{asesor.puesto}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Phone className="size-4 text-slate-500" /> {asesor.telefono || "Sin teléfono registrado"}
              </p>
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Mail className="size-4 text-slate-500" /> {asesor.correo}
              </p>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Sin chat en vivo dentro de la plataforma en el MVP — contacta directo por estos medios.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
