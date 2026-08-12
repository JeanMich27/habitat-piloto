// Sección "Posibles cierres y comisiones" — análisis completo, SOLO LECTURA.
//
// Objetivo: que el asesor entienda CÓMO está operando, con sus propios
// datos. Aquí no se edita nada; se abre desde la tarjeta del dashboard
// (no tiene icono en el menú, a propósito).
//
// REGLA HEREDADA: no se inventa ningún número. Todo sale de lo que el
// asesor capturó (leads, calificaciones BANT, fechas de contacto, precios
// del CRM). Los totales usan lib/proyeccion.ts — la MISMA fuente que la
// tarjeta del dashboard, para que nunca se contradigan.
import { useMemo, type ReactNode } from "react";
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Filter,
  HeartPulse,
  Info,
  Thermometer,
} from "lucide-react";
import ProyeccionComisiones from "../components/ProyeccionComisiones";
import { ETAPAS_LEAD } from "../data/etapasLead";
import {
  ANTIGUEDAD_ESTILOS,
  ANTIGUEDAD_LEYENDA,
  antiguedadDe,
  type NivelAntiguedad,
} from "../lib/antiguedad";
import { formatMin, minutosRespuesta, promedio } from "../lib/metrics";
import { totalesProyeccion } from "../lib/proyeccion";
import type { Lead, Propiedad, Usuario } from "../types";
import { clasificarLead, formatoMXN, totalBant } from "../types";

// Colores del donut de calificación (mismos niveles que usa toda la app).
const NIVELES_CARTERA = [
  { clave: "Hot", etiqueta: "Hot (80–100)", color: "#10b981", pill: "bg-emerald-50 text-emerald-700" },
  { clave: "Warm", etiqueta: "Warm (50–79)", color: "#f59e0b", pill: "bg-amber-50 text-amber-700" },
  { clave: "Cold", etiqueta: "Cold (0–49)", color: "#38bdf8", pill: "bg-sky-50 text-sky-700" },
  { clave: "sin", etiqueta: "Sin calificar", color: "#cbd5e1", pill: "bg-slate-100 text-slate-600" },
] as const;

// Tarjeta de análisis con explicación de lectura incluida: la gráfica sin
// contexto no le sirve a nadie.
function TarjetaAnalisis({
  Icono,
  titulo,
  lectura,
  children,
}: {
  Icono: typeof Clock;
  titulo: string;
  lectura: string;
  children: ReactNode;
}) {
  return (
    <section className="glass p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <Icono className="size-4 text-violet-600" /> {titulo}
      </h2>
      {children}
      <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-white/60 p-2.5 text-[11px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
        {lectura}
      </p>
    </section>
  );
}

interface Props {
  asesor: Usuario;
  leads: Lead[];
  propiedades: Propiedad[];
  onVolver: () => void;
}

export default function AnalisisComisiones({ asesor, leads, propiedades, onVolver }: Props) {
  const misLeads = useMemo(() => leads.filter((l) => l.asesorId === asesor.id), [leads, asesor.id]);
  const misPropiedades = useMemo(
    () => propiedades.filter((p) => p.asesorId === asesor.id),
    [propiedades, asesor.id],
  );

  const proyeccion = totalesProyeccion(misLeads, propiedades);

  // --- Embudo de conversión ---
  const embudo = ETAPAS_LEAD.map(({ etapa, titulo, acento }) => ({
    etapa,
    titulo,
    acento,
    cantidad: misLeads.filter((l) => l.etapa === etapa).length,
  }));
  const maxEmbudo = Math.max(1, ...embudo.map((e) => e.cantidad));
  const cierres = embudo.find((e) => e.etapa === "Cierre")?.cantidad ?? 0;
  const tasaGlobal = misLeads.length ? Math.round((cierres / misLeads.length) * 100) : 0;

  // --- Velocidad de respuesta ---
  const tiempos = misLeads.map(minutosRespuesta).filter((m): m is number => m !== null);
  const tiempoProm = promedio(tiempos);
  const sinContactar = misLeads.filter((l) => !l.primerContactoEn).length;
  const bucketsRespuesta = [
    { etiqueta: "En la primera hora", cantidad: tiempos.filter((m) => m <= 60).length, color: "bg-emerald-500" },
    { etiqueta: "Mismo día (1–24 h)", cantidad: tiempos.filter((m) => m > 60 && m <= 1440).length, color: "bg-amber-400" },
    { etiqueta: "Más de un día", cantidad: tiempos.filter((m) => m > 1440).length, color: "bg-orange-500" },
    { etiqueta: "Sin contactar aún", cantidad: sinContactar, color: "bg-rose-500" },
  ];
  const maxRespuesta = Math.max(1, ...bucketsRespuesta.map((b) => b.cantidad));

  // --- Salud de la cartera (donut de calificación) ---
  const conteoNivel = (clave: string) =>
    clave === "sin"
      ? misLeads.filter((l) => !l.bant).length
      : misLeads.filter((l) => l.bant && clasificarLead(totalBant(l.bant)) === clave).length;
  const segmentos = NIVELES_CARTERA.map((n) => ({ ...n, cantidad: conteoNivel(n.clave) }));
  const totalSegmentos = Math.max(1, segmentos.reduce((s, x) => s + x.cantidad, 0));
  // Geometría del donut (SVG puro, sin dependencias).
  const R = 40;
  const CIRC = 2 * Math.PI * R;
  let acumulado = 0;

  // --- Antigüedad del inventario ---
  const porNivel = new Map<NivelAntiguedad, number>();
  misPropiedades.forEach((p) => {
    const n = antiguedadDe(p).nivel;
    porNivel.set(n, (porNivel.get(n) ?? 0) + 1);
  });
  const maxAntiguedad = Math.max(1, ...[...porNivel.values()]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* ---------- Encabezado ---------- */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onVolver}
            className="flex size-10 items-center justify-center rounded-full bg-white/80 text-slate-600 shadow-sm hover:bg-white"
            aria-label="Volver al dashboard"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
              Posibles cierres y comisiones
            </h1>
            <p className="text-xs text-slate-500">
              Análisis de tu operación con tus propios datos · solo lectura
            </p>
          </div>
        </div>
      </header>

      {/* ---------- Cifras principales (misma fuente que el dashboard) ---------- */}
      <section className="glass relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-100/60 via-sky-100/40 to-violet-100/40" />
        <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/80">
              Comisión esperada (ponderada)
            </p>
            <p className="mt-1 text-2xl font-black text-emerald-700 sm:text-3xl">
              {formatoMXN(Math.round(proyeccion.ponderadoTotal))}
            </p>
            <p className="text-xs text-slate-500">
              Pesada con el puntaje BANT que tú capturaste
            </p>
          </div>
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600">
              Comisión potencial bruta
            </p>
            <p className="mt-1 text-2xl font-black text-violet-700 sm:text-3xl">
              {formatoMXN(Math.round(proyeccion.brutoTotal))}
            </p>
            <p className="text-xs text-slate-500">Si el 100% de tu cartera cerrara</p>
          </div>
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Valor cartera total
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">
              {formatoMXN(Math.round(proyeccion.valorCartera))}
            </p>
            <p className="text-xs text-slate-500">
              {proyeccion.prospectosConValor} prospecto
              {proyeccion.prospectosConValor === 1 ? "" : "s"} con propiedad de interés
            </p>
          </div>
        </div>
        {proyeccion.sinValor > 0 && (
          <p className="relative mt-3 text-[11px] text-slate-500">
            {proyeccion.sinValor} de tus prospectos no entran al cálculo porque aún no tienen
            propiedad de interés u oferta registrada.
          </p>
        )}
      </section>

      {/* ---------- Proyección detallada (interactiva: cortes y tarifas) ---------- */}
      <ProyeccionComisiones leads={misLeads} propiedades={propiedades} />

      {/* ---------- Cómo estás operando ---------- */}
      <div>
        <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-900 sm:text-base">
          Cómo estás operando
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          {/* Embudo de conversión */}
          <TarjetaAnalisis
            Icono={Filter}
            titulo="Tu embudo de conversión"
            lectura={`De cada 100 clientes que entran, ${tasaGlobal} llegan a cierre. Donde la barra se encoge de golpe es donde se te están cayendo los clientes.`}
          >
            <div className="mt-4 space-y-2.5">
              {embudo.map((e) => (
                <div key={e.etapa} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-semibold text-slate-600">
                    {e.titulo}
                  </span>
                  <div className="h-6 flex-1 overflow-hidden rounded-full bg-white/60 shadow-inner">
                    <div
                      className={`flex h-full items-center justify-end rounded-full pr-2 ${e.acento}`}
                      style={{ width: `${Math.max((e.cantidad / maxEmbudo) * 100, e.cantidad > 0 ? 12 : 0)}%` }}
                    >
                      {e.cantidad > 0 && (
                        <span className="text-[10px] font-bold text-white">{e.cantidad}</span>
                      )}
                    </div>
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs text-slate-500">
                    {misLeads.length ? Math.round((e.cantidad / misLeads.length) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </TarjetaAnalisis>

          {/* Velocidad de respuesta */}
          <TarjetaAnalisis
            Icono={Clock}
            titulo="Tu velocidad de respuesta"
            lectura="El tiempo va de que el cliente llegó a que registraste el primer contacto. Los que siguen sin contactar son tu dinero más frágil: cada día que pasa vale menos."
          >
            <p className="mt-3 text-2xl font-black text-slate-900">
              {formatMin(tiempoProm)}
              <span className="ml-2 text-xs font-medium text-slate-400">
                promedio de primer contacto
              </span>
            </p>
            <div className="mt-3 space-y-2.5">
              {bucketsRespuesta.map((b) => (
                <div key={b.etiqueta} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-xs font-semibold text-slate-600">
                    {b.etiqueta}
                  </span>
                  <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/60 shadow-inner">
                    <div
                      className={`h-full rounded-full ${b.color}`}
                      style={{ width: `${(b.cantidad / maxRespuesta) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-xs font-bold text-slate-700">
                    {b.cantidad}
                  </span>
                </div>
              ))}
            </div>
          </TarjetaAnalisis>

          {/* Salud de la cartera */}
          <TarjetaAnalisis
            Icono={HeartPulse}
            titulo="Salud de tu cartera (calificación BANT)"
            lectura="Hot merece tu agenda de hoy; Warm, seguimiento constante. El segmento gris son clientes de los que no sabes nada todavía: califícalos y tu proyección ponderada se vuelve confiable."
          >
            <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
              <svg viewBox="0 0 100 100" className="size-36" role="img" aria-label="Cartera por calificación">
                {segmentos.map((s) => {
                  const frac = s.cantidad / totalSegmentos;
                  const inicio = acumulado;
                  acumulado += frac;
                  return (
                    <circle
                      key={s.clave}
                      cx="50"
                      cy="50"
                      r={R}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="14"
                      strokeDasharray={`${frac * CIRC} ${CIRC}`}
                      strokeDashoffset={-inicio * CIRC}
                      transform="rotate(-90 50 50)"
                    >
                      <title>{`${s.etiqueta}: ${s.cantidad}`}</title>
                    </circle>
                  );
                })}
                <text x="50" y="47" textAnchor="middle" fontSize="18" fontWeight="800" fill="#0f172a">
                  {misLeads.length}
                </text>
                <text x="50" y="61" textAnchor="middle" fontSize="8" fill="#64748b">
                  clientes
                </text>
              </svg>
              <ul className="space-y-1.5">
                {segmentos.map((s) => (
                  <li key={s.clave} className="flex items-center gap-2 text-xs">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${s.pill}`}>
                      {s.etiqueta}
                    </span>
                    <span className="font-bold text-slate-700">{s.cantidad}</span>
                  </li>
                ))}
              </ul>
            </div>
          </TarjetaAnalisis>

          {/* Antigüedad del inventario */}
          <TarjetaAnalisis
            Icono={Thermometer}
            titulo="Antigüedad de tu inventario"
            lectura="Mismo termómetro que ves en cada tarjeta de propiedad. Lo naranja y rojo lleva más de 4 meses publicado: revisa precio, fotos o estrategia antes de que se enfríe más."
          >
            {misPropiedades.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                Sin propiedades asignadas: no hay inventario que medir.
              </p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {ANTIGUEDAD_LEYENDA.map(({ nivel, texto }) => {
                  const cantidad = porNivel.get(nivel) ?? 0;
                  const estilo = ANTIGUEDAD_ESTILOS[nivel];
                  return (
                    <div key={nivel} className="flex items-center gap-3">
                      <span className="flex w-24 shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <span className={`size-2.5 rounded-full ${estilo.punto}`} /> {texto}
                      </span>
                      <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/60 shadow-inner">
                        <div
                          className={`h-full rounded-full ${estilo.barra}`}
                          style={{ width: `${(cantidad / maxAntiguedad) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right text-xs font-bold text-slate-700">
                        {cantidad}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </TarjetaAnalisis>
        </div>
      </div>

      {/* Cierre honesto: qué es y qué no es este análisis. */}
      <p className="flex items-start gap-2 rounded-2xl bg-white/60 p-4 text-[11px] leading-relaxed text-slate-500">
        <DollarSign className="mt-0.5 size-4 shrink-0 text-slate-400" />
        Todo lo que ves aquí sale de datos que tú (o tu CRM) capturaron: etapas, calificaciones
        BANT, fechas de contacto y precios reales. No es un pronóstico — es una radiografía de
        cómo estás operando hoy. Mientras mejor captures, más útil se vuelve.
      </p>
    </div>
  );
}
