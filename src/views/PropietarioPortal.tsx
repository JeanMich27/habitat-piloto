import { useMemo, useState } from "react";
import {
  Building2,
  Download,
  Mail,
  MapPin,
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

type Tab = "resumen" | "cronologia" | "documentos" | "comparativo";

const TABS: { key: Tab; label: string }[] = [
  { key: "resumen", label: "Resumen" },
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
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-slate-400">
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
  const precioM2Propio = Math.round(propiedad.precio / propiedad.m2);
  const promedioComparables = comparables.length
    ? Math.round(comparables.reduce((s, c) => s + c.precio, 0) / comparables.length)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500">
            <Building2 className="size-6 text-white/70" />
          </div>
          <div>
            {propiedadesPropietario.length > 1 ? (
              <select
                value={propiedadId}
                onChange={(e) => setPropiedadId(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm font-bold text-slate-900"
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
              {dias !== null && <span className="text-xs text-slate-400">Publicada hace {dias} días</span>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-slate-900">{formatoMXN(propiedad.precio)}</p>
          <button
            onClick={() => setModalContacto(true)}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <MessageCircle className="size-3.5" /> Contactar a mi asesor
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
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

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Actividad reciente
            </h2>
            {eventos.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Aún no hay actividad registrada.</p>
            ) : (
              <ul className="space-y-2">
                {eventos.slice(0, 4).map((e) => (
                  <li key={e.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400" />
                    <div>
                      <p className="text-slate-700">{e.descripcion}</p>
                      <p className="text-xs text-slate-400">{fmtFechaHora(e.fecha)}</p>
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

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Comparativo rápido
            </h2>
            {promedioComparables === null ? (
              <p className="text-sm text-slate-400">Tu asesor aún no ha cargado comparables de la zona.</p>
            ) : (
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-xs text-slate-400">Tu precio</p>
                  <p className="text-lg font-bold text-slate-900">{formatoMXN(propiedad.precio)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Promedio de la zona</p>
                  <p className="text-lg font-bold text-slate-900">{formatoMXN(promedioComparables)}</p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Cronología */}
      {tab === "cronologia" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {eventos.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Aún no hay eventos registrados.</p>
          ) : (
            <ol className="space-y-4 border-l-2 border-slate-100 pl-4">
              {eventos.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1 flex size-3 items-center justify-center rounded-full bg-slate-800" />
                  <p className="text-xs text-slate-400">{fmtFechaHora(e.fecha)}</p>
                  <p className="text-sm text-slate-700">{e.descripcion}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Documentos */}
      {tab === "documentos" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ul className="space-y-2">
            {propiedad.documentos.map((d) => (
              <li
                key={d.nombre}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
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
                    disabled={!d.aprobado}
                    title={d.aprobado ? undefined : "Aún no está validado"}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-500 enabled:hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    <Download className="size-3.5" /> Descargar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            Solo lectura — descarga simulada, sin almacenamiento real de archivos en el prototipo.
          </p>
        </div>
      )}

      {/* Comparativo */}
      {tab === "comparativo" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
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
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900">Tu asesor</h2>
              <button
                onClick={() => setModalContacto(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white">
                {asesor.iniciales}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{asesor.nombre}</p>
                <p className="text-xs text-slate-400">{asesor.puesto}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Phone className="size-4 text-slate-400" /> {asesor.telefono || "Sin teléfono registrado"}
              </p>
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Mail className="size-4 text-slate-400" /> {asesor.correo}
              </p>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Sin chat en vivo dentro de la plataforma en el MVP — contacta directo por estos medios.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
