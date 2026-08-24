import { describe, expect, it } from "vitest";
import { canGenerateDocuments, getShareLinkStatus, normalizeDocumentOptions, propertySheetMetadata, sanitizePropertySheetFilename } from "../src/domain/documents/documentPolicy";
import { generateShareToken, hashShareToken, isShareToken } from "../supabase/functions/_shared/documentToken";

describe("seguridad de documentos P4.1", () => {
  it("genera tokens aleatorios de 256 bits sin UUIDs internos", () => {
    const first = generateShareToken();
    const second = generateShareToken();
    expect(first).toHaveLength(64);
    expect(isShareToken(first)).toBe(true);
    expect(second).not.toBe(first);
  });

  it("calcula SHA-256 determinista sin conservar el token", async () => {
    const token = "a".repeat(64);
    const hash = await hashShareToken(token);
    expect(hash).toBe("ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb");
    expect(hash).not.toBe(token);
  });

  it("valida expiración y revocación con precedencia segura", () => {
    expect(getShareLinkStatus({ expiresAt: "2030-01-01T00:00:00Z" }, Date.parse("2029-01-01T00:00:00Z"))).toBe("valid");
    expect(getShareLinkStatus({ expiresAt: "2028-01-01T00:00:00Z" }, Date.parse("2029-01-01T00:00:00Z"))).toBe("expired");
    expect(getShareLinkStatus({ expiresAt: "2030-01-01T00:00:00Z", revokedAt: "2028-01-01T00:00:00Z" })).toBe("revoked");
  });

  it("autoriza roles operativos y rechaza owner/client", () => {
    expect(canGenerateDocuments("broker")).toBe(true);
    expect(canGenerateDocuments("asesor_independiente")).toBe(true);
    expect(canGenerateDocuments("asesor_equipo")).toBe(true);
    expect(canGenerateDocuments("propietario")).toBe(false);
    expect(canGenerateDocuments("cliente")).toBe(false);
  });

  it("normaliza opciones extensibles y limita vigencias", () => {
    expect(normalizeDocumentOptions({ includeAdvisorData: false, output: "temporary_link" })).toEqual({
      includeAdvisorData: false, output: "temporary_link", expiresInDays: 7,
      selectedImageIndexes: [], includeQr: true, locationMode: "approximate", template: "commercial",
    });
    expect(() => normalizeDocumentOptions({ includeAdvisorData: true, output: "pdf", expiresInDays: 2 as 1 })).toThrow("vigencia");
    expect(() => normalizeDocumentOptions({ includeAdvisorData: true, output: "pdf", selectedImageIndexes: Array.from({ length: 11 }, (_, index) => index) })).toThrow("máximo 10");
    expect(() => normalizeDocumentOptions({ includeAdvisorData: true, output: "pdf", locationMode: "full" as "approximate" })).toThrow("dirección completa");
  });

  it("construye metadata no sensible y nombres de archivo sanitizados", () => {
    const options = normalizeDocumentOptions({ includeAdvisorData: true, output: "pdf", selectedImageIndexes: [2, 0], includeQr: false });
    expect(propertySheetMetadata(options, 4, "advisor-a")).toEqual({
      template: "commercial", includeAdvisorData: true, advisorId: "advisor-a", selectedImageIndexes: [2, 0],
      includeQr: false, locationMode: "approximate", resourceVersion: 4, generatorVersion: 2,
    });
    expect(sanitizePropertySheetFilename("Ático / Bosque Esmeralda #1")).toBe("ficha-atico-bosque-esmeralda-1.pdf");
  });
});
