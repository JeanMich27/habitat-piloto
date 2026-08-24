import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("arquitectura P4.2", () => {
  it("mantiene el contrato comercial y metadata sin datos de contacto", () => {
    const edge = read("supabase/functions/generate-document/index.ts");
    expect(edge).toContain("selectedImageIndexes");
    expect(edge).toContain('template: input.options.template');
    expect(edge).toContain("generatorVersion: 2");
    const metadataBlock = edge.slice(edge.indexOf("const metadata ="), edge.indexOf("const reuseAfter"));
    expect(metadataBlock).not.toMatch(/telefono|correo|storage_path|token_hash/);
  });

  it("preserva RBAC, RLS y SSRF en la frontera server-side", () => {
    const edge = read("supabase/functions/generate-document/index.ts");
    const pdf = read("supabase/functions/_shared/propertySheetPdf.ts");
    expect(edge).toContain('["broker", "asesor_independiente", "asesor_equipo"]');
    expect(edge).toContain('userClient.from("propiedades")');
    expect(pdf).toContain('redirect: "manual"');
    expect(pdf).toContain("safeRemoteUrl");
    expect(pdf).toContain("MAX_PDF_BYTES");
  });

  it("no inventa dirección exacta ni branding por tenant", () => {
    const pdf = read("supabase/functions/_shared/propertySheetPdf.ts");
    expect(pdf).not.toContain("input.property.calle");
    expect(pdf).not.toContain("codigo_postal");
    expect(pdf).toContain("input.agency.nombre");
    expect(pdf).not.toMatch(/Hábitat Bienes Raíces|HABITAT BIENES RAICES/);
  });

  it("exige evidencia cloud de fotografías, RBAC, Storage, auditoría e inmutabilidad", () => {
    const smoke = read("scripts/cloud-dev-smoke.mjs");
    expect(smoke).toContain("imageUrls.length >= 4");
    expect(smoke).toContain('["broker", "asesor_independiente", "asesor_equipo"]');
    expect(smoke).toContain('["propietario", "cliente"]');
    expect(smoke).toContain("Private generated document was readable through a public Storage URL");
    expect(smoke).toContain("Link A changed silently after PDF B was generated");
    for (const eventType of ["document_created", "document_downloaded", "share_link_created", "share_link_accessed", "share_link_revoked"]) {
      expect(smoke).toContain(eventType);
    }
  });
});
