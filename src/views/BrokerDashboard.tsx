// Centro de control del broker.
//
// Esta pantalla observa la operación; no administra campañas ni automatizaciones
// comerciales. Cada cifra tiene una definición auditable y abre los registros
// que la componen. "Cierre" es una etapa; una operación sólo cuenta como ganada
// cuando estado = Ganado y existe cerradoEn.
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  HandCoins,
  Percent,
  SearchCheck,
  Users,
} from "lucide-react";
import GlassModal from "../components/GlassModal";
import KpiCard from "../components/KpiCard";
import { ETAPAS_LEAD } from "../data/etapasLead";
import {
  citasProximas,
  demandaDePropiedades,
  documentacionCompleta,
  mediana,
  operacionesGanadasEnPeriodo,
  ocurrioEnUltimosDias,
  tasaConversionDeCohorte,
} from "../lib/brokerMetrics";
import { finanzasDeLead } from "../lib/comisiones";
import { diasDesde, formatFecha, formatMin, minutosRespuesta } from "../lib/metrics";
import type {
  CitaAgenda,
  Lead,
  LeadStage,
  Operacion,
  Propiedad,
  PropertyStatus,
  Usuario,
} from "../types";
import { ESTADOS_PROPIEDAD, formatoMXN } from "../types";

type Periodo = "hoy" | "semana" | "mes";
type Detalle =
  | "alertas"
  | "inventario"
  | "demanda"
  | "equipo"
  | "citas"
  | "operaciones"
  | null;
type FiltroInventario =
  | PropertyStatus
  | "exclusiva"
  | "sin-exclusiva"
  | "documentos"
  | null;

const PERIODOS: { key: Periodo; label: string; dias: number; ventana: string }[] = [
  { key: "hoy", label: "Hoy", dias: 1, ventana: "24 horas" },
  { key: "semana", label: "Semana", dias: 7, ventana: "7 días" },
  { key: "mes", label: "Mes", dias: 31, ventana: "31 días" },
];

interface Props {
  broker: Usuario;
  usuarios: Usuario[];
  propiedades: Propiedad[];
  leads: Lead[];
  citas: CitaAgenda[];
  operaciones?: Operacion[];
  onVerAsesor: (asesorId: string) => void;
  onVerPropiedad: (propiedadId: string) => void;
  onVerCliente: (leadId: string) => void;
  /** Abre Clientes filtrado por etapa (al tocar una barra del pipeline). */
  onVerClientes: (etapa?: LeadStage) => void;
}

const nombreAsesorDe = (usuarios: Usuario[], id: string) =>
  usuarios.find((usuario) => usuario.id === id)?.nombre ?? "Sin asignar";

const docsAprobados = (propiedad: Propiedad) =>
  propiedad.documentos.filter((documento) => documento.aprobado).length;

export default function BrokerDashboard({
  broker,
  usuarios,
  propiedades,
  leads,
  citas,
  operaciones = [],
  onVerAsesor,
  onVerPropiedad,
  onVerCliente,
  onVerClientes,
}: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [detalle, setDetalle] = useState<Detalle>(null);
  const [filtroInventario, setFiltroInventario] = useState<FiltroInventario>(null);
  const ahora = useMemo(() => Date.now(), []);
  const periodoActual = PERIODOS.find((item) => item.key === periodo)!;
  const dias = periodoActual.dias;

  // Cohorte = leads que ingresaron en la ventana elegida. Incluye descartados:
  // quitarlos inflaría artificialmente la conversión.
  const leadsPeriodo = useMemo(
    () => leads.filter((lead) => ocurrioEnUltimosDias(lead.creado, ahora, dias)),
    [leads, ahora, dias],
  );
  const ganadasPeriodo = useMemo(
    () => operacionesGanadasEnPeriodo(leads, ahora, dias),
    [leads, ahora, dias],
  );
  const proximasCitas = useMemo(
    () => citasProximas(citas, ahora, dias),
    [citas, ahora, dias],
  );

  const propiedadesPublicadas = propiedades.filter(
    (propiedad) => propiedad.estatus === "Publicada",
  );
  const propiedadesConExclusiva = propiedades.filter(
    (propiedad) => propiedad.exclusiva === true,
  );
  const propiedadesSinExclusiva = propiedades.filter(
    (propiedad) => propiedad.exclusiva !== true,
  );
  const propiedadesConDocumentosPendientes = propiedades.filter(
    (propiedad) =>
      propiedad.estatus !== "Vendida o Rentada" && !documentacionCompleta(propiedad),
  );

  const tasaConversion = tasaConversionDeCohorte(leadsPeriodo);
  const tiemposRespuesta = leadsPeriodo
    .map(minutosRespuesta)
    .filter((minutos): minutos is number => minutos !== null && minutos >= 0);
  const tiempoRespuestaMediano = mediana(tiemposRespuesta);
  const ingresoConfirmado = ganadasPeriodo.reduce((total, lead) => {
    const operacion = operaciones.find((item) => item.leadId === lead.id && item.estadoValidacion === "validada");
    const propiedad = propiedades.find((item) => item.id === (operacion?.propiedadId ?? lead.interesPropiedadId));
    return total + finanzasDeLead(lead, propiedad, operacion).ingresoConfirmado;
  }, 0);

  // El pipeline describe dónde terminó hoy la cohorte elegida. Ganados y
  // descartados permanecen: son parte real del embudo y de su denominador.
  const pipeline = ETAPAS_LEAD.map((etapa) => ({
    ...etapa,
    cantidad: leadsPeriodo.filter((lead) => lead.etapa === etapa.etapa).length,
  }));
  const maxPipeline = Math.max(1, ...pipeline.map((etapa) => etapa.cantidad));

  const asesores = usuarios.filter(
    (usuario) =>
      usuario.rol === "asesor_equipo" || usuario.rol === "asesor_independiente",
  );
  const desempeno = asesores
    .map((asesor) => {
      const suyos = leadsPeriodo.filter((lead) => lead.asesorId === asesor.id);
      const ganadas = ganadasPeriodo.filter((lead) => lead.asesorId === asesor.id).length;
      const respuestas = suyos
        .map(minutosRespuesta)
        .filter((minutos): minutos is number => minutos !== null && minutos >= 0);
      return {
        asesor,
        leads: suyos.length,
        conversion: tasaConversionDeCohorte(suyos),
        ganadas,
        citas: proximasCitas.filter((cita) => cita.asesorId === asesor.id).length,
        respuesta: mediana(respuestas),
      };
    })
    .sort(
      (a, b) =>
        b.ganadas - a.ganadas || b.conversion - a.conversion || b.leads - a.leads,
    );

  const demanda = demandaDePropiedades(propiedadesPublicadas, leads, citas).sort(
    (a, b) => b.senales - a.senales || b.ofertas - a.ofertas,
  );
  const propiedadesSinSenales = demanda.filter((item) => item.senales === 0);

  // Alertas operativas y de calidad de datos. Una propiedad sin ultimaActividad
  // usa publicadaEl como inicio para no desaparecer silenciosamente del control.
  const leadsSinContactar = leads.filter(
    (lead) =>
      lead.estado !== "Ganado" &&
      lead.estado !== "Descartado" &&
      !lead.primerContactoEn &&
      lead.etapa === "Nuevo" &&
      diasDesde(lead.creado, ahora) > 1,
  );
  const propiedadesSinActividad = propiedadesPublicadas.filter((propiedad) => {
    const referencia = propiedad.ultimaActividad ?? propiedad.publicadaEl;
    return referencia ? diasDesde(referencia, ahora) > 7 : true;
  });
  const operacionesSinFecha = leads.filter(
    (lead) => lead.estado === "Ganado" && !lead.cerradoEn,
  );
  const totalAlertas =
    leadsSinContactar.length +
    propiedadesSinActividad.length +
    propiedadesConDocumentosPendientes.length +
    operacionesSinFecha.length;

  const conteoEstado = (estado: PropertyStatus) =>
    propiedades.filter((propiedad) => propiedad.estatus === estado).length;

  const abrirInventario = (filtro: FiltroInventario) => {
    setFiltroInventario(filtro);
    setDetalle("inventario");
  };

  const inventarioFiltrado = propiedades.filter((propiedad) => {
    if (!filtroInventario) return true;
    if (filtroInventario === "exclusiva") return propiedad.exclusiva === true;
    if (filtroInventario === "sin-exclusiva") return propiedad.exclusiva !== true;
    if (filtroInventario === "documentos") return !documentacionCompleta(propiedad);
    return propiedad.estatus === filtroInventario;
  });

  const irAPropiedad = (id: string) => {
    setDetalle(null);
    onVerPropiedad(id);
  };
  const irACliente = (id: string) => {
    setDetalle(null);
    onVerCliente(id);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
      <section className="glass relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-100/70 via-violet-100/40 to-amber-100/50" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Centro de control de {broker.nombre.split(" ")[0]}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Inventario, demanda, equipo y operaciones de tu oficina.
            </p>
            <button
              onClick={() => totalAlertas > 0 && setDetalle("alertas")}
              className={`mt-4 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold shadow-sm backdrop-blur transition ${
                totalAlertas > 0
                  ? "bg-amber-50/90 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                  : "bg-emerald-50/90 text-emerald-700 ring-1 ring-emerald-200"
              }`}
            >
              {totalAlertas > 0 ? (
                <>
                  <AlertTriangle className="size-4" />
                  {totalAlertas} pendiente{totalAlertas === 1 ? "" : "s"} que requieren tu
                  atención — ver detalle
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" /> Todo al día: sin alertas activas
                </>
              )}
            </button>
          </div>

          <div className="flex gap-1 rounded-full bg-white/60 p-1 shadow-inner backdrop-blur">
            {PERIODOS.map((item) => (
              <button
                key={item.key}
                onClick={() => setPeriodo(item.key)}
                aria-pressed={periodo === item.key}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  periodo === item.key
                    ? "bg-violet-600 text-white shadow-md shadow-violet-300/60"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <KpiCard
          label="Propiedades publicadas"
          value={String(propiedadesPublicadas.length)}
          icon={Building2}
          accent="text-sky-600"
          circulo="bg-sky-100"
          onClick={() => abrirInventario("Publicada")}
        />
        <KpiCard
          label="Conversión de la cohorte"
          value={`${tasaConversion}%`}
          icon={Percent}
          accent="text-violet-600"
          circulo="bg-violet-100"
        />
        <KpiCard
          label="Respuesta mediana"
          value={formatMin(tiempoRespuestaMediano)}
          icon={Clock}
          accent="text-amber-600"
          circulo="bg-amber-100"
          onClick={() => setDetalle("equipo")}
        />
        <KpiCard
          label={`Citas próximas · ${periodoActual.ventana}`}
          value={String(proximasCitas.length)}
          icon={CalendarDays}
          accent="text-indigo-600"
          circulo="bg-indigo-100"
          onClick={() => setDetalle("citas")}
        />
        <KpiCard
          label="Operaciones ganadas"
          value={String(ganadasPeriodo.length)}
          icon={BadgeCheck}
          accent="text-emerald-700"
          circulo="bg-emerald-100"
          onClick={() => setDetalle("operaciones")}
        />
        <KpiCard
          label="Ingreso confirmado"
          value={formatoMXN(Math.round(ingresoConfirmado))}
          icon={HandCoins}
          accent="text-teal-700"
          circulo="bg-teal-100"
          onClick={() => setDetalle("operaciones")}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <section className="glass p-5 lg:col-span-2" aria-labelledby="pipeline-broker">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="pipeline-broker" className="text-sm font-bold text-slate-900">
                Embudo de leads ingresados
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Etapa actual de la cohorte de las últimas {periodoActual.ventana}
              </p>
            </div>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
              {leadsPeriodo.length} lead{leadsPeriodo.length === 1 ? "" : "s"} · toca una etapa
            </span>
          </div>
          <div className="flex items-end gap-3">
            {pipeline.map((etapa) => (
              <button
                key={etapa.etapa}
                onClick={() => etapa.cantidad > 0 && onVerClientes(etapa.etapa)}
                disabled={etapa.cantidad === 0}
                aria-label={`Ver los ${etapa.cantidad} leads en etapa ${etapa.titulo}`}
                className={`group flex flex-1 flex-col items-center gap-2 rounded-2xl p-1.5 transition ${
                  etapa.cantidad === 0 ? "cursor-default opacity-50" : "hover:bg-white/70"
                }`}
              >
                <span className="text-sm font-bold text-slate-800">{etapa.cantidad}</span>
                <span className="flex h-24 w-full items-end overflow-hidden rounded-xl bg-white/60 shadow-inner">
                  <span
                    className={`block w-full rounded-xl ${etapa.acento}`}
                    style={{ height: `${(etapa.cantidad / maxPipeline) * 100}%` }}
                  />
                </span>
                <span className="text-center text-[11px] font-medium text-slate-500">
                  {etapa.titulo}
                </span>
              </button>
            ))}
          </div>
        </section>

        <button
          onClick={() => setDetalle("equipo")}
          className="neu flex flex-col justify-between gap-4 p-5 text-left transition-transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <span className="flex size-12 items-center justify-center rounded-full bg-violet-100">
              <Users className="size-6 text-violet-600" />
            </span>
            <div className="flex -space-x-2">
              {desempeno.slice(0, 4).map((item) => (
                <span
                  key={item.asesor.id}
                  className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-[10px] font-bold text-white ring-2 ring-white"
                >
                  {item.asesor.iniciales}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Desempeño del equipo</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Conversión, respuesta, próximas citas y operaciones ganadas por asesor
            </p>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <section className="glass p-5" aria-labelledby="inventario-broker">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="inventario-broker" className="text-sm font-bold text-slate-900">
                Inventario actual
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Estado comercial y condiciones de publicación
              </p>
            </div>
            <Building2 className="size-5 text-sky-600" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ESTADOS_PROPIEDAD.map((estado) => (
              <button
                key={estado}
                onClick={() => abrirInventario(estado)}
                className="rounded-xl bg-white/70 px-3 py-2.5 text-left shadow-sm hover:bg-white"
              >
                <span className="block text-lg font-black text-slate-900">
                  {conteoEstado(estado)}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">{estado}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              onClick={() => abrirInventario("exclusiva")}
              className="rounded-xl bg-violet-50 px-3 py-2 text-left text-xs font-semibold text-violet-700"
            >
              {propiedadesConExclusiva.length} con exclusiva
            </button>
            <button
              onClick={() => abrirInventario("sin-exclusiva")}
              className="rounded-xl bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-600"
            >
              {propiedadesSinExclusiva.length} sin exclusiva
            </button>
            <button
              onClick={() => abrirInventario("documentos")}
              className="rounded-xl bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-700"
            >
              {propiedadesConDocumentosPendientes.length} con documentos pendientes
            </button>
          </div>
        </section>

        <section className="glass p-5" aria-labelledby="demanda-broker">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="demanda-broker" className="text-sm font-bold text-slate-900">
                Demanda por propiedad
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Leads, visitas realizadas y ofertas registradas
              </p>
            </div>
            <SearchCheck className="size-5 text-emerald-600" />
          </div>
          <div className="mt-4 space-y-2">
            {demanda.slice(0, 5).map((item) => (
              <button
                key={item.propiedad.id}
                onClick={() => onVerPropiedad(item.propiedad.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_2.5rem] items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-left hover:bg-white"
                aria-label={`Abrir ${item.propiedad.titulo}`}
              >
                <span className="truncate text-xs font-semibold text-slate-700">
                  {item.propiedad.titulo}
                </span>
                <span className="text-center text-[11px] text-slate-500" title="Leads">
                  L {item.leads}
                </span>
                <span
                  className="text-center text-[11px] text-slate-500"
                  title="Visitas realizadas"
                >
                  V {item.visitas}
                </span>
                <span className="text-center text-[11px] text-slate-500" title="Ofertas">
                  O {item.ofertas}
                </span>
              </button>
            ))}
            {demanda.length === 0 && (
              <p className="py-5 text-center text-xs text-slate-500">
                No hay propiedades publicadas.
              </p>
            )}
          </div>
          <button
            onClick={() => setDetalle("demanda")}
            className="mt-3 text-xs font-bold text-violet-600 hover:text-violet-800"
          >
            Ver las {demanda.length} propiedades · {propiedadesSinSenales.length} sin señales
          </button>
          <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
            No incluye vistas ni clics públicos: la plataforma todavía no registra analítica web.
          </p>
        </section>
      </div>

      {detalle === "alertas" && (
        <GlassModal
          titulo="Pendientes operativos"
          subtitulo="Casos verificables que requieren atención"
          ancho="lg"
          onCerrar={() => setDetalle(null)}
        >
          <div className="space-y-4">
            {leadsSinContactar.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">
                  Leads sin primer contacto
                </h3>
                <div className="space-y-2">
                  {leadsSinContactar.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => irACliente(lead.id)}
                      className="block w-full rounded-xl bg-amber-50 px-4 py-3 text-left text-xs text-amber-800 ring-1 ring-amber-200"
                    >
                      <span className="font-semibold">{lead.nombre}</span> ·{" "}
                      {Math.floor(diasDesde(lead.creado, ahora) * 24)} h sin contacto
                    </button>
                  ))}
                </div>
              </div>
            )}
            {propiedadesSinActividad.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-rose-700">
                  Propiedades sin actividad
                </h3>
                <div className="space-y-2">
                  {propiedadesSinActividad.map((propiedad) => {
                    const referencia = propiedad.ultimaActividad ?? propiedad.publicadaEl;
                    return (
                      <button
                        key={propiedad.id}
                        onClick={() => irAPropiedad(propiedad.id)}
                        className="block w-full rounded-xl bg-rose-50 px-4 py-3 text-left text-xs text-rose-800 ring-1 ring-rose-200"
                      >
                        <span className="font-semibold">{propiedad.titulo}</span>
                        {referencia
                          ? ` · ${Math.floor(diasDesde(referencia, ahora))} días sin actividad`
                          : " · sin fecha de actividad"}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {propiedadesConDocumentosPendientes.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-orange-700">
                  Documentación pendiente
                </h3>
                <div className="space-y-2">
                  {propiedadesConDocumentosPendientes.map((propiedad) => (
                    <button
                      key={propiedad.id}
                      onClick={() => irAPropiedad(propiedad.id)}
                      className="block w-full rounded-xl bg-orange-50 px-4 py-3 text-left text-xs text-orange-800 ring-1 ring-orange-200"
                    >
                      <span className="font-semibold">{propiedad.titulo}</span> ·{" "}
                      {docsAprobados(propiedad)} de {propiedad.documentos.length} documentos
                      aprobados
                    </button>
                  ))}
                </div>
              </div>
            )}
            {operacionesSinFecha.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-700">
                  Calidad de datos
                </h3>
                <div className="space-y-2">
                  {operacionesSinFecha.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => irACliente(lead.id)}
                      className="block w-full rounded-xl bg-violet-50 px-4 py-3 text-left text-xs text-violet-800 ring-1 ring-violet-200"
                    >
                      <span className="font-semibold">{lead.nombre}</span> está ganado, pero no
                      tiene fecha de cierre
                    </button>
                  ))}
                </div>
              </div>
            )}
            {totalAlertas === 0 && (
              <p className="px-2 py-6 text-center text-xs text-slate-500">
                Sin alertas activas.
              </p>
            )}
          </div>
        </GlassModal>
      )}

      {detalle === "inventario" && (
        <GlassModal
          titulo="Inventario de la agencia"
          subtitulo={`${inventarioFiltrado.length} propiedades en el filtro seleccionado`}
          ancho="lg"
          onCerrar={() => setDetalle(null)}
        >
          <div className="mb-4 flex flex-wrap gap-1.5">
            <FiltroBoton
              activo={filtroInventario === null}
              etiqueta="Todas"
              onClick={() => setFiltroInventario(null)}
            />
            {ESTADOS_PROPIEDAD.map((estado) => (
              <FiltroBoton
                key={estado}
                activo={filtroInventario === estado}
                etiqueta={estado}
                onClick={() => setFiltroInventario(estado)}
              />
            ))}
            <FiltroBoton
              activo={filtroInventario === "exclusiva"}
              etiqueta="Con exclusiva"
              onClick={() => setFiltroInventario("exclusiva")}
            />
            <FiltroBoton
              activo={filtroInventario === "sin-exclusiva"}
              etiqueta="Sin exclusiva"
              onClick={() => setFiltroInventario("sin-exclusiva")}
            />
            <FiltroBoton
              activo={filtroInventario === "documentos"}
              etiqueta="Documentos pendientes"
              onClick={() => setFiltroInventario("documentos")}
            />
          </div>
          <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
            {inventarioFiltrado.map((propiedad) => (
              <button
                key={propiedad.id}
                onClick={() => irAPropiedad(propiedad.id)}
                className="grid w-full gap-1 rounded-xl bg-white/70 px-4 py-3 text-left hover:bg-white sm:grid-cols-[minmax(0,1fr)_10rem_8rem_9rem]"
              >
                <span className="truncate text-sm font-semibold text-slate-800">
                  {propiedad.titulo}
                </span>
                <span className="text-xs text-slate-500">{propiedad.estatus}</span>
                <span className="text-xs text-slate-500">
                  {propiedad.exclusiva ? "Con exclusiva" : "Sin exclusiva"}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    documentacionCompleta(propiedad) ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {documentacionCompleta(propiedad)
                    ? "Documentación completa"
                    : `${docsAprobados(propiedad)}/${propiedad.documentos.length} docs.`}
                </span>
              </button>
            ))}
            {inventarioFiltrado.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-500">
                No hay propiedades en este filtro.
              </p>
            )}
          </div>
        </GlassModal>
      )}

      {detalle === "demanda" && (
        <GlassModal
          titulo="Demanda por propiedad"
          subtitulo="Señales acumuladas: leads + visitas realizadas + ofertas"
          ancho="lg"
          onCerrar={() => setDetalle(null)}
        >
          <div className="max-h-[62vh] space-y-2 overflow-y-auto sm:hidden">
            {demanda.map((item) => (
              <button
                key={item.propiedad.id}
                onClick={() => irAPropiedad(item.propiedad.id)}
                className="w-full rounded-2xl bg-white/70 p-4 text-left shadow-sm"
              >
                <span className="block text-sm font-semibold text-slate-800">
                  {item.propiedad.titulo}
                </span>
                <span className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["Leads", item.leads],
                    ["Visitas", item.visitas],
                    ["Ofertas", item.ofertas],
                    ["Señales", item.senales],
                  ].map(([etiqueta, valor]) => (
                    <span key={etiqueta}>
                      <span className="block text-base font-bold text-slate-900">{valor}</span>
                      <span className="block text-[10px] text-slate-500">{etiqueta}</span>
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
          <div className="hidden max-h-[62vh] overflow-y-auto sm:block">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="sticky top-0 bg-white/95 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Propiedad</th>
                  <th className="px-3 py-2.5">Leads</th>
                  <th className="px-3 py-2.5">Visitas</th>
                  <th className="px-3 py-2.5">Ofertas</th>
                  <th className="px-3 py-2.5">Señales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {demanda.map((item) => (
                  <tr
                    key={item.propiedad.id}
                    onClick={() => irAPropiedad(item.propiedad.id)}
                    className="cursor-pointer hover:bg-white/70"
                  >
                    <td className="px-3 py-3 font-semibold text-slate-800">
                      {item.propiedad.titulo}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{item.leads}</td>
                    <td className="px-3 py-3 text-slate-600">{item.visitas}</td>
                    <td className="px-3 py-3 text-slate-600">{item.ofertas}</td>
                    <td className="px-3 py-3 font-bold text-slate-800">{item.senales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] text-slate-500">
            Las ofertas son registros actuales; todavía no existe una fecha de captura que permita
            filtrarlas por periodo.
          </p>
        </GlassModal>
      )}

      {detalle === "equipo" && (
        <GlassModal
          titulo="Desempeño del equipo"
          subtitulo={`Cohorte y cierres reales de las últimas ${periodoActual.ventana}`}
          ancho="lg"
          onCerrar={() => setDetalle(null)}
        >
          <div className="max-h-[62vh] space-y-2 overflow-y-auto sm:hidden">
            {desempeno.map((item) => (
              <button
                key={item.asesor.id}
                onClick={() => {
                  setDetalle(null);
                  onVerAsesor(item.asesor.id);
                }}
                className="w-full rounded-2xl bg-white/70 p-4 text-left shadow-sm"
              >
                <span className="block text-sm font-semibold text-slate-900">
                  {item.asesor.nombre}
                </span>
                <span className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                  {[
                    ["Leads", item.leads],
                    ["Conversión", `${item.conversion}%`],
                    ["Ganadas", item.ganadas],
                    ["Próximas citas", item.citas],
                    ["Respuesta mediana", formatMin(item.respuesta)],
                  ].map(([etiqueta, valor]) => (
                    <span key={etiqueta}>
                      <span className="block text-base font-bold text-slate-900">{valor}</span>
                      <span className="block text-[10px] text-slate-500">{etiqueta}</span>
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200/70">
                  <th className="px-3 py-2.5">Asesor</th>
                  <th className="px-3 py-2.5">Leads</th>
                  <th className="px-3 py-2.5">Conversión</th>
                  <th className="px-3 py-2.5">Ganadas</th>
                  <th className="px-3 py-2.5">Próximas citas</th>
                  <th className="px-3 py-2.5">Respuesta mediana</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {desempeno.map((item) => (
                  <tr
                    key={item.asesor.id}
                    onClick={() => {
                      setDetalle(null);
                      onVerAsesor(item.asesor.id);
                    }}
                    className="cursor-pointer hover:bg-white/70"
                  >
                    <td className="px-3 py-3 font-medium text-slate-800">
                      {item.asesor.nombre}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{item.leads}</td>
                    <td className="px-3 py-3 text-slate-600">{item.conversion}%</td>
                    <td className="px-3 py-3 text-slate-600">{item.ganadas}</td>
                    <td className="px-3 py-3 text-slate-600">{item.citas}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatMin(item.respuesta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassModal>
      )}

      {detalle === "citas" && (
        <GlassModal
          titulo="Próximas citas"
          subtitulo={`Agenda de la oficina para los próximos ${periodoActual.ventana}`}
          ancho="lg"
          onCerrar={() => setDetalle(null)}
        >
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {[...proximasCitas]
              .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
              .map((cita) => (
                <button
                  key={cita.id}
                  disabled={!cita.leadId}
                  onClick={() => cita.leadId && irACliente(cita.leadId)}
                  className="grid w-full gap-1 rounded-xl bg-white/70 px-4 py-3 text-left enabled:hover:bg-white sm:grid-cols-[7rem_minmax(0,1fr)_10rem]"
                >
                  <span className="text-xs font-semibold text-violet-700">
                    {formatFecha(cita.inicio)}
                  </span>
                  <span className="truncate text-sm font-semibold text-slate-800">
                    {cita.titulo}
                  </span>
                  <span className="text-xs text-slate-500">
                    {nombreAsesorDe(usuarios, cita.asesorId)} · {cita.estado}
                  </span>
                </button>
              ))}
            {proximasCitas.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-500">
                No hay citas próximas en esta ventana.
              </p>
            )}
          </div>
        </GlassModal>
      )}

      {detalle === "operaciones" && (
        <GlassModal
          titulo="Operaciones ganadas"
          subtitulo={`Ganadas y fechadas en las últimas ${periodoActual.ventana}`}
          ancho="lg"
          onCerrar={() => setDetalle(null)}
        >
          <div className="space-y-2">
            {ganadasPeriodo.map((lead) => {
              const operacion = operaciones.find((item) => item.leadId === lead.id && item.estadoValidacion === "validada");
              const propiedad = propiedades.find(
                (item) => item.id === (operacion?.propiedadId ?? lead.interesPropiedadId),
              );
              const finanzas = finanzasDeLead(lead, propiedad, operacion);
              return (
                <button
                  key={lead.id}
                  onClick={() => irACliente(lead.id)}
                  className="grid w-full gap-1 rounded-xl bg-white/70 px-4 py-3 text-left hover:bg-white sm:grid-cols-[minmax(0,1fr)_10rem_9rem]"
                >
                  <span>
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {lead.nombre}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {propiedad?.titulo ?? operacion?.propiedadReferencia ?? "Sin propiedad vinculada"}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {lead.cerradoEn ? formatFecha(lead.cerradoEn) : "Sin fecha"}
                  </span>
                  <span className="text-right text-xs font-bold text-emerald-700">
                    {finanzas.ingresoPendiente ? "Ingreso pendiente" : formatoMXN(finanzas.ingresoConfirmado)}
                  </span>
                </button>
              );
            })}
            {ganadasPeriodo.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-500">
                No hay operaciones ganadas y fechadas en esta ventana.
              </p>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm ring-1 ring-emerald-200">
            <span className="font-semibold text-emerald-800">Ingreso confirmado</span>
            <span className="font-black text-emerald-700">
              {formatoMXN(ingresoConfirmado)}
            </span>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
            La clasificación individual, entre asesores o con otra oficina aparecerá cuando cada
            operación registre captador, colocador y contraparte. No se infiere con datos
            incompletos.
          </p>
        </GlassModal>
      )}
    </div>
  );
}

function FiltroBoton({
  activo,
  etiqueta,
  onClick,
}: {
  activo: boolean;
  etiqueta: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
        activo ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"
      }`}
    >
      {etiqueta}
    </button>
  );
}
