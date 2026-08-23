import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_BODY_BYTES = 16 * 1024;

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

interface LeadPayload {
  name: string;
  source: string;
  phone?: string;
  email?: string;
  origin?: string;
  propertyId?: string;
  message?: string;
  assignedAgentId?: string;
  occupation?: string;
}

interface Envelope {
  provider: string;
  externalEventId: string;
  correlationId: string;
  command: { type: "CreateLead"; payload: LeadPayload };
}

function parseEnvelope(value: unknown, correlationId: string): Envelope {
  if (!value || typeof value !== "object") throw new Error("Envelope inválido");
  const input = value as Record<string, unknown>;
  const command = input.command as Record<string, unknown> | undefined;
  const payload = command?.payload as Record<string, unknown> | undefined;
  if (typeof input.provider !== "string" || !/^[a-z0-9_-]{1,40}$/.test(input.provider)) {
    throw new Error("Provider inválido");
  }
  if (typeof input.externalEventId !== "string" || input.externalEventId.length < 1 || input.externalEventId.length > 200) {
    throw new Error("externalEventId inválido");
  }
  if (command?.type !== "CreateLead" || !payload || typeof payload.name !== "string" || !payload.name.trim()) {
    throw new Error("Command no soportado");
  }
  if (typeof payload.source !== "string" || !payload.source.trim()) throw new Error("source requerido");
  const optional = (key: string) => typeof payload[key] === "string" ? payload[key] as string : undefined;
  return {
    provider: input.provider,
    externalEventId: input.externalEventId,
    correlationId,
    command: {
      type: "CreateLead",
      payload: {
        name: payload.name,
        source: payload.source,
        phone: optional("phone"),
        email: optional("email"),
        origin: optional("origin"),
        propertyId: optional("propertyId"),
        message: optional("message"),
        assignedAgentId: optional("assignedAgentId"),
        occupation: optional("occupation"),
      },
    },
  };
}

Deno.serve(async (request) => {
  const correlationId = request.headers.get("x-correlation-id") ?? crypto.randomUUID();
  if (request.method !== "POST") return json(405, { ok: false, correlation_id: correlationId });
  const authorization = request.headers.get("authorization") ?? "";
  const apiKey = authorization.startsWith("HabitatKey ") ? authorization.slice(11).trim() : "";
  if (!apiKey) return json(401, { ok: false, error: "No autorizado", correlation_id: correlationId });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return json(413, { ok: false, error: "Payload demasiado grande", correlation_id: correlationId });

  let envelope: Envelope;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("Payload demasiado grande");
    envelope = parseEnvelope(JSON.parse(raw), correlationId);
  } catch (error) {
    return json(400, { ok: false, error: error instanceof Error ? error.message : "JSON inválido", correlation_id: correlationId });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    console.error("[integration-inbound] missing_configuration", { correlationId });
    return json(503, { ok: false, error: "Integración no configurada", correlation_id: correlationId });
  }

  const client = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const payload = envelope.command.payload;
  const { data, error } = await client.rpc("process_integration_lead_command", {
    p_provider: envelope.provider,
    p_api_key: apiKey,
    p_external_event_id: envelope.externalEventId,
    p_correlation_id: envelope.correlationId,
    p_input: {
      name: payload.name,
      source: payload.source,
      phone: payload.phone,
      email: payload.email,
      origin: payload.origin,
      property_id: payload.propertyId,
      message: payload.message,
      assigned_agent_id: payload.assignedAgentId,
      occupation: payload.occupation,
    },
  });

  if (error) {
    console.error("[integration-inbound] processing_failed", { correlationId, code: error.code });
    return json(500, { ok: false, error: "No se pudo procesar", correlation_id: correlationId });
  }
  const result = data as { ok?: boolean; error_code?: string; idempotent_replay?: boolean } | null;
  if (!result?.ok) {
    const unauthorized = result?.error_code === "unauthorized";
    console.warn("[integration-inbound] rejected", { correlationId, code: result?.error_code });
    return json(unauthorized ? 401 : 422, { ...result, correlation_id: correlationId });
  }
  console.info("[integration-inbound] accepted", { correlationId, replay: result.idempotent_replay === true });
  return json(200, { ...result, correlation_id: correlationId });
});

