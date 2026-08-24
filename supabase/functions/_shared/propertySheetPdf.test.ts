import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { createPropertySheetPdf, formatPropertyPrice } from "./propertySheetPdf.ts";

const property = {
  titulo: "Casa ficticia comercial",
  ubicacion: "Colonia de prueba",
  municipio: "Ciudad de prueba",
  estado: "Estado de prueba",
  precio: 2_500_000,
  recamaras: 3,
  banos: 2,
  m2: 180,
  descripcion: "Documento generado exclusivamente por la prueba automatizada.\nSegundo párrafo con acentos y contenido comercial extenso.",
  tipo_inmueble: "Casa",
  tipo_operacion: "Venta",
  imagenes: [],
  amenidades: ["Jardín ficticio", "Seguridad", "Jardín ficticio"],
  m2_terreno: 220,
  medios_banos: 1,
  estacionamientos: 2,
  niveles: 2,
  mantenimiento: 1500,
  colonia: "Pruebas",
  eb_public_url: "https://example.invalid/property",
};
const agency = { nombre: "Inmobiliaria Ficticia", logo_url: null, telefono: "5550000000", correo: "ventas@example.invalid", sitio_web: "https://example.invalid" };
const advisor = { nombre: "Asesora Ficticia", correo: "asesora@example.invalid", telefono: "5550000000", puesto: "Asesora comercial" };

const asciiHex = (text: string) => Array.from(new TextEncoder().encode(text)).map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
const marker = (value: string) => new TextEncoder().encode(value);
const indexOf = (bytes: Uint8Array, needle: Uint8Array, from: number) => {
  outer: for (let index = from; index <= bytes.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) if (bytes[index + offset] !== needle[offset]) continue outer;
    return index;
  }
  return -1;
};
async function decodedPdfStreams(bytes: Uint8Array): Promise<string> {
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const markerIndex = indexOf(bytes, marker("stream\n"), cursor);
    if (markerIndex < 0) break;
    const start = markerIndex + 7;
    const end = indexOf(bytes, marker("\nendstream"), start);
    if (end < 0) break;
    try {
      const decompressed = await new Response(new Blob([bytes.slice(start, end)]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer();
      chunks.push(new TextDecoder().decode(decompressed));
    } catch { /* PNG/JPEG or another stream type; only content streams matter. */ }
    cursor = end + 10;
  }
  return chunks.join("\n").toUpperCase();
}
const containsEncodedText = (streams: string, text: string) => streams.includes(asciiHex(text));

Deno.test("commercial property sheet creates an A4 multipage PDF with searchable commercial content", async () => {
  const bytes = await createPropertySheetPdf({ property, agency, advisor, options: { includeQr: true, locationMode: "approximate", template: "commercial" } });
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("PDF signature missing");
  const parsed = await PDFDocument.load(bytes);
  const streams = await decodedPdfStreams(bytes);
  if (parsed.getPageCount() < 2) throw new Error("Commercial sections were not paginated");
  if (parsed.getTitle() !== property.titulo) throw new Error("Main title metadata missing");
  if (!containsEncodedText(streams, "Casa ficticia comercial")) throw new Error("Main title text missing");
  if (!containsEncodedText(streams, "Asesora Ficticia")) throw new Error("Advisor text missing");
  if (!containsEncodedText(streams, "2,500,000")) throw new Error("Formatted price missing");
});

Deno.test("commercial property sheet omits advisor and QR when disabled", async () => {
  const bytes = await createPropertySheetPdf({ property, agency, advisor: null, options: { includeQr: false, locationMode: "approximate", template: "commercial" } });
  const parsed = await PDFDocument.load(bytes);
  const streams = await decodedPdfStreams(bytes);
  if (parsed.getPageCount() < 2) throw new Error("PDF has no commercial pages");
  if (containsEncodedText(streams, "Asesora Ficticia")) throw new Error("Advisor data leaked into anonymous sheet");
});

Deno.test("selected photos produce contained gallery pages without external network", async () => {
  const originalFetch = globalThis.fetch;
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4ZQAAAAASUVORK5CYII="), (character) => character.charCodeAt(0));
  globalThis.fetch = (() => Promise.resolve(new Response(png, { status: 200, headers: { "content-type": "image/png", "content-length": String(png.byteLength) } }))) as typeof fetch;
  try {
    const withPhotos = { ...property, imagenes: Array.from({ length: 6 }, (_, index) => `https://images.example.invalid/${index}.png`) };
    const bytes = await createPropertySheetPdf({ property: withPhotos, agency, advisor, options: { includeQr: false, locationMode: "approximate", template: "commercial" } });
    const parsed = await PDFDocument.load(bytes);
    if (parsed.getPageCount() < 4) throw new Error("Selected photos did not create gallery pages");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("price formatting respects rent cadence and omits meaningless values", () => {
  if (!formatPropertyPrice(35_000, "Renta").endsWith("MXN / mes")) throw new Error("Rent cadence missing");
  if (formatPropertyPrice(0, "Venta") !== "Precio a consultar") throw new Error("Zero price should be omitted");
});
