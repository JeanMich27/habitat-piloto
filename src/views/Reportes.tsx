import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import { finanzasDeLead } from "../lib/comisiones";
import { formatFecha, formatMin, minutosRespuesta, promedio } from "../lib/metrics";
import type { Lead, Propiedad, Usuario } from "../types";
import { formatoMXN } from "../types";

type Tab = "productividad" | "captaciones" | "cierres" | "tiempos";

const TABS: { key: Tab; label: string }[] = [
  { key: "productividad", label: "Productividad" },
  { key: "captaciones", label: "Captaciones" },
  { key: "cierres", label: "Cierres" },
  { key: "tiempos", label: "Tiempos de respuesta" },
];

interface Props {
  usuarios: Usuario[];
  propiedades: Propiedad[];
  leads: Lead[];
}

function isoADiaInput(iso: string) {
  return iso.slice(0, 10);
}

function BarraHorizontal({
  label,
  valor,
  max,
  formato,
  invertido = false,
}: {
  label: string;
  valor: number;
  max: number;
  formato: (v: number) => string;
  invertido?: boolean;
}) {
  const pct = max > 0 ? Math.max(2, (valor / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-xs text-slate-600" title={label}>
        {label}
      </span>
      <div className="h-4 flex-1 rounded bg-slate-100">
        <div
          className={`h-4 rounded ${invertido ? "bg-amber-500" : "bg-slate-700"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-20 shrink-0 text-right text-xs font-semibold text-slate-700">
        {formato(valor)}
      </span>
    </div>
  );
}

function descargarCSV(
  nombreArchivo: string,
  columnas: string[],
  filas: (string | number)[][],
) {
  const escapar = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const contenido = [columnas, ...filas]
    .map((fila) => fila.map(escapar).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reportes({ usuarios, propiedades, leads }: Props) {
  const [tab, setTab] = useState<Tab>("productividad");

  const hoyISO = useMemo(() => new Date().toISOString(), []);
  const hace90ISO = useMemo(
    () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    [],
  );
  const [desde, setDesde] = useState(isoADiaInput(hace90ISO));
  const [hasta, setHasta] = useState(isoADiaInput(hoyISO));

  const desdeMs = new Date(`${desde}T00:00:00`).getTime();
  const hastaMs = new Date(`${hasta}T23:59:59`).getTime();
  const enRango = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= desdeMs && t <= hastaMs;
  };

  const asesores = usuarios.filter(
    (u) => u.rol === "asesor_equipo" || u.rol === "asesor_independiente",
  );
  const nombreAsesor = (id: string) =>
    usuarios.find((u) => u.id === id)?.nombre ?? "Sin asignar";

  const leadsRango = leads.filter((l) => enRango(l.creado));
  const propsRango = propiedades.filter((p) => enRango(p.capturadaEl));

  // --- Productividad: leads atendidos, visitas, cierres y conversión por asesor ---
  const productividad = asesores
    .map((a) => {
      const suyos = leadsRango.filter((l) => l.asesorId === a.id);
      const visitas = suyos.filter((l) =>
        (["Visitado", "Negociacion", "Cierre"] as const).includes(
          l.etapa as "Visitado" | "Negociacion" | "Cierre",
        ),
      ).length;
      const cierres = suyos.filter((l) => l.etapa === "Cierre").length;
      const tasaConv = suyos.length ? Math.round((cierres / suyos.length) * 100) : 0;
      const tiempoProm = promedio(
        suyos.map(minutosRespuesta).filter((m): m is number => m !== null),
      );
      return { asesor: a, leads: suyos.length, visitas, cierres, tasaConv, tiempoProm };
    })
    .sort((a, b) => b.leads - a.leads);
  const maxLeads = Math.max(1, ...productividad.map((p) => p.leads));

  // --- Captaciones: propiedades dadas de alta por asesor en el rango ---
  const captaciones = asesores
    .map((a) => ({
      asesor: a,
      cantidad: propsRango.filter((p) => p.asesorId === a.id).length,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
  const maxCaptaciones = Math.max(1, ...captaciones.map((c) => c.cantidad));
  const propsRangoOrdenadas = [...propsRango].sort(
    (a, b) => new Date(b.capturadaEl).getTime() - new Date(a.capturadaEl).getTime(),
  );

  // --- Cierres: leads en etapa Cierre creados en el rango, por asesor ---
  const cierresRango = leadsRango.filter((l) => l.etapa === "Cierre");
  const cierresPorAsesor = asesores
    .map((a) => ({
      asesor: a,
      cantidad: cierresRango.filter((l) => l.asesorId === a.id).length,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
  const maxCierres = Math.max(1, ...cierresPorAsesor.map((c) => c.cantidad));

  // --- Tiempos de respuesta: promedio/min/max por asesor ---
  const tiemposPorAsesor = asesores
    .map((a) => {
      const suyos = leadsRango.filter((l) => l.asesorId === a.id);
      const tiempos = suyos.map(minutosRespuesta).filter((m): m is number => m !== null);
      return {
        asesor: a,
        prom: promedio(tiempos),
        min: tiempos.length ? Math.min(...tiempos) : null,
        max: tiempos.length ? Math.max(...tiempos) : null,
        n: tiempos.length,
      };
    })
    .filter((t) => t.n > 0)
    .sort((a, b) => (a.prom ?? Infinity) - (b.prom ?? Infinity));
  const maxProm = Math.max(1, ...tiemposPorAsesor.map((t) => t.prom ?? 0));

  const exportarCSV = () => {
    const fechaArchivo = `${desde}_a_${hasta}`;
    if (tab === "productividad") {
      descargarCSV(
        `reporte-productividad-${fechaArchivo}.csv`,
        ["Asesor", "Leads", "Visitas", "Cierres", "Tasa de conversión", "Tiempo de respuesta prom."],
        productividad.map((p) => [
          p.asesor.nombre,
          p.leads,
          p.visitas,
          p.cierres,
          `${p.tasaConv}%`,
          formatMin(p.tiempoProm),
        ]),
      );
    } else if (tab === "captaciones") {
      descargarCSV(
        `reporte-captaciones-${fechaArchivo}.csv`,
        ["Propiedad", "Asesor", "Tipo", "Operación", "Estatus", "Fecha de captación", "Precio"],
        propsRangoOrdenadas.map((p) => [
          p.titulo,
          nombreAsesor(p.asesorId),
          p.tipoInmueble,
          p.tipoOperacion,
          p.estatus,
          isoADiaInput(p.capturadaEl),
          p.precio,
        ]),
      );
    } else if (tab === "cierres") {
      descargarCSV(
        `reporte-cierres-${fechaArchivo}.csv`,
        ["Lead", "Propiedad", "Asesor", "Valor operación", "Comisión estimada", "Fecha"],
        cierresRango.map((l) => {
          const propiedad = propiedades.find((p) => p.id === l.interesPropiedadId);
          return [
            l.nombre,
            propiedad?.titulo ?? "—",
            nombreAsesor(l.asesorId),
            finanzasDeLead(l, propiedad).valorOperacion,
            finanzasDeLead(l, propiedad).cerrada
              ? finanzasDeLead(l, propiedad).ingresoConfirmado
              : "Pendiente",
            isoADiaInput(l.creado),
          ];
        }),
      );
    } else {
      descargarCSV(
        `reporte-tiempos-respuesta-${fechaArchivo}.csv`,
        ["Asesor", "Leads contactados", "Tiempo prom.", "Tiempo mín.", "Tiempo máx."],
        tiemposPorAsesor.map((t) => [
          t.asesor.nombre,
          t.n,
          formatMin(t.prom),
          formatMin(t.min),
          formatMin(t.max),
        ]),
      );
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reportes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Desempeño de la agencia por asesor, en el rango de fechas seleccionado
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Desde
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Hasta
            <input
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            />
          </label>
          <button
            onClick={exportarCSV}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Download className="size-3.5" /> Exportar CSV
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* --- Productividad --- */}
      {tab === "productividad" && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Leads atendidos por asesor
            </h2>
            <div className="space-y-2.5">
              {productividad.map((p) => (
                <BarraHorizontal
                  key={p.asesor.id}
                  label={p.asesor.nombre}
                  valor={p.leads}
                  max={maxLeads}
                  formato={(v) => String(v)}
                />
              ))}
              {productividad.length === 0 && (
                <p className="py-4 text-center text-xs text-slate-500">Sin asesores registrados.</p>
              )}
            </div>
          </section>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Asesor</th>
                  <th className="px-4 py-3">Leads</th>
                  <th className="px-4 py-3">Visitas</th>
                  <th className="px-4 py-3">Cierres</th>
                  <th className="px-4 py-3">Conversión</th>
                  <th className="px-4 py-3">Tiempo de respuesta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productividad.map((p) => (
                  <tr key={p.asesor.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{p.asesor.nombre}</td>
                    <td className="px-4 py-3 text-slate-600">{p.leads}</td>
                    <td className="px-4 py-3 text-slate-600">{p.visitas}</td>
                    <td className="px-4 py-3 text-slate-600">{p.cierres}</td>
                    <td className="px-4 py-3 text-slate-600">{p.tasaConv}%</td>
                    <td className="px-4 py-3 text-slate-600">{formatMin(p.tiempoProm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* --- Captaciones --- */}
      {tab === "captaciones" && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Propiedades captadas por asesor
            </h2>
            <div className="space-y-2.5">
              {captaciones.map((c) => (
                <BarraHorizontal
                  key={c.asesor.id}
                  label={c.asesor.nombre}
                  valor={c.cantidad}
                  max={maxCaptaciones}
                  formato={(v) => String(v)}
                />
              ))}
            </div>
          </section>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Propiedad</th>
                  <th className="px-4 py-3">Asesor</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Operación</th>
                  <th className="px-4 py-3">Estatus</th>
                  <th className="px-4 py-3">Captación</th>
                  <th className="px-4 py-3">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {propsRangoOrdenadas.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{p.titulo}</td>
                    <td className="px-4 py-3 text-slate-600">{nombreAsesor(p.asesorId)}</td>
                    <td className="px-4 py-3 text-slate-600">{p.tipoInmueble}</td>
                    <td className="px-4 py-3 text-slate-600">{p.tipoOperacion}</td>
                    <td className="px-4 py-3">
                      <StatusBadge estatus={p.estatus} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatFecha(p.capturadaEl)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatoMXN(p.precio)}</td>
                  </tr>
                ))}
                {propsRangoOrdenadas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      No hay propiedades captadas en este rango de fechas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* --- Cierres --- */}
      {tab === "cierres" && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Cierres por asesor
            </h2>
            <div className="space-y-2.5">
              {cierresPorAsesor.map((c) => (
                <BarraHorizontal
                  key={c.asesor.id}
                  label={c.asesor.nombre}
                  valor={c.cantidad}
                  max={maxCierres}
                  formato={(v) => String(v)}
                />
              ))}
            </div>
          </section>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Propiedad</th>
                  <th className="px-4 py-3">Asesor</th>
                  <th className="px-4 py-3">Monto oferta</th>
                  <th className="px-4 py-3">Comisión confirmada</th>
                  <th className="px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cierresRango.map((l) => {
                  const propiedad = propiedades.find((p) => p.id === l.interesPropiedadId);
                  const finanzas = finanzasDeLead(l, propiedad);
                  return (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{l.nombre}</td>
                      <td className="px-4 py-3 text-slate-600">{propiedad?.titulo ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{nombreAsesor(l.asesorId)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {finanzas.valorOperacion > 0 ? formatoMXN(finanzas.valorOperacion) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {finanzas.cerrada
                          ? formatoMXN(finanzas.ingresoConfirmado)
                          : "Pendiente"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatFecha(l.creado)}</td>
                    </tr>
                  );
                })}
                {cierresRango.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      No hay cierres registrados en este rango de fechas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* --- Tiempos de respuesta --- */}
      {tab === "tiempos" && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Tiempo de respuesta promedio por asesor (minutos)
            </h2>
            <div className="space-y-2.5">
              {tiemposPorAsesor.map((t) => (
                <BarraHorizontal
                  key={t.asesor.id}
                  label={t.asesor.nombre}
                  valor={t.prom ?? 0}
                  max={maxProm}
                  formato={(v) => formatMin(v)}
                  invertido
                />
              ))}
              {tiemposPorAsesor.length === 0 && (
                <p className="py-4 text-center text-xs text-slate-500">
                  Ningún lead del rango tiene primer contacto registrado.
                </p>
              )}
            </div>
          </section>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Asesor</th>
                  <th className="px-4 py-3">Leads contactados</th>
                  <th className="px-4 py-3">Tiempo prom.</th>
                  <th className="px-4 py-3">Tiempo mín.</th>
                  <th className="px-4 py-3">Tiempo máx.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tiemposPorAsesor.map((t) => (
                  <tr key={t.asesor.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{t.asesor.nombre}</td>
                    <td className="px-4 py-3 text-slate-600">{t.n}</td>
                    <td className="px-4 py-3 text-slate-600">{formatMin(t.prom)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatMin(t.min)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatMin(t.max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
