import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), "utf8");

describe("arquitectura de integración", () => {
  it("no expone service_role ni el secreto de n8n en el frontend", () => {
    const frontend = [
      leer("src/lib/supabaseClient.ts"),
      leer("src/lib/dataStore.ts"),
      leer("src/lib/leadService.ts"),
    ].join("\n");
    expect(frontend).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(frontend).not.toContain("N8N_INGEST_SECRET");
  });

  it("protege la entrada externa con secreto, límite de tamaño y RPC central", () => {
    const edge = leer("supabase/functions/ingest-lead/index.ts");
    expect(edge).toContain('request.headers.get("x-webhook-secret")');
    expect(edge).toContain("MAX_BODY_BYTES");
    expect(edge).toContain('supabase.rpc("crear_o_relacionar_lead"');
    expect(edge).not.toMatch(/console\.(info|warn|error)\([^\n]*(phone|email|message)/i);
  });

  it("mantiene adapters server-side fuera de React y deriva el tenant de una credencial", () => {
    const inbound = leer("supabase/functions/integration-inbound/index.ts");
    const dispatcher = leer("supabase/functions/dispatch-webhooks/index.ts");
    const webhookContract = leer("supabase/functions/_shared/webhook.ts");
    const migration = leer("supabase/migrations/20260823000100_p31_integration_foundation.sql");
    expect(inbound).toContain('authorization.startsWith("HabitatKey ")');
    expect(inbound).toContain('client.rpc("process_integration_lead_command"');
    expect(inbound).not.toMatch(/from\(["'](leads|propiedades|citas)["']\)/);
    expect(dispatcher).toContain("createWebhookDeliveryRequest");
    expect(webhookContract).toContain("X-Habitat-Signature");
    expect(dispatcher).toContain("AbortSignal.timeout");
    expect(migration).toContain("v_credential.agencia_id");
    expect(migration).not.toMatch(/VITE_.*SECRET/);
  });
});
