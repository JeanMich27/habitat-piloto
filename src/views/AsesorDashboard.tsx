// Dashboard del asesor.
//
// Criterio de diseño: la pantalla de inicio informa y reparte, no opera.
// Antes el Kanban completo se comía el alto entero y obligaba a arrastrar
// tarjetas aquí; ahora el pipeline es una fila de números y el trabajo real
// vive en Clientes, que es la pantalla hecha para eso.
//
// Todo lo que se ve es clicable y lleva a un solo destino evidente:
//   · Tarjeta de propiedad → detalle de esa propiedad.
//   · Número de una etapa  → Clientes filtrado por esa etapa.
//   · Cliente por atender  → ficha de ese cliente.
import { ArrowRight, Building2, Contact, Plus } from "lucide-react";
import PropertyCard from "../components/PropertyCard";
import ProyeccionComisiones from "../components/ProyeccionComisiones";
import { ETAPAS_LEAD } from "../data/etapasLead";
import { enlaceWhatsApp, mensajeParaLead } from "../lib/whatsapp";
import type { Lead, LeadStage, Propiedad, Usuario } from "../types";
import { clasificarLead, totalBant } from "../types";

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

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* ---------- Encabezado ---------- */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
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
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <Contact className="size-3.5" /> Ver mis clientes
        </button>
      </header>

      {/* ---------- 1. Propiedades ---------- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Building2 className="size-4 text-slate-400" /> Mis propiedades
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              {activas} activas
            </span>
          </h2>
          <div className="flex gap-2">
            <button
              onClick={onNuevaPropiedad}
              className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="size-3.5" /> Nueva
            </button>
            <button
              onClick={onVerPropiedades}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Ver todas <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>

        {misPropiedades.length === 0 ? (
          <button
            onClick={onNuevaPropiedad}
            className="flex w-full flex-col items-center rounded-xl border border-dashed border-slate-300 p-8 text-center hover:border-slate-400"
          >
            <Building2 className="size-6 text-slate-300" />
            <span className="mt-2 text-sm font-semibold text-slate-700">
              Todavía no tienes propiedades
            </span>
            <span className="mt-0.5 text-xs text-slate-400">Toca aquí para dar de alta la primera</span>
          </button>
        ) : (
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
            {misPropiedades.map((p) => (
              <button
                key={p.id}
                onClick={() => onVerPropiedad(p.id)}
                className="snap-start text-left"
                aria-label={`Abrir ${p.titulo}`}
              >
                <PropertyCard propiedad={p} />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ---------- 2. Pipeline resumido ---------- */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
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
                className={`rounded-lg border p-3 text-center transition ${
                  cantidad > 0
                    ? "border-slate-200 hover:border-slate-400 hover:bg-slate-50"
                    : "border-slate-100 opacity-50"
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
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">Por atender hoy</h2>
            <button
              onClick={() => onVerClientes()}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Ver todos <ArrowRight className="size-3.5" />
            </button>
          </div>

          <ul className="divide-y divide-slate-100">
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
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
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
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
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
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
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
