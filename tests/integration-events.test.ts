import { describe, expect, it } from "vitest";
import {
  createDomainEvent,
  serializeDomainEvent,
} from "../src/integrations/contracts/domainEvent";
import { parseInboundEnvelope } from "../src/integrations/contracts/commands";
import {
  deliveryDecision,
  createWebhookDeliveryRequest,
  normalizeDeliveryError,
  signWebhook,
  verifyWebhookSignature,
} from "../supabase/functions/_shared/webhook";

describe("contrato de eventos de integración", () => {
  it("genera un evento v1 trazable y explícitamente multi-tenant", () => {
    const event = createDomainEvent({
      id: "00000000-0000-4000-8000-000000000001",
      type: "lead.created",
      agencyId: "agency-a",
      entityType: "lead",
      entityId: "lead-1",
      correlationId: "00000000-0000-4000-8000-000000000002",
      occurredAt: "2026-08-23T12:00:00.000Z",
      payload: { leadId: "lead-1" },
    });
    expect(event.version).toBe(1);
    expect(event.agencyId).toBe("agency-a");
    expect(JSON.parse(serializeDomainEvent(event))).toEqual(event);
  });

  it("rechaza eventos multi-tenant sin agencia", () => {
    expect(() => createDomainEvent({
      type: "lead.updated",
      agencyId: " ",
      entityType: "lead",
      entityId: "lead-1",
      payload: {},
    })).toThrow("agencyId");
  });
});

describe("frontera inbound", () => {
  it("normaliza un envelope externo a un command interno", () => {
    const envelope = parseInboundEnvelope({
      provider: "mock",
      externalEventId: "external-1",
      correlationId: "trace-1",
      command: { type: "CreateLead", payload: { name: "Ada", source: "mock", phone: "5512345678" } },
    });
    expect(envelope.command.type).toBe("CreateLead");
    expect(envelope.command.payload.name).toBe("Ada");
  });

  it("rechaza commands no soportados antes del dominio", () => {
    expect(() => parseInboundEnvelope({
      provider: "mock",
      externalEventId: "external-1",
      command: { type: "WriteSql", payload: {} },
    })).toThrow("Unsupported command");
  });
});

describe("firma y retry de webhooks", () => {
  it("firma el body raw con timestamp y detecta manipulación o replay", async () => {
    const timestamp = "1787500000";
    const nowMs = Number(timestamp) * 1000;
    const signature = await signWebhook("secret", timestamp, '{"ok":true}');
    await expect(verifyWebhookSignature({
      secret: "secret", timestamp, rawBody: '{"ok":true}', signature, nowMs,
    })).resolves.toBe(true);
    await expect(verifyWebhookSignature({
      secret: "secret", timestamp, rawBody: '{"ok":false}', signature, nowMs,
    })).resolves.toBe(false);
    await expect(verifyWebhookSignature({
      secret: "secret", timestamp, rawBody: '{"ok":true}', signature, nowMs: nowMs + 301_000,
    })).resolves.toBe(false);
  });

  it("reintenta timeouts, 429 y 5xx con backoff limitado", () => {
    expect(deliveryDecision(1)).toEqual({ outcome: "retry", delaySeconds: 60 });
    expect(deliveryDecision(2, 429)).toEqual({ outcome: "retry", delaySeconds: 300 });
    expect(deliveryDecision(4, 503)).toEqual({ outcome: "retry", delaySeconds: 3600 });
    expect(deliveryDecision(5, 503)).toEqual({ outcome: "failed" });
    expect(deliveryDecision(1, 401)).toEqual({ outcome: "failed" });
    expect(deliveryDecision(1, 204)).toEqual({ outcome: "success" });
  });

  it("normaliza errores sin conservar URLs ni mensajes ilimitados", () => {
    const normalized = normalizeDeliveryError(new Error(`fetch https://secret.example/hook?token=abc failed ${"x".repeat(600)}`));
    expect(normalized).not.toContain("secret.example");
    expect(normalized.length).toBeLessThanOrEqual(500);
  });

  it("entrega lead.created a un receptor mock con body y trazabilidad verificables", async () => {
    const event = {
      id: "event-1",
      type: "lead.created",
      version: 1,
      occurredAt: "2026-08-23T12:00:00.000Z",
      agencyId: "agency-a",
      entityType: "lead",
      entityId: "lead-1",
      correlationId: "trace-1",
      payload: { lead_id: "lead-1" },
    };
    const request = await createWebhookDeliveryRequest({
      event,
      eventType: "lead.created",
      eventVersion: 1,
      deliveryId: "delivery-1",
      correlationId: "trace-1",
      secret: "mock-secret",
      nowMs: 1_787_500_000_000,
    });
    const mockReceiver = async (rawBody: string, headers: Record<string, string>) => ({
      body: JSON.parse(rawBody) as Record<string, unknown>,
      signatureValid: await verifyWebhookSignature({
        secret: "mock-secret",
        timestamp: headers["X-Habitat-Timestamp"],
        rawBody,
        signature: headers["X-Habitat-Signature"],
        nowMs: 1_787_500_000_000,
      }),
      eventHeader: headers["X-Habitat-Event"],
      deliveryHeader: headers["X-Habitat-Delivery"],
      correlationHeader: headers["X-Correlation-ID"],
    });
    const received = await mockReceiver(request.rawBody, request.headers);
    expect(received.body).toMatchObject({ type: "lead.created", agencyId: "agency-a" });
    expect(received.signatureValid).toBe(true);
    expect(received.eventHeader).toBe("lead.created.v1");
    expect(received.deliveryHeader).toBe("delivery-1");
    expect(received.correlationHeader).toBe("trace-1");
  });
});
