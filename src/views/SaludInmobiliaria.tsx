// Pantalla "Salud inmobiliaria" — radiografía de cómo está operando el
// asesor. Antes se llamaba "Posibles cierres y comisiones" y abría con la
// parte financiera; ahora abre con la operación, porque el dinero es
// consecuencia de la operación y no al revés.
//
// SOLO LECTURA en el sentido estricto: aquí no se edita ningún dato. Pero
// TODO lo que se ve es navegable — cada barra y cada segmento lleva a la
// lista exacta de clientes o propiedades que lo componen. Una gráfica que no
// te deja llegar al registro es un adorno.
//
// REGLA HEREDADA: no se inventa ningún número. Todo sale de lo que el asesor
// capturó (etapas, calificaciones BANT, fechas de contacto, precios del CRM).
// Los totales usan lib/proyeccion.ts — la MISMA fuente que la tarjeta del
// dashboard, para que nunca se contradigan.
import { useMemo, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
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
import { NIVELES_CARTERA, conteoPorNivel, type NivelCartera } from "../lib/cartera";
import { formatMin, minutosRespuesta, promedio } from "../lib/metrics";
import { totalesProyeccion } from "../lib/proyeccion";
import { RANGOS_RESPUESTA, conteoPorRango, type RangoRespuesta } from "../lib/respuesta";
import type { Lead, LeadStage, Propiedad, Usuario } from "../types";
import { formatoMXN } from "../types";

// Tarjeta de análisis con explicación de lectura incluida: la gráfica sin
// contexto no le sirve a nadie.
function TarjetaAnalisis({
  Icono,
  titulo,
  lectura,
  pista,
  children,
}: {
  Icono: typeof Clock;
  titulo: string;
  lectura: string;
  /** Microcopy que avisa que la gráfica es navegable. */
  pista?: string;
  children: ReactNode;
}) {
  return (
    <section className="glass p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Icono className="size-4 text-violet-600" /> {titulo}
        </h2>
        {pista && (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-600">
            {pista}
          </span>
        )}
      </div>
      {children}
      <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-white/60 p-2.5 text-[11px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
        {lectura}
      </p>
    </section>
  );
}

// Fila-barra navegable: etiqueta a la izquierda, barra proporcional, conteo y
// chevron. Es un <button> real para que funcione con teclado y lectores.
function FilaNavegable({
  etiqueta,
  adorno,
  cantidad,
  porcentaje,
  ancho,
  colorBarra,
  alto = "h-4",
  onClick,
  aria,
}: {
  etiqueta: string;
  adorno?: ReactNode;
  cantidad: number;
  porcentaje?: number;
  /** 0–100, ya calculado contra el máximo de la serie. */
  ancho: number;
  colorBarra: string;
  alto?: string;
  onClick: () => void;
  aria: string;
}) {
  const vacio = cantidad === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={vacio}
      aria-label={aria}
      className={`group flex w-full items-center gap-3 rounded-xl px-1.5 py-1 text-left transition ${
        vacio ? "cursor-default opacity-50" : "hover:bg-white/70"
      }`}
    >
      <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-600 sm:w-32">
        {adorno}
        <span className="truncate">{etiqueta}</span>
      </span>
      <span className={`${alto} flex-1 overflow-hidden rounded-full bg-white/60 shadow-inner`}>
        <span
          className={`block h-full rounded-full ${colorBarra}`}
          style={{ width: `${ancho}%` }}
        />
      </span>
      {porcentaje !== undefined && (
        <span className="w-9 shrink-0 text-right text-xs text-slate-500">{porcentaje}%</span>
      )}
      <span className="w-6 shrink-0 text-right text-xs font-bold text-slate-700">{cantidad}</span>
      <ChevronRight
        className={`size-4 shrink-0 text-slate-300 transition ${
          vacio ? "opacity-0" : "group-hover:translate-x-0.5 group-hover:text-violet-500"
        }`}
      />
    </button>
  );
}

interface Props {
  asesor: Usuario;
  leads: Lead[];
  propiedades: Propiedad[];
  onVolver: () => void;
  /** Abre Clientes filtrado por etapa del embudo. */
  onVerClientesPorEtapa: (etapa: LeadStage) => void;
  /** Abre Clientes filtrado por rango de velocidad de primer contacto. */
  onVerClientesPorRespuesta: (rango: RangoRespuesta) => void;
  /** Abre Clientes filtrado por nivel de calificación (Hot / Warm / Cold / sin). */
  onVerClientesPorNivel: (nivel: NivelCartera) => void;
  /** Abre Propiedades filtrado por rango de antigüedad. */
  onVerPropiedadesPorAntiguedad: (nivel: NivelAntiguedad) => void;
}

export default function SaludInmobiliaria({
  asesor,
  leads,
  propiedades,
  onVolver,
  onVerClientesPorEtapa,
  onVerClientesPorRespuesta,
  onVerClientesPorNivel,
  onVerPropiedadesPorAntiguedad,
}: Props) {
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

  // --- Velocidad de respuesta (mismos cortes que el filtro de Clientes) ---
  const tiempos = misLeads.map(minutosRespuesta).filter((m): m is number => m !== null);
  const tiempoProm = promedio(tiempos);
  const porRango = conteoPorRango(misLeads);
  const maxRespuesta = Math.max(1, ...Object.values(porRango));

  // --- Salud de la cartera (donut de calificación) ---
  const porNivelCartera = conteoPorNivel(misLeads);
  const segmentos = NIVELES_CARTERA.map((n) => ({ ...n, cantidad: porNivelCartera[n.clave] }));
  const totalSegmentos = Math.max(1, segmentos.reduce((s, x) => s + x.cantidad, 0));
  // Geometría del donut (SVG puro, sin dependencias).
  const R = 40;
  const CIRC = 2 * Math.PI * R;
  let acumulado = 0;

  // --- Antigüedad del inventario ---
  const porAntiguedad = new Map<NivelAntiguedad, number>();
  misPropiedades.forEach((p) => {
    const n = antiguedadDe(p).nivel;
    porAntiguedad.set(n, (porAntiguedad.get(n) ?? 0) + 1);
  });
  const maxAntiguedad = Math.max(1, ...[...porAntiguedad.values()]);
  const inventarioEnRiesgo =
    (porAntiguedad.get("naranja") ?? 0) + (porAntiguedad.get("rojo") ?? 0);

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
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Salud inmobiliaria</h1>
            <p className="text-xs text-slate-500">
              Cómo estás operando hoy, con tus propios datos · toca cualquier dato para ver el
              detalle
            </p>
          </div>
        </div>
      </header>

      {/* ---------- Signos vitales: el resumen de una sola línea ---------- */}
      <section className="glass relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-100/60 via-violet-100/40 to-emerald-100/50" />
        <div className="relative grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600">
              Tasa de cierre
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900">{tasaGlobal}%</p>
            <p className="text-xs text-slate-500">
              {cierres} de {misLeads.length} clientes
            </p>
          </div>
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">
              Primer contacto
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900">{formatMin(tiempoProm)}</p>
            <p className="text-xs text-slate-500">promedio de tu cartera</p>
          </div>
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
              Clientes Hot
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900">{porNivelCartera.Hot}</p>
            <p className="text-xs text-slate-500">
              {porNivelCartera.sin} sin calificar todavía
            </p>
          </div>
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">
              Inventario en riesgo
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900">{inventarioEnRiesgo}</p>
            <p className="text-xs text-slate-500">
              de {misPropiedades.length} con +4 meses publicados
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Cómo estás operando ---------- */}
      <div>
        <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-900 sm:text-base">
          Cómo estás operando
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          {/* --- Embudo de conversión --- */}
          <TarjetaAnalisis
            Icono={Filter}
            titulo="Tu embudo de conversión"
            pista="Toca una etapa"
            lectura={`De cada 100 clientes que entran, ${tasaGlobal} llegan a cierre. Donde la barra se encoge de golpe es donde se te están cayendo los clientes.`}
          >
            <div className="mt-4 space-y-1.5">
              {embudo.map((e) => (
                <FilaNavegable
                  key={e.etapa}
                  etiqueta={e.titulo}
                  cantidad={e.cantidad}
                  porcentaje={misLeads.length ? Math.round((e.cantidad / misLeads.length) * 100) : 0}
                  ancho={Math.max((e.cantidad / maxEmbudo) * 100, e.cantidad > 0 ? 8 : 0)}
                  colorBarra={e.acento}
                  alto="h-6"
                  onClick={() => onVerClientesPorEtapa(e.etapa)}
                  aria={`Ver los ${e.cantidad} clientes en etapa ${e.titulo}`}
                />
              ))}
            </div>
          </TarjetaAnalisis>

          {/* --- Velocidad de respuesta --- */}
          <TarjetaAnalisis
            Icono={Clock}
            titulo="Tu velocidad de respuesta"
            pista="Toca un rango"
            lectura="El tiempo va de que el cliente llegó a que registraste el primer contacto. Los que siguen sin contactar son tu dinero más frágil: cada día que pasa vale menos."
          >
            <p className="mt-3 text-2xl font-black text-slate-900">
              {formatMin(tiempoProm)}
              <span className="ml-2 text-xs font-medium text-slate-400">
                promedio de primer contacto
              </span>
            </p>
            <div className="mt-3 space-y-1.5">
              {RANGOS_RESPUESTA.map((r) => (
                <FilaNavegable
                  key={r.clave}
                  etiqueta={r.etiqueta}
                  cantidad={porRango[r.clave]}
                  ancho={(porRango[r.clave] / maxRespuesta) * 100}
                  colorBarra={r.color}
                  onClick={() => onVerClientesPorRespuesta(r.clave)}
                  aria={`Ver los ${porRango[r.clave]} clientes contactados: ${r.etiqueta}`}
                />
              ))}
            </div>
          </TarjetaAnalisis>

          {/* --- Salud de la cartera --- */}
          <TarjetaAnalisis
            Icono={HeartPulse}
            titulo="Salud de tu cartera"
            pista="Toca un nivel"
            lectura="Hot merece tu agenda de hoy; Warm, seguimiento constante. El segmento gris son clientes de los que no sabes nada todavía: califícalos y tu proyección ponderada se vuelve confiable."
          >
            <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
              <svg
                viewBox="0 0 100 100"
                className="size-36"
                role="img"
                aria-label="Cartera por calificación"
              >
                {segmentos.map((s) => {
                  const frac = s.cantidad / totalSegmentos;
                  const inicio = acumulado;
                  acumulado += frac;
                  if (s.cantidad === 0) return null;
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
                      className="cursor-pointer transition-opacity hover:opacity-75"
                      onClick={() => onVerClientesPorNivel(s.clave)}
                    >
                      <title>{`${s.etiqueta} (${s.rango}): ${s.cantidad} — toca para verlos`}</title>
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

              {/* Leyenda por iconos: la temperatura se entiende sin leer. */}
              <ul className="space-y-1">
                {segmentos.map((s) => {
                  const { Icono } = s;
                  const vacio = s.cantidad === 0;
                  return (
                    <li key={s.clave}>
                      <button
                        type="button"
                        onClick={() => onVerClientesPorNivel(s.clave)}
                        disabled={vacio}
                        aria-label={`Ver los ${s.cantidad} clientes ${s.etiqueta}`}
                        title={`${s.rango} · ${s.accion}`}
                        className={`group flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition ${
                          vacio ? "cursor-default opacity-50" : "hover:bg-white/80"
                        }`}
                      >
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full ${s.pill}`}
                        >
                          <Icono className={`size-4 ${s.iconoColor}`} />
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.pill}`}>
                          {s.etiqueta}
                        </span>
                        <span className="ml-auto text-sm font-black text-slate-800">
                          {s.cantidad}
                        </span>
                        <ChevronRight
                          className={`size-4 shrink-0 text-slate-300 transition ${
                            vacio ? "opacity-0" : "group-hover:translate-x-0.5 group-hover:text-violet-500"
                          }`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </TarjetaAnalisis>

          {/* --- Antigüedad del inventario --- */}
          <TarjetaAnalisis
            Icono={Thermometer}
            titulo="Antigüedad de tu inventario"
            pista="Toca un rango"
            lectura="Mismo termómetro que ves en cada tarjeta de propiedad. Lo naranja y rojo lleva más de 4 meses publicado: revisa precio, fotos o estrategia antes de que se enfríe más."
          >
            {misPropiedades.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                Sin propiedades asignadas: no hay inventario que medir.
              </p>
            ) : (
              <div className="mt-4 space-y-1.5">
                {ANTIGUEDAD_LEYENDA.map(({ nivel, texto }) => {
                  const cantidad = porAntiguedad.get(nivel) ?? 0;
                  const estilo = ANTIGUEDAD_ESTILOS[nivel];
                  return (
                    <FilaNavegable
                      key={nivel}
                      etiqueta={texto}
                      adorno={<span className={`size-2.5 shrink-0 rounded-full ${estilo.punto}`} />}
                      cantidad={cantidad}
                      ancho={(cantidad / maxAntiguedad) * 100}
                      colorBarra={estilo.barra}
                      onClick={() => onVerPropiedadesPorAntiguedad(nivel)}
                      aria={`Ver las ${cantidad} propiedades con ${texto} publicadas`}
                    />
                  );
                })}
              </div>
            )}
          </TarjetaAnalisis>
        </div>
      </div>

      {/* ---------- Tu dinero en juego (proyección financiera) ---------- */}
      <div>
        <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-900 sm:text-base">
          Tu dinero en juego
        </h2>

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

        {/* Proyección detallada (interactiva: cortes y tarifas) */}
        <div className="mt-4 sm:mt-6">
          <ProyeccionComisiones leads={misLeads} propiedades={propiedades} />
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
