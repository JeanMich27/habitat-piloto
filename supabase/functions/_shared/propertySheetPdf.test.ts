import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { createPropertySheetPdf } from "./propertySheetPdf.ts";

const property = {
  titulo: "Casa ficticia P4.1",
  ubicacion: "Colonia de prueba",
  municipio: "Ciudad de prueba",
  estado: "Estado de prueba",
  precio: 2500000,
  recamaras: 3,
  banos: 2,
  m2: 180,
  descripcion: "Documento generado exclusivamente por la prueba automatizada.",
  tipo_inmueble: "Casa",
  tipo_operacion: "Venta",
  imagenes: [],
  amenidades: ["Jardín ficticio"],
  m2_terreno: 220,
  medios_banos: 1,
  estacionamientos: 2,
  niveles: 2,
  colonia: "Pruebas",
  calle: "Calle CI 1",
  codigo_postal: "00000",
};

Deno.test("property sheet engine creates a readable PDF with and without advisor", async () => {
  for (const advisor of [null, { nombre: "Asesora Ficticia", correo: "asesora@example.invalid", telefono: "5550000000" }]) {
    const bytes = await createPropertySheetPdf({ property, agency: { nombre: "Inmobiliaria Ficticia", logo_url: null }, advisor });
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("PDF signature missing");
    const parsed = await PDFDocument.load(bytes);
    if (parsed.getPageCount() < 1) throw new Error("PDF has no pages");
  }
});
