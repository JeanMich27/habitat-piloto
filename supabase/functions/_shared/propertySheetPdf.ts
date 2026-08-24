import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from "npm:pdf-lib@1.17.1";

interface PropertyData {
  titulo: string;
  ubicacion: string;
  municipio: string;
  estado: string;
  precio: number | string;
  recamaras: number;
  banos: number;
  m2: number | string;
  descripcion: string;
  tipo_inmueble: string;
  tipo_operacion: string;
  imagenes: string[] | null;
  amenidades: string[] | null;
  m2_terreno: number | string | null;
  medios_banos: number | null;
  estacionamientos: number | null;
  niveles: number | null;
  colonia: string | null;
  calle: string | null;
  codigo_postal: string | null;
}

interface AdvisorData { nombre: string; correo: string; telefono: string; }
interface AgencyData { nombre: string; logo_url: string | null; }

const PAGE = { width: 595.28, height: 841.89, margin: 42 };
const safeText = (value: unknown) => String(value ?? "")
  .replace(/[\u2013\u2014]/g, "-")
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");

function currency(value: number | string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `$${Math.round(amount).toLocaleString("es-MX")} MXN`
    : "Precio no disponible";
}

function safeRemoteUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "[::1]") return null;
    if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

async function fetchImage(urlValue: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const url = safeRemoteUrl(urlValue);
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) return null;
    const mime = (response.headers.get("content-type") ?? "").split(";")[0];
    if (mime !== "image/jpeg" && mime !== "image/png") return null;
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > 8 * 1024 * 1024) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 8 * 1024 * 1024) return null;
    return { bytes, mime };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function embedRemote(pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  const image = await fetchImage(url);
  if (!image) return null;
  try {
    return image.mime === "image/png" ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes);
  } catch {
    return null;
  }
}

function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safeText(text).split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(""); continue; }
    let current = "";
    for (const word of words) {
      if (`${current} ${word}`.trim().length > maxChars && current) {
        lines.push(current); current = word;
      } else current = `${current} ${word}`.trim();
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawImageContained(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.drawRectangle({ x, y, width, height, color: rgb(0.91, 0.92, 0.95) });
  page.drawImage(image, { x: x + (width - drawWidth) / 2, y: y + (height - drawHeight) / 2, width: drawWidth, height: drawHeight });
}

export async function createPropertySheetPdf(input: {
  property: PropertyData;
  agency: AgencyData;
  advisor: AdvisorData | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safeText(input.property.titulo));
  pdf.setAuthor(safeText(input.agency.nombre));
  pdf.setCreator("HomeID DocumentService");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE.width, PAGE.height]);

  page.drawRectangle({ x: 0, y: PAGE.height - 88, width: PAGE.width, height: 88, color: rgb(0.08, 0.10, 0.16) });
  page.drawText(safeText(input.agency.nombre), { x: PAGE.margin, y: PAGE.height - 47, size: 17, font: bold, color: rgb(1, 1, 1) });
  page.drawText("FICHA TECNICA", { x: PAGE.margin, y: PAGE.height - 69, size: 9, font: regular, color: rgb(0.72, 0.69, 0.98) });

  const logo = input.agency.logo_url ? await embedRemote(pdf, input.agency.logo_url) : null;
  if (logo) {
    const scaled = logo.scaleToFit(100, 48);
    page.drawImage(logo, { x: PAGE.width - PAGE.margin - scaled.width, y: PAGE.height - 69, width: scaled.width, height: scaled.height });
  }

  const photos = await Promise.all((input.property.imagenes ?? []).slice(0, 4).map((url) => embedRemote(pdf, url)));
  const validPhotos = photos.filter((image): image is PDFImage => image !== null);
  if (validPhotos[0]) drawImageContained(page, validPhotos[0], PAGE.margin, PAGE.height - 332, PAGE.width - PAGE.margin * 2, 220);
  else {
    page.drawRectangle({ x: PAGE.margin, y: PAGE.height - 332, width: PAGE.width - PAGE.margin * 2, height: 220, color: rgb(0.91, 0.92, 0.95) });
    page.drawText("Fotografia no disponible", { x: 205, y: PAGE.height - 225, size: 11, font: regular, color: rgb(0.42, 0.45, 0.52) });
  }

  let y = PAGE.height - 370;
  for (const line of wrap(input.property.titulo, 55).slice(0, 2)) {
    page.drawText(line, { x: PAGE.margin, y, size: 21, font: bold, color: rgb(0.08, 0.10, 0.16) }); y -= 25;
  }
  page.drawText(currency(input.property.precio), { x: PAGE.margin, y: y - 3, size: 16, font: bold, color: rgb(0.35, 0.24, 0.78) });
  y -= 28;
  const location = [input.property.ubicacion, input.property.municipio, input.property.estado].filter(Boolean).join(", ");
  page.drawText(safeText(location), { x: PAGE.margin, y, size: 10, font: regular, color: rgb(0.35, 0.38, 0.44), maxWidth: PAGE.width - PAGE.margin * 2 });
  y -= 28;

  const facts = [
    ["Operacion", input.property.tipo_operacion], ["Inmueble", input.property.tipo_inmueble],
    ["Recamaras", input.property.recamaras], ["Banos", input.property.banos],
    ["Construccion", input.property.m2 ? `${input.property.m2} m2` : null],
    ["Terreno", input.property.m2_terreno ? `${input.property.m2_terreno} m2` : null],
    ["Medios banos", input.property.medios_banos], ["Estacionamientos", input.property.estacionamientos],
    ["Niveles", input.property.niveles],
  ].filter((item) => item[1] !== null && item[1] !== undefined && item[1] !== "" && item[1] !== 0);
  facts.forEach(([label, value], index) => {
    const column = index % 2; const row = Math.floor(index / 2);
    const x = PAGE.margin + column * 255; const fy = y - row * 28;
    page.drawText(`${safeText(label)}:`, { x, y: fy, size: 9, font: bold, color: rgb(0.35, 0.38, 0.44) });
    page.drawText(safeText(value), { x: x + 88, y: fy, size: 9, font: regular, color: rgb(0.12, 0.14, 0.18) });
  });
  y -= Math.ceil(facts.length / 2) * 28 + 8;

  const addPage = () => { page = pdf.addPage([PAGE.width, PAGE.height]); y = PAGE.height - PAGE.margin; };
  const section = (title: string, content: string, maxChars = 90) => {
    const lines = wrap(content, maxChars);
    if (!lines.some(Boolean)) return;
    if (y < PAGE.margin + 50) addPage();
    page.drawText(safeText(title), { x: PAGE.margin, y, size: 12, font: bold, color: rgb(0.08, 0.10, 0.16) }); y -= 20;
    for (const line of lines) {
      if (y < PAGE.margin + 16) addPage();
      page.drawText(line, { x: PAGE.margin, y, size: 9.5, font: regular, color: rgb(0.28, 0.31, 0.37) }); y -= 14;
    }
    y -= 12;
  };

  section("Descripcion", input.property.descripcion || "");
  section("Amenidades", (input.property.amenidades ?? []).join("  |  "));
  const address = [input.property.calle, input.property.colonia, input.property.codigo_postal].filter(Boolean).join(", ");
  section("Ubicacion", address);

  if (validPhotos.length > 1) {
    if (y < 220) addPage();
    page.drawText("Galeria", { x: PAGE.margin, y, size: 12, font: bold, color: rgb(0.08, 0.10, 0.16) }); y -= 145;
    validPhotos.slice(1, 4).forEach((image, index) => {
      drawImageContained(page, image, PAGE.margin + index * 171, y, 158, 125);
    });
    y -= 22;
  }

  if (input.advisor) {
    if (y < 105) addPage();
    page.drawRectangle({ x: PAGE.margin, y: y - 58, width: PAGE.width - PAGE.margin * 2, height: 72, color: rgb(0.95, 0.94, 1) });
    page.drawText("Tu asesor", { x: PAGE.margin + 16, y: y - 8, size: 9, font: bold, color: rgb(0.35, 0.24, 0.78) });
    page.drawText(safeText(input.advisor.nombre), { x: PAGE.margin + 16, y: y - 27, size: 12, font: bold, color: rgb(0.08, 0.10, 0.16) });
    const contact = [input.advisor.telefono, input.advisor.correo].filter(Boolean).join("  |  ");
    page.drawText(safeText(contact), { x: PAGE.margin + 16, y: y - 45, size: 9, font: regular, color: rgb(0.28, 0.31, 0.37) });
  }

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawText(`${safeText(input.agency.nombre)}  |  ${index + 1}/${pages.length}`, { x: PAGE.margin, y: 18, size: 7.5, font: regular, color: rgb(0.55, 0.57, 0.62) });
  });
  return await pdf.save();
}
