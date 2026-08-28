import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, MessageCircle, RefreshCw, UserCheck } from "lucide-react";
import type { Lead, Propiedad, Usuario } from "../types";
import {
  cerrarConversacionWhatsApp,
  enlaceWhatsApp,
  listarConversacionesWhatsApp,
  tomarConversacionWhatsApp,
  type WhatsAppConversation,
} from "../repositories/whatsappRepository";

interface Props {
  usuario: Usuario;
  usuarios: Usuario[];
  leads: Lead[];
  propiedades: Propiedad[];
}

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

const stateLabel: Record<WhatsAppConversation["estado"], string> = {
  bot: "Bot",
  pendiente_humano: "Espera atención",
  humano: "En atención",
  cerrada: "Cerrada",
  bloqueada: "No contactar",
  requiere_revision: "Sin responsable",
};

export default function WhatsAppHandoffs({ usuario, usuarios, leads, propiedades }: Props) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setConversations(await listarConversacionesWhatsApp());
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const intervalId = window.setInterval(() => void reload(), 15_000);
    return () => window.clearInterval(intervalId);
  }, [reload]);

  const active = useMemo(
    () => conversations.filter((conversation) => conversation.estado !== "cerrada"),
    [conversations],
  );
  const closed = useMemo(
    () => conversations.filter((conversation) => conversation.estado === "cerrada").slice(0, 20),
    [conversations],
  );

  const leadFor = (conversation: WhatsAppConversation) =>
    leads.find((lead) => lead.id === conversation.lead_id);
  const propertyFor = (lead: Lead | undefined) =>
    propiedades.find((property) => property.id === lead?.interesPropiedadId);
  const assigneeFor = (conversation: WhatsAppConversation) =>
    usuarios.find((candidate) => candidate.id === conversation.asignado_a);

  const take = async (conversationId: number) => {
    setBusyId(conversationId);
    setError(null);
    try {
      await tomarConversacionWhatsApp(conversationId);
      await reload();
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const close = async (conversationId: number) => {
    setBusyId(conversationId);
    setError(null);
    try {
      await cerrarConversacionWhatsApp(conversationId, summary);
      setClosingId(null);
      setSummary("");
      await reload();
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const renderConversation = (conversation: WhatsAppConversation) => {
    const lead = leadFor(conversation);
    const property = propertyFor(lead);
    const assignee = assigneeFor(conversation);
    const link = enlaceWhatsApp(conversation.telefono_whatsapp ?? conversation.telefono_norm);
    const canTake = conversation.estado === "pendiente_humano"
      || (conversation.estado === "requiere_revision" && usuario.rol === "broker");
    const isMine = conversation.asignado_a === usuario.id;

    return (
      <article key={conversation.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-bold text-slate-900">
                {lead?.nombre || conversation.telefono_whatsapp || conversation.telefono_norm}
              </h3>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                conversation.estado === "pendiente_humano" || conversation.estado === "requiere_revision"
                  ? "bg-amber-100 text-amber-800"
                  : conversation.estado === "humano"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
              }`}>
                {stateLabel[conversation.estado]}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Responsable: {assignee?.nombre ?? "Sin responsable"}
              {property ? ` · Propiedad: ${property.titulo}` : " · Propiedad no identificada"}
            </p>
          </div>
          <time className="text-[11px] text-slate-500" dateTime={conversation.actualizado}>
            {dateFormatter.format(new Date(conversation.actualizado))}
          </time>
        </div>

        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Último mensaje</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
            {conversation.ultimoMensaje?.cuerpo ?? "No se encontró el mensaje entrante."}
          </p>
          {conversation.ultimoMensaje?.intent && (
            <p className="mt-2 text-[11px] text-slate-500">
              Clasificación: {conversation.ultimoMensaje.intent}
              {conversation.ultimoMensaje.confidence != null
                ? ` · ${Math.round(Number(conversation.ultimoMensaje.confidence) * 100)}%`
                : ""}
              {conversation.handoff_reason ? ` · Regla: ${conversation.handoff_reason}` : ""}
            </p>
          )}
        </div>

        {closingId === conversation.id ? (
          <div className="mt-3 rounded-xl border border-slate-200 p-3">
            <label htmlFor={`summary-${conversation.id}`} className="text-xs font-bold text-slate-700">
              Resultado de la atención
            </label>
            <textarea
              id={`summary-${conversation.id}`}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Ej. Se confirmó interés y se acordó llamar mañana a las 10:00."
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setClosingId(null); setSummary(""); }}
                className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={summary.trim().length < 10 || busyId === conversation.id}
                onClick={() => void close(conversation.id)}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Guardar y cerrar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {canTake && (
              <button
                type="button"
                disabled={busyId === conversation.id}
                onClick={() => void take(conversation.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <UserCheck className="size-3.5" /> Tomar
              </button>
            )}
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="size-3.5" /> Abrir chat
              </a>
            )}
            {(conversation.estado === "humano" || (conversation.estado === "pendiente_humano" && (isMine || usuario.rol === "broker"))) && (
              <button
                type="button"
                onClick={() => { setClosingId(conversation.id); setSummary(""); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <CheckCircle2 className="size-3.5" /> Cerrar
              </button>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Coexistence</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Atención por WhatsApp</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            El agente clasifica y escala aquí. La respuesta humana se envía desde WhatsApp Business.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white"
        >
          <RefreshCw className="size-3.5" /> Actualizar
        </button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section aria-labelledby="active-whatsapp" className="mt-6">
        <div className="flex items-center gap-2">
          <MessageCircle className="size-5 text-emerald-600" />
          <h2 id="active-whatsapp" className="font-bold text-slate-900">Requieren seguimiento</h2>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">{active.length}</span>
        </div>
        <div className="mt-3 grid gap-3">
          {loading ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">Cargando conversaciones…</p>
          ) : active.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">No hay handoffs pendientes.</p>
          ) : active.map(renderConversation)}
        </div>
      </section>

      {closed.length > 0 && (
        <section aria-labelledby="closed-whatsapp" className="mt-8">
          <h2 id="closed-whatsapp" className="font-bold text-slate-900">Cerradas recientemente</h2>
          <div className="mt-3 grid gap-3">{closed.map(renderConversation)}</div>
        </section>
      )}
    </main>
  );
}
