import type {
  NotificationRow,
  WhatsAppConversationRow,
  WhatsAppMessageRow,
} from "../types/database";
import { isCloudEnabled, supabase } from "../lib/supabaseClient";

export interface WhatsAppConversation extends WhatsAppConversationRow {
  ultimoMensaje: WhatsAppMessageRow | null;
}

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
    .in("estado", ["pendiente_humano", "humano", "cerrada", "requiere_revision"])
    .order("actualizado", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const rows = (conversations ?? []) as WhatsAppConversationRow[];
  if (rows.length === 0) return [];
  const { data: messages, error: messagesError } = await client
    .from("wa_mensajes")
    .select("*")
    .in("conversacion_id", rows.map((conversation) => conversation.id))
    .eq("direccion", "entrante")
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
