export const WHATSAPP_INTENTS = [
  "greeting",
  "general_info",
  "property_details",
  "pricing",
  "availability",
  "schedule_visit",
  "offer_or_negotiation",
  "human_request",
  "complaint",
  "legal_or_risk",
  "opt_out",
  "ambiguous",
  "unsupported",
] as const;

export type WhatsAppIntent = (typeof WHATSAPP_INTENTS)[number];
export type WhatsAppAction = "respond_only" | "respond_and_handoff" | "handoff_immediately" | "ignore";

export interface WhatsAppClassification {
  intent: WhatsAppIntent;
  confidence: number;
  reply: string;
  reasonCode: string;
  facts: {
    propertyMention: string | null;
    timeline: string | null;
    painPoint: string | null;
  };
}

const isIntent = (value: unknown): value is WhatsAppIntent =>
  typeof value === "string" && (WHATSAPP_INTENTS as readonly string[]).includes(value);

const shortText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const nullableText = (value: unknown, max: number): string | null => {
  const valueAsText = shortText(value, max);
  return valueAsText || null;
};

export function parseWhatsAppClassification(raw: string): WhatsAppClassification {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!isIntent(parsed.intent)) throw new Error("Gemini devolvió un intent no permitido");
  const confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Gemini devolvió confidence fuera de rango");
  }
  const facts = (parsed.facts_detected ?? {}) as Record<string, unknown>;
  return {
    intent: parsed.intent,
    confidence,
    reply: shortText(parsed.reply, 160),
    reasonCode: shortText(parsed.reason_code, 120) || parsed.intent,
    facts: {
      propertyMention: nullableText(facts.property_mention, 160),
      timeline: nullableText(facts.timeline, 120),
      painPoint: nullableText(facts.pain_point, 240),
    },
  };
}

/** La aplicación decide. El modelo únicamente clasifica. */
export function decideWhatsAppAction(classification: WhatsAppClassification): WhatsAppAction {
  if (classification.intent === "opt_out") return "ignore";
  if (classification.confidence < 0.65 || classification.intent === "ambiguous") {
    return "respond_and_handoff";
  }
  if (["greeting", "general_info"].includes(classification.intent)) return "respond_only";
  if (["property_details", "pricing", "availability"].includes(classification.intent)) {
    return "respond_and_handoff";
  }
  return "handoff_immediately";
}

export function normalizarParaEnvio(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  if (/^521\d{10}$/.test(digits)) return `52${digits.slice(3)}`;
  return digits;
}

export async function firmaWhatsAppValida(
  body: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice(7).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const calculated = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let difference = 0;
  for (let index = 0; index < calculated.length; index += 1) {
    difference |= calculated.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
