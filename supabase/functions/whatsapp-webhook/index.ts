// ============================================================
// whatsapp-webhook
// Receptor del webhook de WhatsApp Cloud API (Meta oficial).
// Piloto de demo — decisión: decision-demo-whatsapp-multitenant.md
//
// Dos modos, mismo endpoint:
//   GET  → handshake de verificación de Meta (hub.challenge)
//   POST → mensajes entrantes reales
//
// Seguridad:
//   - verify_jwt = false a propósito: Meta llama sin sesión de Supabase,
//     igual que agenda-ics. La autenticación la hace este código:
//       * GET: el verify_token debe coincidir con WHATSAPP_VERIFY_TOKEN.
//       * POST: la firma X-Hub-Signature-256 (HMAC-SHA256 con el App
//         Secret) debe coincidir con el cuerpo crudo de la petición.
//   - Sin agencia mapeada (agencia_por_phone_number_id) el mensaje se
//     registra en el log y se descarta: no hay a quién asignarlo.
//   - Los tokens (WhatsApp, Gemini) viven en Vault por oficina
//     (agencia_integraciones + guardar_secreto_integracion / lectura vía
//     obtener_secreto_integracion), nunca en el código. El verify token
//     del webhook y el App Secret sí son secretos de función (Deno.env),
//     porque el webhook de Meta se registra por App, no por oficina.
//
// No usa n8n ni ningún hosting aparte: es la lógica estable en Edge
// Functions desde el día 1, como ya define
// decision-demo-whatsapp-multitenant.md — sin este atajo, el piloto se
// habría construido dos veces.
//
// 2026-08-25: GEMINI_MODEL actualizado de gemini-2.0-flash (deprecado por
// Google, HTTP 404 en el primer mensaje real de prueba) a gemini-3.6-flash,
// el reemplazo indicado por el propio error de la API de Gemini.
//
// 2026-08-25 (2): normalizarParaEnvio agregado. WhatsApp entrega el wa_id
// de números mexicanos con un "1" heredado después del 521 (13 dígitos:
// 521XXXXXXXXXX), pero la Graph API rechaza el envío a ese mismo formato
// con error 131030 "Recipient phone number not in allowed list" — hay que
// enviar sin ese dígito (52XXXXXXXXXX, 12 dígitos).
//
// 2026-08-25 (3): deduplicación por wa_message_id. Meta reintenta la
// entrega del webhook si no recibe 200 a tiempo, reenviando el mismo
// mensaje con el mismo msg.id. Sin chequeo, cada reintento generaba una
// llamada nueva a Gemini y una respuesta duplicada al mismo prospecto
// (confirmado en vivo: 2 mensajes entrantes → 3 salientes). Ahora se
// verifica primero si msg.id ya existe en wa_mensajes (entrante) antes de
// procesar; si ya existe, se descarta el reintento sin llamar a Gemini.
//
// 2026-08-25 (4): commiteado al repo. Estuvo desplegado directo en
// HABITAT DEV vía MCP de Supabase desde su creación (13 ago) — deuda
// técnica dejada a propósito y documentada en
// decision-demo-whatsapp-multitenant.md. Este commit lo integra al mismo
// pipeline de CI (`supabase-dev.yml` + `scripts/supabase-dev.sh`) que ya
// usan generate-document/download-document/share-document, para que deje
// de ser la pieza huérfana que causó incidente-publicacion-rama-equivocada.md.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function normalizarTelefono(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// El wa_id que llega en messages[].from puede traer el "1" heredado de
// México/Argentina (521XXXXXXXXXX / 549XXXXXXXXXX) que la Graph API no
// acepta como destinatario de envío. Se quita solo ese caso conocido;
// cualquier otro país se manda tal cual llegó.
function normalizarParaEnvio(waId: string): string {
  if (/^521\d{10}$/.test(waId)) return "52" + waId.slice(3);
  return waId;
}

async function verificarFirma(body: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET) {
    console.warn("[whatsapp-webhook] WHATSAPP_APP_SECRET no configurado: firma no verificada todavía");
    return true; // no bloquear el piloto antes de que Jean cargue el secreto; queda loggeado para no olvidarlo
  }
  if (!header || !header.startsWith("sha256=")) return false;
  const esperada = header.slice(7);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const calculada = Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (calculada.length !== esperada.length) return false;
  let diff = 0;
  for (let i = 0; i < calculada.length; i++) diff |= calculada.charCodeAt(i) ^ esperada.charCodeAt(i);
  return diff === 0;
}

async function obtenerSecreto(agenciaId: string, proveedor: string): Promise<string | null> {
  const { data, error } = await sb.rpc("obtener_secreto_integracion", {
    p_agencia_id: agenciaId, p_proveedor: proveedor,
  });
  if (error) { console.error(`[whatsapp-webhook] obtener_secreto_integracion(${proveedor})`, error); return null; }
  return (data as string) ?? null;
}

async function obtenerConfig(agenciaId: string, proveedor: string): Promise<Record<string, unknown> | null> {
  const { data } = await sb.from("agencia_integraciones").select("config")
    .eq("agencia_id", agenciaId).eq("proveedor", proveedor).eq("activo", true).maybeSingle();
  return (data?.config as Record<string, unknown>) ?? null;
}

async function preguntarGemini(apiKey: string, mensaje: string, nombreAgencia: string): Promise<{ respuesta: string; intencionCompra: boolean }> {
  const prompt = `Eres el primer contacto automático de WhatsApp de ${nombreAgencia}, una inmobiliaria. ` +
    `Un prospecto acaba de escribir: "${mensaje}". ` +
    `Responde en español de México, cálido y breve (máximo 3 líneas), agradece el interés, y si el mensaje no lo dice ya, pregunta qué tipo de propiedad busca o qué propiedad vio. ` +
    `Si es previsible que sea su primer mensaje, acláralo con transparencia: eres un asistente automático y en breve un asesor humano puede sumarse. ` +
    `Nunca inventes precios, disponibilidad ni datos de una propiedad específica. ` +
    `Responde SOLO con JSON válido de la forma {"respuesta": "...", "intencion_compra": true|false} — intencion_compra en true solo si pregunta precio, quiere agendar visita o dice que quiere comprar/rentar ya.`;

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
      }),
    },
  );
  if (!r.ok) throw new Error(`Gemini respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  try {
    const parsed = JSON.parse(texto);
    return {
      respuesta: String(parsed.respuesta ?? "Gracias por escribir, en breve te contactamos.").slice(0, 800),
      intencionCompra: Boolean(parsed.intencion_compra),
    };
  } catch {
    return { respuesta: "Gracias por escribir, en breve te contactamos.", intencionCompra: false };
  }
}

async function enviarWhatsapp(phoneNumberId: string, token: string, para: string, texto: string): Promise<string | null> {
  const r = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: para, type: "text",
      text: { body: texto, preview_url: false },
    }),
  });
  if (!r.ok) {
    console.error("[whatsapp-webhook] envío falló", r.status, (await r.text()).slice(0, 300));
    return null;
  }
  const data = await r.json();
  return data?.messages?.[0]?.id ?? null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- Handshake de verificación (Meta lo llama al guardar el webhook) ---
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (modo === "subscribe" && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const cuerpoCrudo = await req.text();
  const firmaValida = await verificarFirma(cuerpoCrudo, req.headers.get("x-hub-signature-256"));
  if (!firmaValida) {
    console.error("[whatsapp-webhook] firma inválida");
    return new Response("Forbidden", { status: 403 });
  }

  let payload: any;
  try { payload = JSON.parse(cuerpoCrudo); } catch { return new Response("Bad Request", { status: 400 }); }

  // Meta exige 200 rápido y reintenta si no lo recibe. Un error de un
  // mensaje no debe tumbar los demás ni provocar reintentos en loop.
  const cambios = (payload.entry ?? []).flatMap((e: any) => e.changes ?? []);

  for (const cambio of cambios) {
    if (cambio.field !== "messages") continue;
    const valor = cambio.value ?? {};
    const phoneNumberId = valor.metadata?.phone_number_id;
    const mensajes = valor.messages ?? [];
    if (!phoneNumberId || mensajes.length === 0) continue; // statuses (entregado/leído) llegan sin "messages"

    const { data: agenciaId } = await sb.rpc("agencia_por_phone_number_id", { p_phone_number_id: phoneNumberId });
    if (!agenciaId) {
      console.warn("[whatsapp-webhook] phone_number_id sin oficina asignada", phoneNumberId);
      continue;
    }

    const contactos = valor.contacts ?? [];

    for (const msg of mensajes) {
      try {
        if (msg.type !== "text") {
          console.log("[whatsapp-webhook] tipo de mensaje no manejado en el piloto:", msg.type);
          continue;
        }

        // 0) Deduplicar reintentos de Meta: mismo msg.id ya procesado antes.
        if (msg.id) {
          const { data: yaExiste } = await sb.from("wa_mensajes")
            .select("id").eq("wa_message_id", msg.id).eq("direccion", "entrante").maybeSingle();
          if (yaExiste) {
            console.log("[whatsapp-webhook] reintento de Meta descartado, ya procesado:", msg.id);
            continue;
          }
        }

        const telefonoNorm = normalizarTelefono(msg.from);
        const nombreContacto = contactos.find((c: any) => c.wa_id === msg.from)?.profile?.name ?? null;
        const cuerpo = msg.text?.body ?? "";

        // 1) Conversación: se abre o se refresca la ventana de servicio de 24h.
        const { data: conv } = await sb.from("wa_conversaciones")
          .select("id, estado, lead_id")
          .eq("agencia_id", agenciaId).eq("telefono_norm", telefonoNorm).maybeSingle();

        let conversacionId: number;
        let estado: string;
        let leadId: string | null;

        if (conv) {
          conversacionId = conv.id; estado = conv.estado; leadId = conv.lead_id;
          await sb.from("wa_conversaciones").update({
            ventana_expira_en: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            actualizado: new Date().toISOString(),
          }).eq("id", conversacionId);
        } else {
          const ins = await sb.from("wa_conversaciones").insert({
            agencia_id: agenciaId, telefono_norm: telefonoNorm, estado: "bot",
            ventana_expira_en: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          }).select("id").single();
          conversacionId = ins.data!.id; estado = "bot"; leadId = null;
        }

        // 2) Log del mensaje entrante — se guarda siempre, aunque el bot no responda.
        await sb.from("wa_mensajes").insert({
          agencia_id: agenciaId, conversacion_id: conversacionId, direccion: "entrante",
          wa_message_id: msg.id ?? null, cuerpo, autor: "usuario",
        });

        // 3) Lead: se crea la primera vez que esta persona escribe.
        if (!leadId) {
          const nuevoLeadId = `wa-${crypto.randomUUID().slice(0, 8)}`;
          const insLead = await sb.from("leads").insert({
            id: nuevoLeadId, agencia_id: agenciaId,
            nombre: nombreContacto || `WhatsApp ${telefonoNorm}`,
            telefono: msg.from, origen: "WhatsApp",
            nota: "Alta automática — piloto de bot de WhatsApp.",
          }).select("id").maybeSingle();
          if (insLead.data?.id) {
            leadId = insLead.data.id;
            await sb.from("wa_conversaciones").update({ lead_id: leadId }).eq("id", conversacionId);
          }
        }

        // 4) Si un humano ya tomó la conversación, el bot se calla.
        if (estado === "humano") continue;

        const [config, waToken, geminiKey] = await Promise.all([
          obtenerConfig(agenciaId, "whatsapp"),
          obtenerSecreto(agenciaId, "whatsapp"),
          obtenerSecreto(agenciaId, "gemini"),
        ]);
        void config; // reservado: hoy no se usa, pero documenta que el phone_number_id ya llega en el propio payload de Meta
        if (!waToken || !geminiKey) {
          console.warn("[whatsapp-webhook] faltan credenciales de whatsapp/gemini para", agenciaId);
          continue;
        }

        const { data: agencia } = await sb.from("agencias").select("nombre").eq("id", agenciaId).maybeSingle();
        const { respuesta, intencionCompra } = await preguntarGemini(geminiKey, cuerpo, agencia?.nombre ?? "la inmobiliaria");

        const waMessageId = await enviarWhatsapp(phoneNumberId, waToken, normalizarParaEnvio(msg.from), respuesta);
        await sb.from("wa_mensajes").insert({
          agencia_id: agenciaId, conversacion_id: conversacionId, direccion: "saliente",
          wa_message_id: waMessageId, cuerpo: respuesta, autor: "bot",
        });

        // 5) Intención de compra/precio → handoff a humano + aviso a la oficina.
        if (intencionCompra) {
          await sb.from("wa_conversaciones").update({ estado: "humano" }).eq("id", conversacionId);
          const { data: destinatarios } = await sb.from("usuarios").select("id")
            .eq("agencia_id", agenciaId).eq("rol", "broker").eq("estado_cuenta", "Activo");
          for (const d of destinatarios ?? []) {
            await sb.from("notificaciones").insert({
              agencia_id: agenciaId, destinatario_id: d.id, tipo: "whatsapp_handoff",
              titulo: "Un prospecto de WhatsApp pide atención humana",
              cuerpo: `${nombreContacto || telefonoNorm} preguntó por precio o visita. Conversación #${conversacionId}.`,
              datos: { conversacion_id: conversacionId, lead_id: leadId },
            });
          }
        }
      } catch (e) {
        console.error("[whatsapp-webhook] error procesando mensaje", (e as Error).message);
      }
    }
  }

  // Siempre 200: Meta reintenta el webhook entero si no lo recibe, y el
  // error de un mensaje individual ya quedó en logs arriba.
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
});
