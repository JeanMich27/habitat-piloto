import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createWebhookDeliveryRequest, deliveryDecision, normalizeDeliveryError } from "../_shared/webhook.ts";

interface ClaimedDelivery {
  delivery_id: string;
  endpoint_url: string;
  signing_secret: string;
  event_id: string;
  event_type: string;
  event_version: number;
  occurred_at: string;
  agency_id: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  causation_id?: string;
  attempt: number;
}

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function sameSecret(received: string, expected: string): Promise<boolean> {
  if (!received || !expected) return false;
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [left, right] = await Promise.all([digest(received), digest(expected)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST") return json(405, { ok: false, request_id: requestId });
  const expected = Deno.env.get("INTEGRATION_DISPATCH_SECRET") ?? "";
  if (!(await sameSecret(request.headers.get("x-dispatch-secret") ?? "", expected))) {
    console.warn("[dispatch-webhooks] unauthorized", { requestId });
    return json(401, { ok: false, request_id: requestId });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return json(503, { ok: false, request_id: requestId });
  const client = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("claim_webhook_deliveries", { p_limit: 20 });
  if (error) {
    console.error("[dispatch-webhooks] claim_failed", { requestId, code: error.code });
    return json(500, { ok: false, request_id: requestId });
  }

  const deliveries = (data ?? []) as ClaimedDelivery[];
  await Promise.all(deliveries.map(async (delivery) => {
    const started = Date.now();
    let status: number | undefined;
    let deliveryError: string | undefined;
    try {
      const event = {
        id: delivery.event_id,
        type: delivery.event_type,
        version: delivery.event_version,
        occurredAt: delivery.occurred_at,
        agencyId: delivery.agency_id,
        entityType: delivery.entity_type,
        entityId: delivery.entity_id,
        correlationId: delivery.correlation_id,
        causationId: delivery.causation_id,
        payload: delivery.payload,
      };
      const outbound = await createWebhookDeliveryRequest({
        event,
        eventType: delivery.event_type,
        eventVersion: delivery.event_version,
        deliveryId: delivery.delivery_id,
        correlationId: delivery.correlation_id,
        secret: delivery.signing_secret,
      });
      const response = await fetch(delivery.endpoint_url, {
        method: "POST",
        headers: outbound.headers,
        body: outbound.rawBody,
        signal: AbortSignal.timeout(10_000),
      });
      status = response.status;
      if (!response.ok) deliveryError = `HTTP ${response.status}`;
    } catch (error) {
      deliveryError = normalizeDeliveryError(error);
    }
    const decision = deliveryDecision(delivery.attempt, status);
    const { error: completionError } = await client.rpc("complete_webhook_delivery", {
      p_delivery_id: delivery.delivery_id,
      p_outcome: decision.outcome,
      p_status: status,
      p_error: deliveryError,
      p_retry_delay_seconds: decision.outcome === "retry" ? decision.delaySeconds : undefined,
      p_duration_ms: Date.now() - started,
    });
    if (completionError) {
      console.error("[dispatch-webhooks] completion_failed", {
        requestId,
        deliveryId: delivery.delivery_id,
        code: completionError.code,
      });
    }
  }));

  return json(200, { ok: true, claimed: deliveries.length, request_id: requestId });
});
