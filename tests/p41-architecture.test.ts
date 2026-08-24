import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("arquitectura de documentos P4.1", () => {
  it("mantiene UI → Application → Repository", () => {
    expect(read("src/App.tsx")).toContain("./app/application/documentActions");
    expect(read("src/app/application/documentActions.ts")).toContain("repositories/documentsRepository");
    expect(read("src/views/DetalleDePropiedad.tsx")).not.toMatch(/supabase\.|functions\.invoke/);
  });

  it("no expone service role, rutas privadas ni token plano en el frontend", () => {
    const frontend = ["src/repositories/documentsRepository.ts", "src/app/application/documentActions.ts", "src/components/GeneratePropertySheetModal.tsx"].map(read).join("\n");
    expect(frontend).not.toContain("SERVICE_ROLE");
    expect(frontend).not.toContain("storage_path");
    expect(frontend).not.toContain("token_hash");
  });

  it("bucket privado, hash, RLS y endpoints seguros están versionados", () => {
    const migration = read("supabase/migrations/20260824000100_p41_documentos_compartidos.sql");
    expect(migration).toContain("'generated-documents', 'generated-documents', false");
    expect(migration).toContain("alter table public.generated_documents enable row level security");
    expect(migration).toContain("token_hash text not null unique");
    expect(read("supabase/functions/generate-document/index.ts")).toContain("userClient.from(\"propiedades\")");
    expect(read("supabase/functions/share-document/index.ts")).toContain("hashShareToken(token)");
  });
});
