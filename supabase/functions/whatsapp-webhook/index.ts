// Webhook oficial de WhatsApp Cloud API para el MVP de Coexistence.
// Meta autentica POST con HMAC; el navegador nunca conoce service_role ni
// credenciales de proveedores. La base persiste antes de llamar servicios
// externos y aplica las decisiones operativas mediante RPC transaccionales.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  decideWhatsAppAction,
  firmaWhatsAppValida,
  normalizarParaEnvio,
  parseWhatsAppClassification,
  type WhatsAppClassification,
} from "../_shared/whatsapp-automation.ts";

const configuredGraphVersion = Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v26.0";
const GRAPH_VERSION = /^v\d+\.\d+$/.test(configuredGraphVersion) ? configuredGraphVersion : "v26.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const MAX_BODY_BYTES = 64 * 1024;

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

interface MetaContact { wa_id?: string; profile?: { name?: string } }
interface MetaStatus { id?: string; status?: string }
interface MetaMessage { id?: string; from?: string; type?: string; text?: { body?: string } }
interface MetaChange {
  field?: string;
  value?: {
    metadata?: { phone_number_id?: string };
    contacts?: MetaContact[];
    messages?: MetaMessage[];
    statuses?: MetaStatus[];
  };
}
interface MetaPayload { entry?: Array<{ changes?: MetaChange[] }> }
interface IntakeResult {
  replay: boolean;
  conversation_id: number;
  lead_id: string | null;
  assigned_agent_id: string | null;
  agency_id: string;
  state: string;
  should_respond: boolean;
}
interface PendingAutomation {
  phoneNumberId: string;
  waMessageId: string;
  waId: string;
  body: string;
  agenciaId: string;
  intake: IntakeResult;
  unsupported: boolean;
}

async function obtenerSecreto(agenciaId: string, proveedor: string): Promise<string | null> {
  const { data, error } = await sb.rpc("obtener_secreto_integracion", {
    p_agencia_id: agenciaId,
    p_proveedor: proveedor,
  });
  if (error) throw new Error(`No se pudo leer el secreto ${proveedor}: ${error.message}`);
  return (data as string | null) ?? null;
}

async function obtenerSecretoCanal(phoneNumberId: string): Promise<string | null> {
  const { data, error } = await sb.rpc("obtener_secreto_canal_whatsapp", {
    p_phone_number_id: phoneNumberId,
  });
  if (error) throw new Error(`No se pudo leer la credencial del canal: ${error.message}`);
  return (data as string | null) ?? null;
}

async function preguntarGemini(
  apiKey: string,
  mensaje: string,
  nombreAgencia: string,
): Promise<WhatsAppClassification> {
  const prompt = `Clasifica el mensaje entrante para ${nombreAgencia}. Eres un clasificador, no decides el flujo.\n` +
    `Mensaje: ${JSON.stringify(mensaje)}\n` +
    `Devuelve SOLO JSON válido con: intent (greeting|general_info|property_details|pricing|availability|schedule_visit|offer_or_negotiation|human_request|complaint|legal_or_risk|opt_out|ambiguous|unsupported), confidence (0 a 1), reply (español de México, transparente, máximo 160 caracteres, sin inventar precio/disponibilidad), reason_code y facts_detected {property_mention,timeline,pain_point}. ` +
    `opt_out aplica cuando pide dejar de recibir mensajes. legal_or_risk incluye amenazas, fraude, discriminación o asuntos legales. Si falta contexto usa ambiguous.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            required: ["intent", "confidence", "reply", "reason_code", "facts_detected"],
            properties: {
              intent: {
                type: "STRING",
                enum: ["greeting", "general_info", "property_details", "pricing", "availability", "schedule_visit", "offer_or_negotiation", "human_request", "complaint", "legal_or_risk", "opt_out", "ambiguous", "unsupported"],
              },
              confidence: { type: "NUMBER", minimum: 0, maximum: 1 },
              reply: { type: "STRING", maxLength: 160 },
              reason_code: { type: "STRING", maxLength: 120 },
              facts_detected: {
                type: "OBJECT",
                required: ["property_mention", "timeline", "pain_point"],
                properties: {
                  property_mention: { type: "STRING", nullable: true },
                  timeline: { type: "STRING", nullable: true },
                  pain_point: { type: "STRING", nullable: true },
                },
              },
            },
          },
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini respondió ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof raw !== "string") throw new Error("Gemini no devolvió una clasificación");
  return parseWhatsAppClassification(raw);
}

async function enviarWhatsapp(phoneNumberId: string, token: string, para: string, texto: string): Promise<string> {
  const response = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: para,
      type: "text",
      text: { body: texto.slice(0, 160), preview_url: false },
    }),
  });
  if (!response.ok) throw new Error(`WhatsApp respondió ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  const messageId = data?.messages?.[0]?.id;
  if (typeof messageId !== "string") throw new Error("WhatsApp no devolvió el id del mensaje saliente");
  return messageId;
}

async function registrarSalida(
  agenciaId: string,
  conversationId: number,
  waMessageId: string,
  body: string,
): Promise<void> {
  const { error } = await sb.from("wa_mensajes").insert({
    agencia_id: agenciaId,
    conversacion_id: conversationId,
    direccion: "saliente",
    wa_message_id: waMessageId,
    cuerpo: body,
    autor: "bot",
  });
  if (error) throw new Error(`No se pudo auditar la respuesta saliente: ${error.message}`);
}

async function solicitarHandoff(conversationId: number, reasonCode: string): Promise<void> {
  const { error } = await sb.rpc("solicitar_handoff_whatsapp", {
    p_conversacion_id: conversationId,
    p_reason_code: reasonCode,
  });
  if (error) throw new Error(`No se pudo crear el handoff: ${error.message}`);
}

async function persistirMensaje(
  phoneNumberId: string,
  message: MetaMessage,
  contacts: MetaContact[],
): Promise<PendingAutomation | null> {
  const waMessageId = message.id?.trim();
  const waId = message.from?.trim();
  const unsupported = message.type !== "text";
  const body = unsupported
    ? `[Mensaje ${message.type ?? "desconocido"} recibido; requiere atención humana]`
    : message.text?.body?.trim();
  if (!waMessageId || !waId || !body) throw new Error("Mensaje de Meta incompleto");
  const contactName = contacts.find((contact) => contact.wa_id === waId)?.profile?.name ?? "Contacto de WhatsApp";

  const { data: intakeData, error: intakeError } = await sb.rpc("registrar_mensaje_whatsapp_entrante_v2", {
    p_phone_number_id: phoneNumberId,
    p_wa_message_id: waMessageId,
    p_wa_id: waId,
    p_nombre: contactName,
    p_cuerpo: body,
    p_propiedad_id: null,
  });
  if (intakeError) throw new Error(`La ingesta falló: ${intakeError.message}`);
  const intake = intakeData as IntakeResult;
  if (intake.replay || !intake.should_respond) return null;

  if (typeof intake.agency_id !== "string") throw new Error("No se pudo resolver la oficina tras la ingesta");
  return { phoneNumberId, waMessageId, waId, body, agenciaId: intake.agency_id, intake, unsupported };
}

async function procesarAutomatizacion(work: PendingAutomation): Promise<void> {
  const { phoneNumberId, waMessageId, waId, body, agenciaId, intake, unsupported } = work;
  let whatsappToken: string | null = null;
  let classification: WhatsAppClassification;
  let modelFailed = false;
  if (unsupported) {
    classification = {
      intent: "unsupported",
      confidence: 1,
      reply: "Gracias por escribir. Un asesor continuará contigo en breve.",
      reasonCode: "unsupported_message_type",
      facts: { propertyMention: null, timeline: null, painPoint: null },
    };
    try {
      whatsappToken = await obtenerSecretoCanal(phoneNumberId);
    } catch (error) {
      console.error("[whatsapp-webhook] credencial de WhatsApp no disponible", (error as Error).message);
    }
  } else {
    try {
      const [waToken, geminiKey, agencyResult] = await Promise.all([
        obtenerSecretoCanal(phoneNumberId),
        obtenerSecreto(agenciaId, "gemini"),
        sb.from("agencias").select("nombre").eq("id", agenciaId).single(),
      ]);
      whatsappToken = waToken;
      if (!waToken || !geminiKey) throw new Error("Faltan credenciales activas de WhatsApp o Gemini");
      classification = await preguntarGemini(geminiKey, body, agencyResult.data?.nombre ?? "la inmobiliaria");
    } catch (error) {
      modelFailed = true;
      console.error("[whatsapp-webhook] clasificación no disponible", (error as Error).message);
      classification = {
        intent: "ambiguous",
        confidence: 0,
        reply: "Gracias por escribir. Un asesor continuará contigo en breve.",
        reasonCode: "model_or_credentials_failure",
        facts: { propertyMention: null, timeline: null, painPoint: null },
      };
    }
  }

  const { error: classificationError } = await sb.rpc("registrar_clasificacion_whatsapp", {
    p_conversacion_id: intake.conversation_id,
    p_wa_message_id: waMessageId,
    p_intent: classification.intent,
    p_confidence: classification.confidence,
    p_reason_code: classification.reasonCode,
  });
  if (classificationError) console.error("[whatsapp-webhook] no se auditó la clasificación", classificationError.message);

  const action = modelFailed ? "handoff_immediately" : decideWhatsAppAction(classification);
  if (action === "ignore") {
    if (whatsappToken) {
      const acknowledgement = "Entendido. No volveremos a escribirte por esta conversación.";
      const outgoingId = await enviarWhatsapp(phoneNumberId, whatsappToken, normalizarParaEnvio(waId), acknowledgement);
      await registrarSalida(agenciaId, intake.conversation_id, outgoingId, acknowledgement);
    }
    const { error } = await sb.rpc("bloquear_conversacion_whatsapp", { p_conversacion_id: intake.conversation_id });
    if (error) throw new Error(`No se pudo registrar el opt-out: ${error.message}`);
    return;
  }

  const reply = action === "handoff_immediately"
    ? "Gracias por escribir. Un asesor continuará contigo en breve."
    : classification.reply || "Gracias por escribir. ¿En qué tipo de propiedad estás interesado?";

  if (whatsappToken) {
    try {
      const outgoingId = await enviarWhatsapp(phoneNumberId, whatsappToken, normalizarParaEnvio(waId), reply);
      await registrarSalida(agenciaId, intake.conversation_id, outgoingId, reply);
    } catch (error) {
      console.error("[whatsapp-webhook] respuesta no enviada", (error as Error).message);
      await solicitarHandoff(intake.conversation_id, "whatsapp_delivery_failure");
      return;
    }
  }

  if (action === "respond_and_handoff" || action === "handoff_immediately") {
    await solicitarHandoff(intake.conversation_id, classification.reasonCode);
  }
}

Deno.serve(async (request) => {
  const url = new URL(request.url);

  if (request.method === "GET") {
    if (!VERIFY_TOKEN) return new Response("Webhook no configurado", { status: 503 });
    const valid = url.searchParams.get("hub.mode") === "subscribe"
      && url.searchParams.get("hub.verify_token") === VERIFY_TOKEN;
    return valid
      ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 })
      : new Response("Forbidden", { status: 403 });
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!APP_SECRET) return new Response("Webhook no configurado", { status: 503 });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return new Response("Payload Too Large", { status: 413 });
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return new Response("Payload Too Large", { status: 413 });
  }
  if (!await firmaWhatsAppValida(rawBody, request.headers.get("x-hub-signature-256"), APP_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: MetaPayload;
  try {
    payload = JSON.parse(rawBody) as MetaPayload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const pending: PendingAutomation[] = [];
  let persistenceFailed = false;
  const changes = (payload.entry ?? []).flatMap((entry) => entry.changes ?? []);
  for (const change of changes) {
    if (change.field !== "messages") continue;
    for (const status of change.value?.statuses ?? []) {
      if (!status.id || !status.status) continue;
      const { error } = await sb.rpc("registrar_estado_mensaje_whatsapp", {
        p_wa_message_id: status.id,
        p_estado: status.status,
      });
      if (error) console.error("[whatsapp-webhook] estado no persistido", error.message);
    }
    const phoneNumberId = change.value?.metadata?.phone_number_id;
    const messages = change.value?.messages ?? [];
    if (!phoneNumberId || messages.length === 0) continue;
    for (const message of messages) {
      try {
        const work = await persistirMensaje(phoneNumberId, message, change.value?.contacts ?? []);
        if (work) pending.push(work);
      } catch (error) {
        persistenceFailed = true;
        console.error("[whatsapp-webhook] mensaje no persistido", (error as Error).message);
      }
    }
  }

  if (persistenceFailed) {
    // Meta reintentará. Los mensajes ya persistidos regresarán como replay y
    // no duplicarán leads ni conversaciones.
    return new Response("No se pudo persistir el evento", { status: 500 });
  }
  if (pending.length > 0) {
    const trabajo = Promise.allSettled(pending.map(procesarAutomatizacion)).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[whatsapp-webhook] automatización no completada", String(result.reason));
        }
      }
    });
    // El identificador global `EdgeRuntime` no viene tipado por el .d.ts de
    // functions-js que resuelve el CI, y `deno check` fallaba con TS2304. Se
    // lee desde globalThis con su tipo declarado aquí: type-checkea sin
    // depender de ese paquete y mantiene el mismo comportamiento en Supabase.
    // Si el runtime no lo expone (ejecución local), se espera el trabajo antes
    // de responder en vez de perderlo.
    const runtime = (globalThis as {
      EdgeRuntime?: { waitUntil(promesa: Promise<unknown>): void };
    }).EdgeRuntime;
    if (runtime) runtime.waitUntil(trabajo);
    else await trabajo;
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
