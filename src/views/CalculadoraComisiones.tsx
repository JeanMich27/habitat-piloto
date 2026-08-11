// Calculadora de Comisiones y Reparto — visible solo para asesores.
//
// Toma el precio de una propiedad ya cargada (o un monto libre), calcula la
// comisión total y la reparte entre los participantes que el propio asesor
// define: nombres, cantidad de integrantes, porcentajes o montos fijos.
// No hay reglas de reparto fijas en el sistema: todo es editable.
//
// El cálculo es de simulación: no se guarda en la propiedad ni en la nube.
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardCopy,
  Percent,
  Plus,
  Printer,
  Receipt,
  Trash2,
  Wand2,
} from "lucide-react";
import type { Propiedad, TipoOperacion, Usuario } from "../types";
import { formatoMXN } from "../types";
import {
  MESES_RENTA_DEFAULT,
  PCT_VENTA_DEFAULT,
  comisionBase,
  explicacionComision,
  tarifaDePropiedad,
} from "../lib/comisiones";

const IVA = 0.16;

const COLORES = [
  "#2563eb",
  "#10b981",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#0ea5e9",
  "#ec4899",
  "#14b8a6",
];

// "tarifa" = % del precio en venta, o meses de renta en renta.
type ModoComision = "tarifa" | "monto";
type ModoIva = "sin" | "mas" | "incluido";
type ModoParticipante = "pct" | "monto";

interface Participante {
  id: string;
  nombre: string;
  nota: string;
  modo: ModoParticipante;
  valor: number;
}

interface Plantilla {
  etiqueta: string;
  participantes: Omit<Participante, "id">[];
}

// Puntos de partida rápidos. El asesor puede borrarlos o reescribirlos todos.
const PLANTILLAS: Plantilla[] = [
  {
    etiqueta: "30% Captador / 30% Vendedor / 40% Agencia",
    participantes: [
      { nombre: "Asesor Captador", nota: "Capta la propiedad", modo: "pct", valor: 30 },
      { nombre: "Asesor Vendedor", nota: "Trae al comprador/inquilino", modo: "pct", valor: 30 },
      { nombre: "Agencia Inmobiliaria / Broker", nota: "Oficina, mkt y legal", modo: "pct", valor: 40 },
    ],
  },
  {
    etiqueta: "50% Captación / 50% Venta",
    participantes: [
      { nombre: "Asesor Captador", nota: "Capta la propiedad", modo: "pct", valor: 50 },
      { nombre: "Asesor Vendedor", nota: "Cierra la operación", modo: "pct", valor: 50 },
    ],
  },
  {
    etiqueta: "50% Compartida con Agencia Externa",
    participantes: [
      { nombre: "Nuestra Agencia", nota: "Lado captación", modo: "pct", valor: 50 },
      { nombre: "Agencia Externa", nota: "Lado comprador", modo: "pct", valor: 50 },
    ],
  },
  {
    etiqueta: "100% Asesor Único",
    participantes: [
      { nombre: "Asesor", nota: "Captó y cerró la operación", modo: "pct", valor: 100 },
    ],
  },
];

const nuevoId = () => `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const conId = (lista: Omit<Participante, "id">[]): Participante[] =>
  lista.map((p) => ({ ...p, id: nuevoId() }));

const pct = (v: number) =>
  `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(v)}%`;

interface Props {
  usuario: Usuario;
  propiedades: Propiedad[];
  /** Precarga una propiedad al entrar desde el Detalle de Propiedad. */
  propiedadInicialId?: string | null;
  onVolver?: () => void;
}

export default function CalculadoraComisiones({
  usuario,
  propiedades,
  propiedadInicialId,
  onVolver,
}: Props) {
  // Un asesor de equipo sin permiso especial solo ve su propio inventario.
  const disponibles = useMemo(() => {
    const puedeVerTodas =
      usuario.rol === "broker" ||
      usuario.rol === "asesor_independiente" ||
      usuario.puedeVerOtrasPropiedades;
    return puedeVerTodas ? propiedades : propiedades.filter((p) => p.asesorId === usuario.id);
  }, [propiedades, usuario]);

  const inicial = disponibles.find((p) => p.id === propiedadInicialId);

  const [propiedadId, setPropiedadId] = useState<string>(inicial?.id ?? "");
  const [precioTexto, setPrecioTexto] = useState<string>(
    inicial ? String(inicial.precio) : "",
  );

  // La operación decide la fórmula: venta usa %, renta usa meses de renta.
  const [tipoOperacion, setTipoOperacion] = useState<TipoOperacion>(
    inicial?.tipoOperacion ?? "Venta",
  );
  const [modoComision, setModoComision] = useState<ModoComision>("tarifa");
  const [pctComision, setPctComision] = useState<number>(
    inicial ? tarifaDePropiedad(inicial).pctVenta : PCT_VENTA_DEFAULT,
  );
  const [mesesRenta, setMesesRenta] = useState<number>(
    inicial ? tarifaDePropiedad(inicial).mesesRenta : MESES_RENTA_DEFAULT,
  );
  const [montoComisionTexto, setMontoComisionTexto] = useState<string>("");
  const [modoIva, setModoIva] = useState<ModoIva>("sin");
  // ¿La tarifa vino del CRM o es el default de la app? Se le dice al usuario.
  const [tarifaDelCrm, setTarifaDelCrm] = useState(
    inicial ? tarifaDePropiedad(inicial).delCrm : false,
  );

  const [participantes, setParticipantes] = useState<Participante[]>(() =>
    conId(PLANTILLAS[0].participantes),
  );
  const [copiado, setCopiado] = useState(false);

  const propiedad = disponibles.find((p) => p.id === propiedadId);
  const precio = Number(precioTexto.replace(/[^\d.]/g, "")) || 0;

  const esRenta = tipoOperacion === "Renta";

  // --- Comisión ---
  const comisionIngresada =
    modoComision === "tarifa"
      ? comisionBase({ valor: precio, tipoOperacion, pctVenta: pctComision, mesesRenta })
      : Number(montoComisionTexto.replace(/[^\d.]/g, "")) || 0;

  // Base a repartir = comisión sin IVA. El IVA nunca se reparte: se traslada.
  const base =
    modoIva === "incluido" ? comisionIngresada / (1 + IVA) : comisionIngresada;
  const montoIva = modoIva === "sin" ? 0 : base * IVA;
  const totalConIva = base + montoIva;

  // En venta esto es "% del precio"; en renta es "cuántos meses de renta".
  const pctSobrePrecio = precio > 0 ? (base / precio) * 100 : 0;
  const mesesEquivalentes = precio > 0 ? base / precio : 0;

  // --- Reparto ---
  const filas = participantes.map((p, i) => {
    const monto = p.modo === "pct" ? (base * p.valor) / 100 : p.valor;
    const pctComisionReal = base > 0 ? (monto / base) * 100 : 0;
    return {
      ...p,
      color: COLORES[i % COLORES.length],
      monto,
      pctComisionReal,
      pctInmueble: precio > 0 ? (monto / precio) * 100 : 0,
    };
  });

  const totalRepartido = filas.reduce((s, f) => s + f.monto, 0);
  const pctRepartido = base > 0 ? (totalRepartido / base) * 100 : 0;
  const diferencia = base - totalRepartido;
  const exacto = Math.abs(diferencia) < 0.5;

  // --- Acciones sobre participantes ---
  const actualizar = (id: string, cambios: Partial<Participante>) =>
    setParticipantes((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)));

  const eliminar = (id: string) =>
    setParticipantes((prev) => prev.filter((p) => p.id !== id));

  const agregar = () =>
    setParticipantes((prev) => [
      ...prev,
      { id: nuevoId(), nombre: `Participante ${prev.length + 1}`, nota: "", modo: "pct", valor: 0 },
    ]);

  // Reparte lo que falta (o quita lo que sobra) en el último participante en %.
  const ajustarAl100 = () => {
    const enPct = participantes.filter((p) => p.modo === "pct");
    if (enPct.length === 0 || base <= 0) return;
    const fijos = participantes
      .filter((p) => p.modo === "monto")
      .reduce((s, p) => s + p.valor, 0);
    const pctDisponible = ((base - fijos) / base) * 100;
    const usados = enPct.slice(0, -1).reduce((s, p) => s + p.valor, 0);
    const ultimo = enPct[enPct.length - 1];
    const resto = Math.round((pctDisponible - usados) * 100) / 100;
    actualizar(ultimo.id, { valor: Math.max(0, resto) });
  };

  const aplicarPlantilla = (t: Plantilla) => setParticipantes(conId(t.participantes));

  const seleccionarPropiedad = (id: string) => {
    setPropiedadId(id);
    const p = disponibles.find((x) => x.id === id);
    if (p) {
      setPrecioTexto(String(p.precio));
      setTipoOperacion(p.tipoOperacion);
      // Si el CRM trae la comisión pactada de esta propiedad, esa manda:
      // es el acuerdo real con el propietario, no un default.
      const t = tarifaDePropiedad(p);
      setPctComision(t.pctVenta);
      setMesesRenta(t.mesesRenta);
      setTarifaDelCrm(t.delCrm);
    } else {
      setTarifaDelCrm(false);
    }
  };

  // --- Resumen en texto (para WhatsApp / correo) ---
  const resumenTexto = () => {
    const lineas: string[] = [];
    lineas.push("REPARTO DE COMISIÓN");
    if (propiedad) lineas.push(`Propiedad: ${propiedad.titulo} — ${propiedad.ubicacion}`);
    lineas.push(
      esRenta
        ? `Renta mensual: ${formatoMXN(precio)}`
        : `Precio de venta: ${formatoMXN(precio)}`,
    );
    lineas.push(
      `Comisión: ${formatoMXN(base)}${
        precio > 0
          ? ` (${explicacionComision({
              valor: precio,
              tipoOperacion,
              pctVenta: pctSobrePrecio,
              mesesRenta: mesesEquivalentes,
            })})`
          : ""
      }`,
    );
    if (modoIva !== "sin") {
      lineas.push(`IVA (16%): ${formatoMXN(montoIva)}`);
      lineas.push(`Total con IVA: ${formatoMXN(totalConIva)}`);
    }
    lineas.push("");
    filas.forEach((f) => {
      lineas.push(`• ${f.nombre}: ${formatoMXN(f.monto)} (${pct(f.pctComisionReal)} de la comisión)`);
    });
    lineas.push("");
    lineas.push(`TOTAL REPARTIDO: ${formatoMXN(totalRepartido)}`);
    if (!exacto) {
      lineas.push(
        diferencia > 0
          ? `SIN ASIGNAR: ${formatoMXN(diferencia)}`
          : `EXCEDIDO: ${formatoMXN(Math.abs(diferencia))}`,
      );
    }
    return lineas.join("\n");
  };

  const copiarResumen = async () => {
    try {
      await navigator.clipboard.writeText(resumenTexto());
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const inputBase =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500";

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      {/* ---------- Encabezado ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3 print:block">
        <div className="min-w-0">
          {onVolver && (
            <button
              onClick={onVolver}
              className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 print:hidden"
            >
              <ArrowLeft className="size-4" /> Volver
            </button>
          )}
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Calculadora de Comisiones y Reparto
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Calcula y distribuye la comisión libremente: elige una propiedad cargada o captura
            valores personalizados.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            onClick={copiarResumen}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ClipboardCopy className="size-3.5" />
            {copiado ? "¡Copiado!" : "Copiar resumen"}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Printer className="size-3.5" /> Imprimir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* ================= Columna izquierda ================= */}
        <div className="space-y-5 lg:col-span-5 xl:col-span-4">
          {/* --- 1. Propiedad --- */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Building2 className="size-4 text-slate-400" />
                1. Seleccionar propiedad cargada
              </h2>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                {disponibles.length} disponibles
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Elegir de tu catálogo
                </label>
                <select
                  value={propiedadId}
                  onChange={(e) => seleccionarPropiedad(e.target.value)}
                  className={inputBase}
                >
                  <option value="">Sin propiedad (monto libre)</option>
                  {disponibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titulo} — {formatoMXN(p.precio)} ({p.tipoOperacion})
                    </option>
                  ))}
                </select>
              </div>

              {propiedad && (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{propiedad.titulo}</p>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {propiedad.estatus}
                    </span>
                  </div>
                  <p className="mt-1">
                    {propiedad.ubicacion}, {propiedad.municipio}
                  </p>
                  <p>Propietario: {propiedad.propietario.nombre}</p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  {esRenta ? "Renta mensual (MXN)" : "Precio de venta (MXN)"}
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-slate-500">
                  <span className="text-sm text-slate-400">$</span>
                  <input
                    inputMode="decimal"
                    value={precioTexto}
                    onChange={(e) => setPrecioTexto(e.target.value)}
                    placeholder="0"
                    className="w-full py-2 text-sm font-semibold text-slate-900 outline-none"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Valor considerado: <span className="font-semibold">{formatoMXN(precio)}</span>
                </p>
              </div>
            </div>
          </section>

          {/* --- 2. Comisión global --- */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Receipt className="size-4 text-slate-400" />
              2. Definir comisión global
            </h2>

            <div className="mt-4 space-y-4">
              {/* Tipo de operación: define la fórmula, no es cosmético. */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Tipo de operación
                </label>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  {(["Venta", "Renta"] as TipoOperacion[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTipoOperacion(t)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                        tipoOperacion === t
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    { key: "tarifa", label: esRenta ? "Meses de renta" : "Porcentaje (%)" },
                    { key: "monto", label: "Monto fijo ($)" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.key}
                    onClick={() => setModoComision(o.key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      modoComision === o.key
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {modoComision === "tarifa" && esRenta ? (
                /* ---- Renta: la comisión se cobra en meses de renta ---- */
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-600">
                      Meses de renta que cobras
                    </label>
                    <span className="text-xs font-bold text-emerald-600">
                      {mesesRenta} {mesesRenta === 1 ? "mes" : "meses"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.25}
                      value={mesesRenta}
                      onChange={(e) => setMesesRenta(Number(e.target.value))}
                      className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      value={mesesRenta}
                      onChange={(e) => setMesesRenta(Number(e.target.value) || 0)}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    En renta la comisión se cobra en meses, no como porcentaje del monto mensual.
                    Lo habitual es 1 mes; ajústalo si tu acuerdo es distinto.
                  </p>
                </div>
              ) : modoComision === "tarifa" ? (
                /* ---- Venta: porcentaje sobre el precio ---- */
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-600">
                      Porcentaje de comisión total
                    </label>
                    <span className="text-xs font-bold text-emerald-600">{pct(pctComision)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={15}
                      step={0.25}
                      value={pctComision}
                      onChange={(e) => setPctComision(Number(e.target.value))}
                      className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      value={pctComision}
                      onChange={(e) => setPctComision(Number(e.target.value) || 0)}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Monto total de comisión (MXN)
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-slate-500">
                    <span className="text-sm text-slate-400">$</span>
                    <input
                      inputMode="decimal"
                      value={montoComisionTexto}
                      onChange={(e) => setMontoComisionTexto(e.target.value)}
                      placeholder="0"
                      className="w-full py-2 text-sm font-semibold text-slate-900 outline-none"
                    />
                  </div>
                </div>
              )}

              {tarifaDelCrm && (
                <p className="rounded-lg bg-emerald-50 p-2.5 text-[11px] font-medium text-emerald-800">
                  Esta tarifa viene de la comisión pactada en tu CRM para esta propiedad.
                  Puedes cambiarla, pero por defecto usamos el acuerdo real.
                </p>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Tratamiento del IVA (16%)
                </label>
                <select
                  value={modoIva}
                  onChange={(e) => setModoIva(e.target.value as ModoIva)}
                  className={inputBase}
                >
                  <option value="sin">Sin desglose de IVA (comisión neta directa)</option>
                  <option value="mas">La comisión es + IVA (se suma al cobro)</option>
                  <option value="incluido">La comisión ya incluye IVA (se desglosa)</option>
                </select>
              </div>

              <div className="rounded-xl bg-slate-900 p-4 text-white">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">Comisión base a repartir:</span>
                  <span className="text-lg font-bold">{formatoMXN(base)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-300">
                  <span>Equivale a:</span>
                  <span className="font-semibold text-emerald-400">
                    {esRenta
                      ? `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(
                          mesesEquivalentes,
                        )} ${mesesEquivalentes === 1 ? "mes" : "meses"} de renta`
                      : `${pct(pctSobrePrecio)} del precio`}
                  </span>
                </div>
                {modoIva !== "sin" && (
                  <div className="mt-3 space-y-1 border-t border-white/15 pt-3 text-xs text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>IVA (16%):</span>
                      <span className="font-semibold">{formatoMXN(montoIva)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Total facturado:</span>
                      <span className="font-semibold text-white">{formatoMXN(totalConIva)}</span>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                El IVA no se reparte: se traslada al cliente y se entera al SAT. El reparto siempre
                opera sobre la comisión base.
              </p>
            </div>
          </section>
        </div>

        {/* ================= Columna derecha ================= */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 xl:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                3. Distribución / reparto entre participantes
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Modifica nombres, porcentajes o montos sin restricciones. Agrega los integrantes que
                necesites.
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              <button
                onClick={ajustarAl100}
                title="Asigna lo que falta al último participante en porcentaje"
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Wand2 className="size-3.5" /> Ajustar al 100%
              </button>
              <button
                onClick={agregar}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Plus className="size-3.5" /> Agregar integrante
              </button>
            </div>
          </div>

          {/* Plantillas rápidas */}
          <div className="mt-4 print:hidden">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Plantillas rápidas (opcionales)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PLANTILLAS.map((t) => (
                <button
                  key={t.etiqueta}
                  onClick={() => aplicarPlantilla(t)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
                >
                  {t.etiqueta}
                </button>
              ))}
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Barra de progreso del reparto</span>
              <span className={`font-bold ${exacto ? "text-emerald-600" : "text-amber-600"}`}>
                {pct(pctRepartido)} / 100%
              </span>
            </div>
            <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {filas.map((f) => (
                <div
                  key={f.id}
                  style={{
                    width: `${Math.max(0, Math.min(100, f.pctComisionReal))}%`,
                    backgroundColor: f.color,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Validación */}
          <div
            className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs font-semibold ${
              exacto
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            <CheckCircle2 className="mt-px size-4 shrink-0" />
            {base <= 0 ? (
              <span>Captura un precio o un monto de comisión para calcular el reparto.</span>
            ) : exacto ? (
              <span>Reparto exacto al 100%: todos los montos coinciden.</span>
            ) : diferencia > 0 ? (
              <span>
                Faltan {formatoMXN(diferencia)} por asignar ({pct(100 - pctRepartido)} de la
                comisión).
              </span>
            ) : (
              <span>
                El reparto excede la comisión en {formatoMXN(Math.abs(diferencia))} (
                {pct(pctRepartido - 100)} de más).
              </span>
            )}
          </div>

          {/* Participantes */}
          <div className="mt-4 space-y-3">
            {filas.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                No hay participantes. Agrega el primero o usa una plantilla.
              </p>
            )}

            {filas.map((f) => (
              <div key={f.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <span
                      className="mt-2 size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: f.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        value={f.nombre}
                        onChange={(e) => actualizar(f.id, { nombre: e.target.value })}
                        placeholder="Nombre del participante"
                        className="w-full rounded-md border border-transparent px-1 py-0.5 text-sm font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-slate-400"
                      />
                      <input
                        value={f.nota}
                        onChange={(e) => actualizar(f.id, { nota: e.target.value })}
                        placeholder="Rol o concepto (opcional)"
                        className="mt-0.5 w-full rounded-md border border-transparent px-1 py-0.5 text-xs text-slate-500 outline-none hover:border-slate-200 focus:border-slate-400"
                      />
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <select
                      value={f.modo}
                      onChange={(e) =>
                        actualizar(f.id, { modo: e.target.value as ModoParticipante })
                      }
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-500"
                    >
                      <option value="pct">% de comisión</option>
                      <option value="monto">Monto fijo ($)</option>
                    </select>
                    <div className="flex items-center rounded-lg border border-slate-300 px-2 focus-within:border-slate-500">
                      {f.modo === "monto" && <span className="text-xs text-slate-400">$</span>}
                      <input
                        type="number"
                        min={0}
                        step={f.modo === "pct" ? 0.5 : 100}
                        value={f.valor}
                        onChange={(e) => actualizar(f.id, { valor: Number(e.target.value) || 0 })}
                        className="w-24 py-1.5 text-right text-sm font-semibold text-slate-900 outline-none"
                      />
                      {f.modo === "pct" && <Percent className="size-3 text-slate-400" />}
                    </div>
                    <button
                      onClick={() => eliminar(f.id)}
                      title="Eliminar participante"
                      className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 print:hidden"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-500">Monto asignado</span>
                  <span className="text-sm font-bold text-slate-900">
                    {formatoMXN(f.monto)}{" "}
                    <span className="text-[11px] font-medium text-slate-400">
                      ({pct(f.pctComisionReal)} de la comisión)
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Resumen final */}
          <div className="mt-6 border-t border-slate-200 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Resumen final de pagos
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-2 font-semibold">Participante / concepto</th>
                    <th className="py-2 text-right font-semibold">% comisión</th>
                    <th className="py-2 text-right font-semibold">
                      {esRenta ? "Meses de renta" : "% inmueble"}
                    </th>
                    <th className="py-2 text-right font-semibold">Monto a recibir</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id} className="border-b border-slate-100">
                      <td className="py-2.5">
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: f.color }}
                          />
                          <span className="truncate text-slate-800">{f.nombre}</span>
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-slate-500">{pct(f.pctComisionReal)}</td>
                      <td className="py-2.5 text-right text-slate-500">
                        {esRenta
                          ? new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(
                              precio > 0 ? f.monto / precio : 0,
                            )
                          : pct(f.pctInmueble)}
                      </td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">
                        {formatoMXN(f.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white">
                    <td className="rounded-l-lg px-3 py-3 font-bold">Total repartido</td>
                    <td className="py-3 text-right font-bold">{pct(pctRepartido)}</td>
                    <td className="py-3 text-right font-bold">
                      {esRenta
                        ? new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(
                            precio > 0 ? totalRepartido / precio : 0,
                          )
                        : pct(precio > 0 ? (totalRepartido / precio) * 100 : 0)}
                    </td>
                    <td className="rounded-r-lg px-3 py-3 text-right font-bold text-emerald-400">
                      {formatoMXN(totalRepartido)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {!exacto && base > 0 && (
              <p className="mt-2 text-xs font-semibold text-amber-600">
                {diferencia > 0
                  ? `Sin asignar: ${formatoMXN(diferencia)}`
                  : `Excedido: ${formatoMXN(Math.abs(diferencia))}`}
              </p>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
              Cálculo de simulación: no se guarda en la propiedad ni sustituye el acuerdo comercial
              firmado. Los montos son antes de retenciones e impuestos de cada participante.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
