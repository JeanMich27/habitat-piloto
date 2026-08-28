import { describe, expect, it } from "vitest";
import {
  decideWhatsAppAction,
  firmaWhatsAppValida,
  normalizarParaEnvio,
  parseWhatsAppClassification,
} from "../supabase/functions/_shared/whatsapp-automation";

const classification = (intent: string, confidence = 0.9) =>
  parseWhatsAppClassification(JSON.stringify({
    intent,
    confidence,
    reply: "Gracias por escribir",
    reason_code: `intent_${intent}`,
    facts_detected: { property_mention: null, timeline: null, pain_point: null },
  }));

describe("reglas operativas de WhatsApp", () => {
  it("deja saludos en bot y escala señales comerciales", () => {
    expect(decideWhatsAppAction(classification("greeting"))).toBe("respond_only");
    expect(decideWhatsAppAction(classification("pricing"))).toBe("respond_and_handoff");
    expect(decideWhatsAppAction(classification("schedule_visit"))).toBe("handoff_immediately");
    expect(decideWhatsAppAction(classification("complaint"))).toBe("handoff_immediately");
  });

  it("escala baja confianza y respeta opt-out", () => {
    expect(decideWhatsAppAction(classification("general_info", 0.5))).toBe("respond_and_handoff");
    expect(decideWhatsAppAction(classification("opt_out"))).toBe("ignore");
  });

  it("rechaza JSON fuera del contrato", () => {
    expect(() => classification("invented_intent")).toThrow(/intent no permitido/);
    expect(() => classification("greeting", 2)).toThrow(/fuera de rango/);
  });

  it("usa el teléfono del contacto y corrige el prefijo mexicano heredado", () => {
    expect(normalizarParaEnvio("5215512345678")).toBe("525512345678");
    expect(normalizarParaEnvio("+1 (415) 555-0123")).toBe("14155550123");
  });

  it("valida HMAC y falla cerrado sin secreto", async () => {
    const body = '{"object":"whatsapp_business_account"}';
    const secret = "test-app-secret";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const hex = Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(await firmaWhatsAppValida(body, `sha256=${hex}`, secret)).toBe(true);
    expect(await firmaWhatsAppValida(`${body} `, `sha256=${hex}`, secret)).toBe(false);
    expect(await firmaWhatsAppValida(body, `sha256=${hex}`, "")).toBe(false);
  });
});
