import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Building2, CalendarClock, Check, CheckCheck, Clock3, Contact,
  MessageCircle, RefreshCw, Search, Send, ShieldCheck, Target, UserCheck,
} from "lucide-react";
import type { ProgramarSeguimientoInput } from "../app/application/taskActions";
import CalificarProspectoModal from "../components/CalificarProspectoModal";
import ProgramarSeguimientoModal from "../components/ProgramarSeguimientoModal";
import { evaluarBant } from "../domain/leads/qualification";
import {
  asignarCanalWhatsApp,
  clasificarConversacionWhatsApp,
  enviarMensajeWhatsApp,
  listarCanalesWhatsApp,
  listarConversacionesWhatsApp,
  listarMensajesWhatsApp,
  type WhatsAppConversation,
} from "../repositories/whatsappRepository";
import type { WhatsAppChannelRow, WhatsAppMessageRow } from "../types/database";
import type { CalificacionBANT, Lead, Propiedad, Tarea, TipoInteraccion, Usuario } from "../types";

interface Props {
  usuario: Usuario;
  usuarios: Usuario[];
  leads: Lead[];
  propiedades: Propiedad[];
  tareas: Tarea[];
  onGuardarCalificacion: (leadId: string, bant: CalificacionBANT) => Promise<boolean> | boolean | void;
  onRegistrarInteraccion: (leadId: string, tipo: TipoInteraccion, descripcion: string) => Promise<boolean> | boolean | void;
  onRegistrarIntento: (leadId: string) => Promise<boolean>;
  onCompletarProximaTarea: (leadId: string) => Promise<boolean>;
  onAgendarVisita: (leadId: string) => void;
  onProgramarSeguimiento: (input: ProgramarSeguimientoInput) => Promise<boolean>;
  onAbrirCliente: (leadId: string) => void;
}

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const hora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });
const stateLabel: Record<WhatsAppConversation["estado"], string> = {
  bot: "Activa", pendiente_humano: "Por atender", humano: "En atención",
  cerrada: "Cerrada", bloqueada: "No contactar", requiere_revision: "Por revisar",
};

const deliveryIcon = (message: WhatsAppMessageRow) => {
  if (message.direccion !== "saliente") return null;
  if (message.estado_entrega === "leido") return <CheckCheck className="size-3.5 text-sky-600" aria-label="Leído" />;
  if (message.estado_entrega === "entregado") return <CheckCheck className="size-3.5" aria-label="Entregado" />;
  if (message.estado_entrega === "fallido") return <span className="text-[10px] font-bold text-rose-600">Falló</span>;
  return <Check className="size-3.5" aria-label={message.estado_entrega === "enviado" ? "Enviado" : "Pendiente"} />;
};

export default function WhatsAppHandoffs({
  usuario, usuarios, leads, propiedades, tareas,
  onGuardarCalificacion, onRegistrarInteraccion, onRegistrarIntento,
  onCompletarProximaTarea, onAgendarVisita,
  onProgramarSeguimiento, onAbrirCliente,
}: Props) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [channels, setChannels] = useState<WhatsAppChannelRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessageRow[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [linkLeadId, setLinkLeadId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qualifying, setQualifying] = useState(false);
  const [followingUp, setFollowingUp] = useState(false);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [nextConversations, nextChannels] = await Promise.all([
        listarConversacionesWhatsApp(), listarCanalesWhatsApp(),
      ]);
      setConversations(nextConversations);
      setChannels(nextChannels);
      setSelectedId((current) => current && nextConversations.some((item) => item.id === current)
        ? current
        : nextConversations[0]?.id ?? null);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: number) => {
    try {
      setMessages(await listarMensajesWhatsApp(conversationId));
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    const interval = window.setInterval(() => void reload(), 15_000);
    return () => window.clearInterval(interval);
  }, [reload]);
  useEffect(() => {
    if (selectedId == null) { setMessages([]); return; }
    void loadMessages(selectedId);
    const interval = window.setInterval(() => void loadMessages(selectedId), 10_000);
    return () => window.clearInterval(interval);
  }, [selectedId, loadMessages]);

  const selected = conversations.find((item) => item.id === selectedId) ?? null;
  const lead = selected?.lead_id ? leads.find((item) => item.id === selected.lead_id) : undefined;
  const property = propiedades.find((item) => item.id === lead?.interesPropiedadId);
  const assignee = usuarios.find((item) => item.id === selected?.asignado_a);
  const channel = channels.find((item) => item.id === selected?.canal_id);
  const isBroker = usuario.rol === "broker";
  const windowOpen = selected?.ventana_expira_en ? Date.parse(selected.ventana_expira_en) > Date.now() : false;
  const canSend = Boolean(selected && lead && !isBroker && selected.visibilidad === "laboral"
    && selected.asignado_a === usuario.id && channel?.usuario_id === usuario.id
    && selected.estado !== "bloqueada" && windowOpen);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conversation) => {
      const relatedLead = leads.find((item) => item.id === conversation.lead_id);
      const relatedAssignee = usuarios.find((item) => item.id === conversation.asignado_a);
      return [relatedLead?.nombre, conversation.contacto_nombre, conversation.telefono_whatsapp,
        conversation.ultimoMensaje?.cuerpo, relatedAssignee?.nombre]
        .some((value) => value?.toLowerCase().includes(q));
    });
  }, [conversations, leads, search, usuarios]);

  const ownLeads = leads.filter((item) => item.asesorId === usuario.id && item.estado !== "Descartado");
  const pendingTask = lead ? tareas
    .filter((item) => item.leadId === lead.id && item.estado === "pendiente" && item.metadata.tipo !== "whatsapp_handoff")
    .sort((a, b) => Date.parse(a.venceEn) - Date.parse(b.venceEn))[0] : undefined;

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await operation(); await reload(); if (selectedId) await loadMessages(selectedId); }
    catch (operationError) { setError((operationError as Error).message); }
    finally { setBusy(false); }
  };

  const send = () => {
    if (!selected || !lead || !draft.trim()) return;
    const body = draft.trim();
    void run(async () => {
      await enviarMensajeWhatsApp(selected.id, body);
      setDraft("");
      await onRegistrarInteraccion(lead.id, "WhatsApp", "Mensaje enviado desde HomeID");
    });
  };

  const classify = (classification: "laboral" | "personal") => {
    if (!selected) return;
    void run(async () => {
      await clasificarConversacionWhatsApp(selected.id, classification, linkLeadId || undefined);
      setLinkLeadId("");
      if (classification === "personal") setSelectedId(null);
    });
  };

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">WhatsApp de trabajo</p><h1 className="mt-1 text-2xl font-black text-slate-950">Conversaciones</h1><p className="mt-1 text-sm text-slate-600">{isBroker ? "Supervisión de solo lectura del equipo." : "Responde sin salir de HomeID; tus chats personales permanecen fuera."}</p></div>
        <button type="button" onClick={() => void reload()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><RefreshCw className="size-3.5" /> Actualizar</button>
      </header>

      {isBroker && channels.some((item) => !item.usuario_id) && (
        <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4" aria-label="Canales sin asignar">
          <p className="text-sm font-bold text-amber-950">Hay un número conectado sin asesor</p>
          <p className="mt-1 text-xs text-amber-800">Asígnalo para iniciar el piloto. Administrar el canal no permite al broker enviar mensajes.</p>
          {channels.filter((item) => !item.usuario_id).map((item) => <ChannelAssignment key={item.id} channel={item} users={usuarios} disabled={busy} onAssign={(userId) => void run(() => asignarCanalWhatsApp(item.id, userId))} />)}
        </section>
      )}
      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <div className="grid min-h-[68vh] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-12">
        <aside className={`${selected ? "hidden lg:flex" : "flex"} flex-col border-r border-slate-200 lg:col-span-4 xl:col-span-3`}>
          <div className="border-b border-slate-100 p-3"><label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2"><Search className="size-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversación" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? <p className="p-8 text-center text-sm text-slate-500">Cargando conversaciones…</p> : filtered.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No hay conversaciones laborales.</p> : filtered.map((conversation) => {
              const itemLead = leads.find((item) => item.id === conversation.lead_id);
              const name = itemLead?.nombre ?? conversation.contacto_nombre ?? conversation.telefono_whatsapp ?? conversation.telefono_norm;
              return <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className={`mb-1 w-full rounded-2xl p-3 text-left ${selectedId === conversation.id ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-2"><strong className="truncate text-sm text-slate-900">{name}</strong><time className="shrink-0 text-[10px] text-slate-400">{fecha.format(new Date(conversation.actualizado))}</time></div><p className="mt-1 truncate text-xs text-slate-500">{conversation.ultimoMensaje?.cuerpo ?? "Sin mensajes"}</p><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${conversation.visibilidad === "pendiente" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{conversation.visibilidad === "pendiente" ? "Por identificar" : stateLabel[conversation.estado]}</span></button>;
            })}
          </div>
        </aside>

        {!selected ? <main className="hidden items-center justify-center text-sm text-slate-500 lg:col-span-8 lg:flex xl:col-span-9">Selecciona una conversación.</main> : <>
          <main className="flex min-w-0 flex-col lg:col-span-5 xl:col-span-6">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3"><button type="button" onClick={() => setSelectedId(null)} aria-label="Volver" className="rounded-lg p-2 text-slate-500 lg:hidden"><ArrowLeft className="size-5" /></button><span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">{(lead?.nombre ?? selected.contacto_nombre ?? "WA").slice(0, 2).toUpperCase()}</span><div className="min-w-0"><h2 className="truncate font-bold text-slate-950">{lead?.nombre ?? selected.contacto_nombre ?? selected.telefono_whatsapp}</h2><p className="text-xs text-slate-500">{assignee?.nombre ?? "Sin asesor"} · {stateLabel[selected.estado]}</p></div></div>

            {lead && !isBroker && <div className="grid grid-cols-3 gap-1 border-b border-slate-100 p-2 lg:hidden"><button type="button" onClick={() => setQualifying(true)} className="rounded-lg px-2 py-2 text-[11px] font-bold text-violet-700 hover:bg-violet-50">Calificar</button><button type="button" onClick={() => onAgendarVisita(lead.id)} className="rounded-lg px-2 py-2 text-[11px] font-bold text-violet-700 hover:bg-violet-50">Agendar</button><button type="button" onClick={() => setFollowingUp(true)} className="rounded-lg px-2 py-2 text-[11px] font-bold text-violet-700 hover:bg-violet-50">Seguimiento</button></div>}

            {selected.visibilidad === "pendiente" ? <PendingClassification leads={ownLeads} selectedLeadId={linkLeadId} disabled={busy} onLead={setLinkLeadId} onWork={() => classify("laboral")} onPersonal={() => classify("personal")} /> : <>
              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50/70 p-4">
                {messages.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">Todavía no hay mensajes visibles.</p> : messages.map((message) => <div key={message.id} className={`flex ${message.direccion === "saliente" ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${message.direccion === "saliente" ? "rounded-br-md bg-emerald-100 text-slate-900" : "rounded-bl-md bg-white text-slate-800"}`}><p className="whitespace-pre-wrap">{message.cuerpo}</p><span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">{hora.format(new Date(message.recibido_en))}{deliveryIcon(message)}</span></div></div>)}
              </div>
              <div className="border-t border-slate-200 p-3">
                {isBroker ? <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-600"><ShieldCheck className="size-4" /> Vista de supervisión: no puedes enviar mensajes.</div> : !lead ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">Relaciona primero esta conversación con un cliente.</p> : !windowOpen ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">Terminó la ventana de 24 horas. Las plantillas se incorporarán después del piloto.</p> : <div className="flex items-end gap-2"><label className="sr-only" htmlFor="whatsapp-message">Mensaje</label><textarea id="whatsapp-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} rows={1} maxLength={4000} placeholder="Escribe un mensaje" className="min-h-11 flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500" /><button type="button" aria-label="Enviar mensaje" disabled={!canSend || busy || !draft.trim()} onClick={send} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white disabled:opacity-40"><Send className="size-4" /></button></div>}
              </div>
            </>}
          </main>

          <aside className="hidden border-l border-slate-200 p-4 lg:col-span-3 lg:block">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Cliente y seguimiento</h3>
            {!lead ? <p className="mt-4 text-sm text-slate-500">Esta conversación todavía no está relacionada con un cliente.</p> : <div className="mt-4 space-y-4"><div><p className="font-bold text-slate-950">{lead.nombre}</p><p className="mt-1 text-xs text-slate-500">{lead.telefono}</p></div><Info icon={<Building2 className="size-4" />} label="Propiedad" value={property?.titulo ?? "Sin propiedad relacionada"} /><Info icon={<Target className="size-4" />} label="Prioridad" value={evaluarBant(lead.bant).calificado ? `${evaluarBant(lead.bant).puntaje}/100 · ${evaluarBant(lead.bant).clasificacion}` : "Sin calificar"} /><Info icon={<Clock3 className="size-4" />} label="Seguimiento" value={pendingTask ? fecha.format(new Date(pendingTask.venceEn)) : "Sin seguimiento"} />{!isBroker && <div className="grid gap-2 pt-2"><button type="button" onClick={() => setQualifying(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-xs font-bold hover:bg-slate-50"><Target className="size-4 text-violet-600" /> Calificar cliente</button><button type="button" onClick={() => onAgendarVisita(lead.id)} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-xs font-bold hover:bg-slate-50"><CalendarClock className="size-4 text-violet-600" /> Agendar cita</button><button type="button" onClick={() => setFollowingUp(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-xs font-bold hover:bg-slate-50"><MessageCircle className="size-4 text-violet-600" /> Programar seguimiento</button><button type="button" onClick={() => onAbrirCliente(lead.id)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-violet-700 hover:bg-violet-50"><Contact className="size-4" /> Abrir ficha completa</button></div>}</div>}
          </aside>
        </>}
      </div>

      {qualifying && lead && <CalificarProspectoModal lead={lead} propiedad={property} nombreAsesor={usuario.nombre} onCancelar={() => setQualifying(false)} onGuardar={async (bant) => { const ok = await onGuardarCalificacion(lead.id, bant); if (ok !== false) setQualifying(false); }} onNoContesta={async () => { if (!(await onRegistrarIntento(lead.id))) return; await onCompletarProximaTarea(lead.id); setQualifying(false); setFollowingUp(true); }} onDescartar={() => { setQualifying(false); onAbrirCliente(lead.id); }} />}
      {followingUp && lead && <ProgramarSeguimientoModal lead={lead} tarea={pendingTask} onCerrar={() => setFollowingUp(false)} onGuardar={onProgramarSeguimiento} />}
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">{icon}{label}</p><p className="mt-1 text-xs font-semibold text-slate-800">{value}</p></div>;
}

function PendingClassification({ leads, selectedLeadId, disabled, onLead, onWork, onPersonal }: { leads: Lead[]; selectedLeadId: string; disabled: boolean; onLead: (id: string) => void; onWork: () => void; onPersonal: () => void }) {
  return <div className="flex flex-1 items-center justify-center bg-amber-50/40 p-6"><div className="max-w-md rounded-3xl border border-amber-200 bg-white p-6 shadow-sm"><UserCheck className="size-8 text-amber-600" /><h3 className="mt-3 text-lg font-bold text-slate-950">¿Es una conversación de trabajo?</h3><p className="mt-2 text-sm leading-6 text-slate-600">Solo las conversaciones laborales serán visibles para el broker. Si es personal, su contenido se elimina de HomeID.</p><label className="mt-5 block text-xs font-bold text-slate-700">Relacionar con un cliente existente (opcional)<select value={selectedLeadId} onChange={(event) => onLead(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Crear cliente al confirmar trabajo</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.nombre} · {lead.telefono}</option>)}</select></label><div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" disabled={disabled} onClick={onPersonal} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">Es personal</button><button type="button" disabled={disabled} onClick={onWork} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Es de trabajo</button></div></div></div>;
}

function ChannelAssignment({ channel, users, disabled, onAssign }: { channel: WhatsAppChannelRow; users: Usuario[]; disabled: boolean; onAssign: (userId: string) => void }) {
  const [userId, setUserId] = useState("");
  const advisors = users.filter((item) => item.estadoCuenta === "Activo" && (item.rol === "asesor_equipo" || item.rol === "asesor_independiente"));
  return <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700">{channel.telefono_mostrado ?? `Canal ${channel.phone_number_id.slice(-6)}`}</span><select aria-label="Asesor para el canal" value={userId} onChange={(event) => setUserId(event.target.value)} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs"><option value="">Selecciona un asesor</option>{advisors.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.nombre}</option>)}</select><button type="button" disabled={!userId || disabled} onClick={() => onAssign(userId)} className="rounded-xl bg-amber-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Asignar número</button></div>;
}
