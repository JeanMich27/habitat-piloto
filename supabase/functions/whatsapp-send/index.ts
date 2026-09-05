import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json } from "../_shared/documentHttp.ts";
import { normalizarParaEnvio } from "../_shared/whatsapp-automation.ts";

const MAX_BODY_BYTES = 8 * 1024;
const configuredGraphVersion = Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v26.0";
const GRAPH_VERSION = /^v\d+\.\d+$/.test(configuredGraphVersion) ? configuredGraphVersion : "v26.0";

interface PreparedMessage {
  message_id: number;
  status: string;
  phone_number_id: string;
  recipient: string;
  agency_id: string;
  body: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Método no permitido." });

  const token = bearerToken(request);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token) return json(401, { error: "Inicia sesión para responder." });
  if (!url || !anonKey || !serviceKey) return json(503, { error: "Mensajería no configurada." });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return json(413, { error: "Mensaje demasiado grande." });

  let input: { conversationId?: unknown; body?: unknown; requestId?: unknown };
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json(413, { error: "Mensaje demasiado grande." });
    }
    input = JSON.parse(raw);
  } catch {
    return json(400, { error: "Solicitud inválida." });
  }

  const conversationId = Number(input.conversationId);
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const requestId = typeof input.requestId === "string" ? input.requestId : "";
  if (!Number.isInteger(conversationId) || !body || body.length > 4000 || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return json(422, { error: "Revisa el mensaje e intenta nuevamente." });
  }

  const authorization = `Bearer ${token}`;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return json(401, { error: "Tu sesión expiró." });

  const { data: preparedData, error: prepareError } = await userClient.rpc("preparar_envio_whatsapp", {
    p_conversacion_id: conversationId,
    p_cuerpo: body,
    p_client_request_id: requestId,
  });
  if (prepareError) {
    const expected = ["42501", "22023", "23503", "23505", "P0001"].includes(prepareError.code ?? "");
    return json(expected ? 422 : 500, { error: expected ? prepareError.message : "No se pudo preparar el mensaje." });
  }
  const prepared = preparedData as PreparedMessage;
  if (prepared.status !== "pendiente") {
    return json(200, { ok: true, messageId: prepared.message_id, status: prepared.status, reused: true });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: whatsappToken, error: secretError } = await admin.rpc("obtener_secreto_canal_whatsapp", {
    p_phone_number_id: prepared.phone_number_id,
  });
  if (secretError || typeof whatsappToken !== "string" || !whatsappToken) {
    await admin.from("wa_mensajes").update({ estado_entrega: "fallido" }).eq("id", prepared.message_id);
    return json(503, { error: "El canal de WhatsApp no tiene una credencial activa." });
  }

  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${prepared.phone_number_id}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${whatsappToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizarParaEnvio(prepared.recipient),
      type: "text",
      text: { body: prepared.body, preview_url: false },
    }),
  });
  if (!response.ok) {
    console.error("[whatsapp-send] provider_rejected", { status: response.status, messageId: prepared.message_id });
    await admin.from("wa_mensajes").update({ estado_entrega: "fallido" }).eq("id", prepared.message_id);
    return json(502, { error: "WhatsApp rechazó el envío. Intenta nuevamente." });
  }
  const result = await response.json();
  const waMessageId = result?.messages?.[0]?.id;
  if (typeof waMessageId !== "string") {
    await admin.from("wa_mensajes").update({ estado_entrega: "fallido" }).eq("id", prepared.message_id);
    return json(502, { error: "WhatsApp no confirmó el mensaje." });
  }

  const { error: updateError } = await admin.from("wa_mensajes").update({
    wa_message_id: waMessageId,
    estado_entrega: "enviado",
  }).eq("id", prepared.message_id);
  if (updateError) console.error("[whatsapp-send] audit_update_failed", { messageId: prepared.message_id });

  return json(200, { ok: true, messageId: prepared.message_id, status: "enviado", reused: false });
});
