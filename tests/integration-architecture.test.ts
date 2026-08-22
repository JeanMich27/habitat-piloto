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
});
