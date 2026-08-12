// Dashboard del asesor — rediseño Fase 1 (glass + neumórfico).
//
// Criterio de diseño: la pantalla de inicio informa y reparte, no opera.
// Un panel guía arriba le dice al asesor cuál es SU siguiente paso (uno
// solo), y el resto son tarjetas modulares limpias:
//   · Tarjeta de propiedad → detalle de esa propiedad (con termómetro
//     de antigüedad: verde/amarillo/naranja/rojo según meses publicada).
//   · Número de una etapa  → Clientes filtrado por esa etapa.
//   · Cliente por atender  → ficha de ese cliente.
import { ArrowRight, Building2, Contact, Plus, Sparkles } from "lucide-react";
import PropertyCard from "../components/PropertyCard";
import ProyeccionComisiones from "../components/ProyeccionComisiones";
import { ETAPAS_LEAD } from "../data/etapasLead";
import { enlaceWhatsApp, mensajeParaLead } from "../lib/whatsapp";
import type { Lead, LeadStage, Propiedad, Usuario } from "../types";
import { clasificarLead, puedeCargarPropiedades, totalBant } from "../types";

interface Props {
  asesor: Usuario;
  leads: Lead[];
  propiedades: Propiedad[];
  onVerPropiedades: () => void;
  onVerPropiedad: (propiedadId: string) => void;
  onVerClientes: (etapa?: LeadStage) => void;
  onVerCliente: (leadId: string) => void;
  onNuevaPropiedad: () => void;
}

export default function AsesorDashboard({
  asesor,
  leads,
  propiedades,
  onVerPropiedades,
  onVerPropiedad,
  onVerClientes,
  onVerCliente,
  onNuevaPropiedad,
}: Props) {
  const misLeads = leads.filter((l) => l.asesorId === asesor.id);
  const misPropiedades = propiedades.filter((p) => p.asesorId === asesor.id);

  // "Por atender" = lo que de verdad merece un toque hoy, en orden:
  // primero los que nunca se contactaron, luego los mejor calificados.
  const porAtender = [...misLeads]
    .filter((l) => l.etapa !== "Cierre")
    .sort((a, b) => {
      const aSin = a.primerContactoEn ? 1 : 0;
      const bSin = b.primerContactoEn ? 1 : 0;
      if (aSin !== bSin) return aSin - bSin;
      const pa = a.bant ? totalBant(a.bant) : -1;
      const pb = b.bant ? totalBant(b.bant) : -1;
      return pb - pa;
    })
    .slice(0, 4);

  const activas = misPropiedades.filter((p) => p.estatus === "Activa").length;
  // El asesor de equipo no capta inventario: eso lo hace el broker.
  const puedeCaptar = puedeCargarPropiedades(asesor.rol);

  // --- Guía: un solo "siguiente paso", el más valioso ---
  const sinContactar = misLeads.filter((l) => !l.primerContactoEn && l.etapa !== "Cierre");
  const guia =
    sinContactar.length > 0
      ? {
          texto: `Tienes ${sinContactar.length} cliente${sinContactar.length === 1 ? "" : "s"} sin contactar. La velocidad de respuesta define la conversión.`,
          accion: "Contactarlos ahora",
          onClick: () => onVerClientes(),
        }
      : misPropiedades.length === 0 && puedeCaptar
        ? {
            texto: "Empieza dando de alta tu primera propiedad: es la base de todo tu embudo.",
            accion: "Alta de propiedad",
            onClick: onNuevaPropiedad,
          }
        : {
            texto: "Vas al día. Revisa tu embudo y empuja los clientes en negociación.",
            accion: "Abrir clientes",
            onClick: () => onVerClientes(),
          };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* ---------- Panel guía / bienvenida ---------- */}
      <section className="glass relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-100/70 via-violet-100/40 to-emerald-100/50" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-sm font-bold text-white shadow-md shadow-violet-300/50">
              {asesor.iniciales}
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
                Hola, {asesor.nombre.split(" ")[0]}
              </h1>
              <p className="text-xs text-slate-500">
                {misPropiedades.length} propiedades · {misLeads.length} clientes
              </p>
            </div>
          </div>
          <button
            onClick={() => onVerClientes()}
            className="flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-violet-300/60 hover:bg-violet-700"
          >
            <Contact className="size-3.5" /> Ver mis clientes
          </button>
        </div>

        {/* Un solo siguiente paso, guiado por la plataforma. */}
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 px-4 py-3 shadow-sm backdrop-blur">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <Sparkles className="size-4 shrink-0 text-violet-500" />
            {guia.texto}
          </p>
          <button
            onClick={guia.onClick}
            className="flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-200"
          >
            {guia.accion} <ArrowRight className="size-3.5" />
          </button>
        </div>
      </section>

      {/* ---------- 1. Propiedades ---------- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Building2 className="size-4 text-slate-400" /> Mis propiedades
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-500 shadow-sm">
              {activas} activas
            </span>
          </h2>
          <div className="flex gap-2">
            {puedeCaptar && (
              <button
                onClick={onNuevaPropiedad}
                className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
              >
                <Plus className="size-3.5" /> Nueva
              </button>
            )}
            <button
              onClick={onVerPropiedades}
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Ver todas <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>

        {misPropiedades.length === 0 ? (
          puedeCaptar ? (
            <button
              onClick={onNuevaPropiedad}
              className="glass flex w-full flex-col items-center border-dashed p-8 text-center hover:bg-white/70"
            >
              <Building2 className="size-6 text-slate-300" />
              <span className="mt-2 text-sm font-semibold text-slate-700">
                Todavía no tienes propiedades
              </span>
              <span className="mt-0.5 text-xs text-slate-400">
                Toca aquí para dar de alta la primera
              </span>
            </button>
          ) : (
            <div className="glass border-dashed p-8 text-center">
              <Building2 className="mx-auto size-6 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">
                Todavía no tienes propiedades asignadas
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Tu broker es quien da de alta el inventario y te lo asigna.
              </p>
            </div>
          )
        ) : (
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
            {misPropiedades.map((p) => (
              <button
                key={p.id}
                onClick={() => onVerPropiedad(p.id)}
                className="w-72 shrink-0 snap-start text-left"
                aria-label={`Abrir ${p.titulo}`}
              >
                <PropertyCard propiedad={p} />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ---------- 2. Pipeline resumido ---------- */}
      <section className="glass p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">Mi embudo</h2>
          <button
            onClick={() => onVerClientes()}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            Abrir clientes <ArrowRight className="size-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {ETAPAS_LEAD.map((col) => {
            const cantidad = misLeads.filter((l) => l.etapa === col.etapa).length;
            return (
              <button
                key={col.etapa}
                onClick={() => onVerClientes(col.etapa)}
                disabled={cantidad === 0}
                className={`rounded-2xl p-3 text-center transition ${
                  cantidad > 0
                    ? "bg-white/70 shadow-sm hover:-translate-y-0.5 hover:bg-white"
                    : "bg-white/40 opacity-50"
                }`}
              >
                <span className={`mx-auto block size-1.5 rounded-full ${col.acento}`} />
                <span className="mt-1.5 block text-xl font-black text-slate-900">{cantidad}</span>
                <span className="mt-0.5 block text-[10px] font-semibold leading-tight text-slate-500">
                  {col.titulo}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- 3. Por atender hoy ---------- */}
      {porAtender.length > 0 && (
        <section className="glass p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">Por atender hoy</h2>
            <button
              onClick={() => onVerClientes()}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Ver todos <ArrowRight className="size-3.5" />
            </button>
          </div>

          <ul className="divide-y divide-slate-100/80">
            {porAtender.map((l) => {
              const prop = propiedades.find((p) => p.id === l.interesPropiedadId);
              const puntaje = l.bant ? totalBant(l.bant) : null;
              const wa = enlaceWhatsApp(l.telefono, mensajeParaLead(l, prop, asesor.nombre));
              return (
                <li key={l.id} className="flex items-center gap-3 py-2.5">
                  <button
                    onClick={() => onVerCliente(l.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-[11px] font-bold text-white">
                      {l.nombre.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {l.nombre}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {prop?.titulo ?? "Sin propiedad de interés"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {puntaje === null ? (
                        <span className="rounded-full bg-amber-50/90 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                          Sin calificar
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            clasificarLead(puntaje) === "Hot"
                              ? "bg-emerald-50 text-emerald-700"
                              : clasificarLead(puntaje) === "Warm"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {puntaje} pts
                        </span>
                      )}
                      {!l.primerContactoEn && (
                        <span className="mt-0.5 block text-[10px] text-slate-400">
                          Sin contactar
                        </span>
                      )}
                    </span>
                  </button>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={`Escribir a ${l.nombre} por WhatsApp`}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200"
                    >
                      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                        <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.04 21.5h-.01c-1.75 0-3.47-.47-4.97-1.36l-.36-.21-3.7.97.99-3.61-.23-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.46-4.44 9.9-9.99 9.9m8.42-18.32A11.8 11.8 0 0 0 12.04 0C5.5 0 .17 5.33.17 11.88c0 2.09.55 4.13 1.59 5.93L.07 24l6.34-1.66a11.85 11.85 0 0 0 5.63 1.44h.01c6.54 0 11.87-5.33 11.87-11.88 0-3.17-1.24-6.15-3.48-8.4" />
                      </svg>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---------- 4. Proyección ---------- */}
      <ProyeccionComisiones leads={misLeads} propiedades={propiedades} />
    </div>
  );
}
