// Proyección de posibles cierres y comisiones — solo en el dashboard del asesor.
//
// ============================================================
//  REGLA DE ESTE COMPONENTE: NO SE INVENTA NINGÚN NÚMERO
// ============================================================
// Todo lo que se grafica sale de datos que el asesor capturó:
//
//   · Valor de cada operación → monto de la oferta si existe; si no, el
//     precio real de la propiedad de interés. Si no hay ninguno, ese
//     prospecto no entra (no se estima un valor a ojo).
//   · Comisión potencial     → valor × el % que el asesor define arriba.
//   · Comisión ponderada     → valor × % × (puntaje de calificación / 100).
//
// El ponderador es el puntaje BANT que el propio asesor respondió, NO una
// probabilidad de cierre. La diferencia importa: una probabilidad exige
// historial de cierres para calcularse, y esta plataforma todavía no lo
// tiene. Llamarle "probabilidad" sería vender una ficción con apariencia
// de modelo financiero.
//
// Consecuencia deliberada: un prospecto sin calificar aporta 0 a la
// columna ponderada. No es un castigo arbitrario — es la representación
// honesta de "no sabemos nada de esta persona".
import { useMemo, useState } from "react";
import { AlertCircle, TrendingUp } from "lucide-react";
import type { Lead, Propiedad } from "../types";
import {
  BANT_PLAZO,
  clasificarLead,
  formatoMXN,
  totalBant,
} from "../types";
import { etiquetaEtapa } from "../lib/metrics";
import {
  MESES_RENTA_DEFAULT,
  PCT_VENTA_DEFAULT,
  comisionBase,
  tarifaDePropiedad,
} from "../lib/comisiones";

type Corte = "etapa" | "calificacion" | "plazo";

const CORTES: { key: Corte; label: string }[] = [
  { key: "etapa", label: "Por etapa" },
  { key: "calificacion", label: "Por calificación" },
  { key: "plazo", label: "Por plazo" },
];

interface Fila {
  clave: string;
  etiqueta: string;
  prospectos: number;
  bruto: number;
  ponderado: number;
  sinCalificar: number;
}

const compacto = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
};

interface Props {
  leads: Lead[];
  propiedades: Propiedad[];
}

export default function ProyeccionComisiones({ leads, propiedades }: Props) {
  // Los dos parámetros de tarifa están a la vista y son editables: no son
  // supuestos ocultos. Venta cobra %, renta cobra meses — fórmulas distintas.
  const [pctComision, setPctComision] = useState(PCT_VENTA_DEFAULT);
  const [mesesRenta, setMesesRenta] = useState(MESES_RENTA_DEFAULT);
  const [corte, setCorte] = useState<Corte>("etapa");

  // Base: prospectos con un valor real asociado.
  const base = useMemo(() => {
    return leads
      .map((l) => {
        const prop = propiedades.find((p) => p.id === l.interesPropiedadId);
        // Valor real: la oferta que se puso sobre la mesa, o el precio de lista.
        // En renta, este valor es la renta MENSUAL.
        const valor = l.montoOferta ?? prop?.precio ?? 0;
        const tipoOperacion = prop?.tipoOperacion ?? "Venta";
        // Tarifa pactada en el CRM para esa propiedad, si existe.
        const tarifa = tarifaDePropiedad(prop);
        const puntaje = l.bant ? totalBant(l.bant) : null;
        return { lead: l, valor, tipoOperacion, tarifa, puntaje };
      })
      .filter((x) => x.valor > 0);
  }, [leads, propiedades]);

  const hayRentas = base.some((x) => x.tipoOperacion === "Renta");
  const conTarifaDelCrm = base.filter((x) => x.tarifa.delCrm).length;

  const sinValor = leads.length - base.length;

  const filas: Fila[] = useMemo(() => {
    const mapa = new Map<string, Fila>();

    const orden =
      corte === "etapa"
        ? ["Nuevo", "Contactado", "Visitado", "Negociacion", "Cierre"]
        : corte === "calificacion"
          ? ["Hot", "Warm", "Cold", "sin"]
          : [...BANT_PLAZO.map((o) => o.valor), "sin"];

    const etiquetaDe = (clave: string) => {
      if (clave === "sin") return "Sin calificar";
      if (corte === "etapa") return etiquetaEtapa(clave as never);
      if (corte === "calificacion") {
        return clave === "Hot"
          ? "Hot (80-100)"
          : clave === "Warm"
            ? "Warm (50-79)"
            : "Cold (0-49)";
      }
      return BANT_PLAZO.find((o) => o.valor === clave)?.etiqueta ?? clave;
    };

    orden.forEach((clave) =>
      mapa.set(clave, {
        clave,
        etiqueta: etiquetaDe(clave),
        prospectos: 0,
        bruto: 0,
        ponderado: 0,
        sinCalificar: 0,
      }),
    );

    base.forEach(({ lead, valor, tipoOperacion, tarifa, puntaje }) => {
      const clave =
        corte === "etapa"
          ? lead.etapa
          : puntaje === null
            ? "sin"
            : corte === "calificacion"
              ? clasificarLead(puntaje)
              : lead.bant!.plazo;

      const fila = mapa.get(clave);
      if (!fila) return;

      // Venta: % del precio. Renta: meses de renta. Una sola fórmula compartida.
      // Si el CRM trae la comisión pactada de la propiedad, esa manda sobre
      // los controles de arriba: es el acuerdo real, no un promedio.
      const comision = comisionBase({
        valor,
        tipoOperacion,
        pctVenta: tarifa.delCrm ? tarifa.pctVenta : pctComision,
        mesesRenta: tarifa.delCrm ? tarifa.mesesRenta : mesesRenta,
      });
      fila.prospectos += 1;
      fila.bruto += comision;
      // Sin calificación no hay ponderador: aporta 0. Es lo honesto.
      fila.ponderado += puntaje === null ? 0 : (comision * puntaje) / 100;
      if (puntaje === null) fila.sinCalificar += 1;
    });

    return [...mapa.values()].filter((f) => f.prospectos > 0);
  }, [base, corte, pctComision, mesesRenta]);

  // Totales
  const valorCartera = base.reduce((s, x) => s + x.valor, 0);
  const brutoTotal = filas.reduce((s, f) => s + f.bruto, 0);
  const ponderadoTotal = filas.reduce((s, f) => s + f.ponderado, 0);
  const calificados = base.filter((x) => x.puntaje !== null);
  const noCalificados = base.length - calificados.length;
  const puntajePromedio = calificados.length
    ? Math.round(calificados.reduce((s, x) => s + (x.puntaje ?? 0), 0) / calificados.length)
    : null;

  const maxBarra = Math.max(...filas.map((f) => f.bruto), 1);

  // --- Geometría del gráfico (SVG a mano: sin dependencias nuevas) ---
  const ANCHO = 720;
  const ALTO = 260;
  const MI = 56; // margen izquierdo
  const MD = 12;
  const MS = 16; // margen superior
  const MB = 46; // margen inferior
  const areaAncho = ANCHO - MI - MD;
  const areaAlto = ALTO - MS - MB;
  const paso = filas.length ? areaAncho / filas.length : areaAncho;
  const anchoBarra = Math.min(38, paso * 0.28);
  const y = (v: number) => MS + areaAlto - (v / maxBarra) * areaAlto;

  if (base.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <TrendingUp className="size-4 text-slate-500" /> Posibles cierres y comisiones
        </h2>
        <p className="mt-3 text-sm text-slate-500">
          Todavía no hay nada que proyectar. Cuando tus prospectos tengan una propiedad de
          interés asociada, aquí verás cuánto vale tu cartera.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <TrendingUp className="size-4 text-slate-500" /> Posibles cierres y comisiones
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Calculado con el precio real de las propiedades de tu cartera.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5">
            <span className="text-xs text-slate-500">Venta</span>
            <input
              type="number"
              min={0}
              max={30}
              step={0.25}
              value={pctComision}
              onChange={(e) => setPctComision(Number(e.target.value) || 0)}
              className="w-12 text-right text-sm font-bold text-slate-900 outline-none"
            />
            <span className="text-xs font-semibold text-slate-500">%</span>
          </label>
          {hayRentas && (
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5">
              <span className="text-xs text-slate-500">Renta</span>
              <input
                type="number"
                min={0}
                max={6}
                step={0.25}
                value={mesesRenta}
                onChange={(e) => setMesesRenta(Number(e.target.value) || 0)}
                className="w-12 text-right text-sm font-bold text-slate-900 outline-none"
              />
              <span className="text-xs font-semibold text-slate-500">
                {mesesRenta === 1 ? "mes" : "meses"}
              </span>
            </label>
          )}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {CORTES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCorte(c.key)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                  corte === c.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cifras */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Valor de tu cartera
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">{formatoMXN(valorCartera)}</p>
          <p className="text-[11px] text-slate-500">{base.length} prospectos con propiedad</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Comisión si todo cerrara
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">{formatoMXN(brutoTotal)}</p>
          <p className="text-[11px] text-slate-500">
            {conTarifaDelCrm > 0
              ? `${conTarifaDelCrm} con comisión pactada en tu CRM`
              : `Venta al ${pctComision}%${
                  hayRentas
                    ? ` · renta a ${mesesRenta} ${mesesRenta === 1 ? "mes" : "meses"}`
                    : ""
                }`}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/70">
            Ajustada por calificación
          </p>
          <p className="mt-1 text-lg font-bold text-emerald-700">{formatoMXN(ponderadoTotal)}</p>
          <p className="text-[11px] text-emerald-700/70">
            Pesada con el puntaje que tú capturaste
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Puntaje promedio
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {puntajePromedio !== null ? `${puntajePromedio}/100` : "—"}
          </p>
          <p className="text-[11px] text-slate-500">
            {calificados.length} calificados · {noCalificados} sin calificar
          </p>
        </div>
      </div>

      {/* Gráfica */}
      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Comisión bruta vs. ajustada por calificación
          </p>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-slate-300" /> Si todo cerrara
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-emerald-500" /> Ajustada
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          className="w-full"
          role="img"
          aria-label="Comisión potencial por categoría"
        >
          {/* Rejilla */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const yy = MS + areaAlto - f * areaAlto;
            return (
              <g key={f}>
                <line
                  x1={MI}
                  x2={ANCHO - MD}
                  y1={yy}
                  y2={yy}
                  stroke="#e2e8f0"
                  strokeDasharray={f === 0 ? "0" : "3 3"}
                />
                <text x={MI - 8} y={yy + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                  {compacto(maxBarra * f)}
                </text>
              </g>
            );
          })}

          {filas.map((f, i) => {
            const centro = MI + paso * i + paso / 2;
            const xBruto = centro - anchoBarra - 3;
            const xPond = centro + 3;
            const hBruto = Math.max(1, MS + areaAlto - y(f.bruto));
            const hPond = Math.max(f.ponderado > 0 ? 1 : 0, MS + areaAlto - y(f.ponderado));
            return (
              <g key={f.clave}>
                <rect
                  x={xBruto}
                  y={y(f.bruto)}
                  width={anchoBarra}
                  height={hBruto}
                  rx="3"
                  fill="#cbd5e1"
                />
                <rect
                  x={xPond}
                  y={y(f.ponderado)}
                  width={anchoBarra}
                  height={hPond}
                  rx="3"
                  fill="#10b981"
                />
                <title>
                  {`${f.etiqueta}\n${f.prospectos} prospecto(s)\nSi todo cerrara: ${formatoMXN(f.bruto)}\nAjustada: ${formatoMXN(f.ponderado)}${f.sinCalificar ? `\n${f.sinCalificar} sin calificar (aportan 0)` : ""}`}
                </title>
                <text
                  x={centro}
                  y={ALTO - MB + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#475569"
                >
                  {f.etiqueta.length > 16 ? `${f.etiqueta.slice(0, 15)}…` : f.etiqueta}
                </text>
                <text
                  x={centro}
                  y={ALTO - MB + 30}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#94a3b8"
                >
                  {f.prospectos} {f.prospectos === 1 ? "prospecto" : "prospectos"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tabla de respaldo: la gráfica se lee rápido, la tabla se audita. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 font-semibold">Grupo</th>
              <th className="py-2 text-right font-semibold">Prospectos</th>
              <th className="py-2 text-right font-semibold">Si todo cerrara</th>
              <th className="py-2 text-right font-semibold">Ajustada</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className="border-b border-slate-100">
                <td className="py-2 text-slate-800">
                  {f.etiqueta}
                  {f.sinCalificar > 0 && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {f.sinCalificar} sin calificar
                    </span>
                  )}
                </td>
                <td className="py-2 text-right text-slate-500">{f.prospectos}</td>
                <td className="py-2 text-right text-slate-600">{formatoMXN(f.bruto)}</td>
                <td className="py-2 text-right font-semibold text-slate-900">
                  {formatoMXN(f.ponderado)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Honestidad metodológica: sin esto, la gráfica miente por omisión. */}
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-slate-500" />
        <p>
          <span className="font-semibold text-slate-700">Esto no es un pronóstico.</span> La
          columna ajustada pesa cada operación con el puntaje de calificación que tú capturaste,
          no con una probabilidad de cierre — para calcular probabilidades reales hacen falta
          cierres históricos que la plataforma todavía no tiene. Los prospectos sin calificar
          aportan cero porque no hay información sobre ellos.
          {noCalificados > 0 && (
            <>
              {" "}
              Califica a los {noCalificados} pendientes y esta cifra se vuelve útil.
            </>
          )}
          {sinValor > 0 && (
            <>
              {" "}
              {sinValor} de tus prospectos no aparecen aquí porque no tienen una propiedad de
              interés asociada.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
