import { describe, expect, it } from "vitest";
import { construirVCard, nombreArchivoVCard } from "../src/lib/vcard";

describe("construirVCard", () => {
  it("genera vCard 3.0 sin exponer correo", () => {
    const vcard = construirVCard({
      nombre: "Ana Pérez",
      telefono: "+525512345678",
      oficina: "Oficina Norte",
      url: "https://homeid.mx/m/ana-perez",
    });

    expect(vcard).toContain("BEGIN:VCARD\r\nVERSION:3.0\r\n");
    expect(vcard).toContain("FN:Ana Pérez\r\n");
    expect(vcard).toContain("TEL;TYPE=CELL:+525512345678\r\n");
    expect(vcard.endsWith("END:VCARD")).toBe(true);
    expect(vcard).not.toContain("EMAIL:");
  });

  it("escapa coma, punto y coma, backslash y saltos de línea", () => {
    const vcard = construirVCard({
      nombre: "Ana, Pérez; Norte\\Uno\nSegundo",
      telefono: "+525512345678",
      oficina: "Oficina, Centro; Sur\\México\r\nPiso 2",
      url: "https://homeid.mx/m/ana,perez",
    });

    expect(vcard).toContain("FN:Ana\\, Pérez\\; Norte\\\\Uno\\nSegundo");
    expect(vcard).toContain("ORG:Oficina\\, Centro\\; Sur\\\\México\\nPiso 2");
    expect(vcard).toContain("URL:https://homeid.mx/m/ana\\,perez");
  });
});

describe("nombreArchivoVCard", () => {
  it("elimina caracteres inseguros y tiene fallback", () => {
    expect(nombreArchivoVCard("Ana Pérez / Norte")).toBe("ana-perez-norte.vcf");
    expect(nombreArchivoVCard("///")).toBe("contacto.vcf");
  });
});
