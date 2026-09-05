import type {
  NotificationRow,
  WhatsAppChannelRow,
  WhatsAppConversationRow,
  WhatsAppMessageRow,
} from "../types/database";
import { isCloudEnabled, supabase } from "../lib/supabaseClient";

export interface WhatsAppConversation extends WhatsAppConversationRow {
  ultimoMensaje: WhatsAppMessageRow | null;
}

interface FunctionErrorData { error?: string }

export interface WhatsAppHandoffNotification {
  id: string;
  titulo: string;
  cuerpo: string;
  conversationId: number;
  createdAt: string;
}

function requireCloud() {
  if (!isCloudEnabled || !supabase) throw new Error("WhatsApp requiere conexión a la nube.");
  return supabase;
}

export async function listarConversacionesWhatsApp(): Promise<WhatsAppConversation[]> {
  const client = requireCloud();
  const { data: conversations, error } = await client
    .from("wa_conversaciones")
    .select("*")
    .neq("visibilidad", "personal")
    .order("actualizado", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const rows = (conversations ?? []) as WhatsAppConversationRow[];
  if (rows.length === 0) return [];
  const { data: messages, error: messagesError } = await client
    .from("wa_mensajes")
    .select("*")
    .in("conversacion_id", rows.map((conversation) => conversation.id))
    .order("recibido_en", { ascending: false });
  if (messagesError) throw new Error(messagesError.message);

  const latest = new Map<number, WhatsAppMessageRow>();
  for (const message of (messages ?? []) as WhatsAppMessageRow[]) {
    if (!latest.has(message.conversacion_id)) latest.set(message.conversacion_id, message);
  }
  return rows.map((conversation) => ({
    ...conversation,
    ultimoMensaje: latest.get(conversation.id) ?? null,
  }));
}

export async function listarCanalesWhatsApp(): Promise<WhatsAppChannelRow[]> {
  const { data, error } = await requireCloud()
    .from("wa_canales")
    .select("*")
    .eq("activo", true)
    .order("creado_en", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as WhatsAppChannelRow[];
}

export async function listarMensajesWhatsApp(conversationId: number): Promise<WhatsAppMessageRow[]> {
  const { data, error } = await requireCloud()
    .from("wa_mensajes")
    .select("*")
    .eq("conversacion_id", conversationId)
    .order("recibido_en", { ascending: true })
    .limit(250);
  if (error) throw new Error(error.message);
  return (data ?? []) as WhatsAppMessageRow[];
}

export async function asignarCanalWhatsApp(channelId: string, userId: string): Promise<void> {
  const { error } = await requireCloud().rpc("asignar_canal_whatsapp", {
    p_canal_id: channelId,
    p_usuario_id: userId,
  });
  if (error) throw new Error(error.message);
}

export async function clasificarConversacionWhatsApp(
  conversationId: number,
  classification: "laboral" | "personal",
  leadId?: string,
): Promise<void> {
  const { error } = await requireCloud().rpc("clasificar_conversacion_whatsapp", {
    p_conversacion_id: conversationId,
    p_clasificacion: classification,
    p_lead_id: leadId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function enviarMensajeWhatsApp(conversationId: number, body: string): Promise<void> {
  const { data, error } = await requireCloud().functions.invoke<{ ok?: boolean }>("whatsapp-send", {
    body: { conversationId, body, requestId: crypto.randomUUID() },
  });
  if (error) {
    const context = error.context as Response | undefined;
    const details = context ? await context.clone().json().catch(() => null) as FunctionErrorData | null : null;
    throw new Error(details?.error ?? "No se pudo enviar el mensaje.");
  }
  if (!data?.ok) throw new Error("WhatsApp no confirmó el envío.");
}

export async function tomarConversacionWhatsApp(conversationId: number): Promise<void> {
  const { error } = await requireCloud().rpc("tomar_conversacion_whatsapp", {
    p_conversacion_id: conversationId,
  });
  if (error) throw new Error(error.message);
}

export async function cerrarConversacionWhatsApp(conversationId: number, summary: string): Promise<void> {
  const { error } = await requireCloud().rpc("cerrar_conversacion_whatsapp", {
    p_conversacion_id: conversationId,
    p_resumen: summary,
  });
  if (error) throw new Error(error.message);
}

export async function listarNotificacionesWhatsApp(): Promise<WhatsAppHandoffNotification[]> {
  const { data, error } = await requireCloud()
    .from("notificaciones")
    .select("*")
    .eq("tipo", "whatsapp_handoff")
    .eq("leida", false)
    .order("creada_en", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return ((data ?? []) as NotificationRow[]).flatMap((notification) => {
    const rawId = notification.datos.conversacion_id;
    const conversationId = typeof rawId === "number" ? rawId : Number(rawId);
    if (!Number.isInteger(conversationId)) return [];
    return [{
      id: notification.id,
      titulo: notification.titulo,
      cuerpo: notification.cuerpo ?? "Un contacto espera atención humana.",
      conversationId,
      createdAt: notification.creada_en,
    }];
  });
}

export async function marcarNotificacionWhatsAppLeida(notificationId: string): Promise<void> {
  const { error } = await requireCloud().from("notificaciones").update({ leida: true }).eq("id", notificationId);
  if (error) throw new Error(error.message);
}

export async function marcarNotificacionesWhatsAppLeidas(): Promise<void> {
  const { error } = await requireCloud()
    .from("notificaciones")
    .update({ leida: true })
    .eq("tipo", "whatsapp_handoff")
    .eq("leida", false);
  if (error) throw new Error(error.message);
}

export function enlaceWhatsApp(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (/^521\d{10}$/.test(digits)) digits = `52${digits.slice(3)}`;
  return digits.length >= 10 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}
