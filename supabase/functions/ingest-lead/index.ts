import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_BODY_BYTES = 16 * 1024;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function firma(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function secretoValido(recibido: string, esperado: string): Promise<boolean> {
  if (!recibido || !esperado) return false;
  const [a, b] = await Promise.all([firma(recibido), firma(esperado)]);
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i += 1) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST") return json(405, { ok: false, request_id: requestId });

  const esperado = Deno.env.get("N8N_INGEST_SECRET") ?? "";
  if (!(await secretoValido(request.headers.get("x-webhook-secret") ?? "", esperado))) {
    console.warn("[ingest-lead] unauthorized", { requestId });
    return json(401, { ok: false, error: "No autorizado", request_id: requestId });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "Payload demasiado grande", request_id: requestId });
  }

  let input: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json(413, { ok: false, error: "Payload demasiado grande", request_id: requestId });
    }
    input = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: "JSON inválido", request_id: requestId });
  }

  const agenciaId = Deno.env.get("N8N_AGENCIA_ID") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!agenciaId || !supabaseUrl || !serviceRole) {
    console.error("[ingest-lead] missing_configuration", { requestId });
    return json(503, { ok: false, error: "Integración no configurada", request_id: requestId });
  }

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("crear_o_relacionar_lead", {
    p_input: input,
    p_agencia_id: agenciaId,
  });

  if (error) {
    const esValidacion = error.code === "22023" || error.code === "23503" || error.code === "P0001";
    console.error("[ingest-lead] rejected", { requestId, code: error.code });
    return json(esValidacion ? 422 : 500, {
      ok: false,
      error: esValidacion ? error.message : "No se pudo procesar el lead",
      request_id: requestId,
    });
  }

  const resultado = data as { lead_id?: string; created?: boolean } | null;
  console.info("[ingest-lead] accepted", { requestId, created: resultado?.created === true });
  return json(resultado?.created ? 201 : 200, {
    ok: true,
    lead_id: resultado?.lead_id,
    created: resultado?.created === true,
    request_id: requestId,
  });
});
