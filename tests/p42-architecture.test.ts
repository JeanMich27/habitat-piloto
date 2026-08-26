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

  // Aquí vivía "exige evidencia cloud de fotografías, RBAC, Storage, auditoría e
  // inmutabilidad". No comprobaba comportamiento: hacía grep de cadenas dentro de
  // `scripts/cloud-dev-smoke.mjs`, un script que apuntaba al proyecto HABITAT DEV.
  // Al retirar ese proyecto el script quedó muerto y la prueba se volvió una
  // afirmación sobre un archivo que ya no existe.
  //
  // Las tres pruebas de arriba sí leen el código que se despliega
  // (`generate-document`, `propertySheetPdf`) y conservan la cobertura de RBAC,
  // SSRF y fuga de datos de contacto.
  //
  // Pendiente real: la verificación de extremo a extremo contra producción
  // (Storage privado, eventos de auditoría, inmutabilidad del enlace) ya no tiene
  // automatización. Hoy se cubre a mano con el checklist de cierre de
  // ESTADO-DE-LA-PLATAFORMA.md. Si se reconstruye, debe correr contra el único
  // proyecto Supabase, no contra un DEV nuevo.
});
