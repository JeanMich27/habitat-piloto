const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function signWebhook(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  return `v1=${toHex(new Uint8Array(signature))}`;
}

export async function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const timestampMs = Number(input.timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) return false;
  const tolerance = (input.toleranceSeconds ?? 300) * 1000;
  if (Math.abs((input.nowMs ?? Date.now()) - timestampMs) > tolerance) return false;
  const expected = await signWebhook(input.secret, input.timestamp, input.rawBody);
  return constantTimeEqual(expected, input.signature);
}

export type DeliveryDecision =
  | { outcome: "success" }
  | { outcome: "retry"; delaySeconds: number }
  | { outcome: "failed" };

const RETRY_DELAYS_SECONDS = [60, 300, 900, 3600] as const;

export function deliveryDecision(attempt: number, status?: number): DeliveryDecision {
  if (status != null && status >= 200 && status < 300) return { outcome: "success" };
  const retryable = status == null || status === 408 || status === 425 || status === 429 || status >= 500;
  if (!retryable || attempt > RETRY_DELAYS_SECONDS.length) return { outcome: "failed" };
  return { outcome: "retry", delaySeconds: RETRY_DELAYS_SECONDS[attempt - 1] };
}

export function normalizeDeliveryError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown delivery error";
  return message.replace(/https?:\/\/[^\s]+/g, "[redacted-url]").slice(0, 500);
}
