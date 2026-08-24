import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "npm:pdf-lib@1.17.1";
// @ts-types="npm:@types/qrcode@1.5.5"
import QRCode from "npm:qrcode@1.5.4";

export interface PropertySheetProperty {
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
  mantenimiento: number | string | null;
  colonia: string | null;
  eb_public_url?: string | null;
}

export interface PropertySheetAdvisor { nombre: string; correo: string; telefono: string; puesto: string; }
export interface PropertySheetAgency {
  nombre: string;
  logo_url: string | null;
  telefono?: string | null;
  correo?: string | null;
  sitio_web?: string | null;
}
export interface PropertySheetOptions { includeQr: boolean; locationMode: "approximate"; template: "commercial"; }

const PAGE = { width: 595.28, height: 841.89, margin: 40, footer: 28 };
const COLORS = {
  ink: rgb(0.07, 0.09, 0.14), muted: rgb(0.35, 0.39, 0.46), soft: rgb(0.94, 0.95, 0.97),
  violet: rgb(0.35, 0.24, 0.78), violetSoft: rgb(0.94, 0.92, 1), white: rgb(1, 1, 1),
};
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const MAX_REMOTE_BYTES = 8 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

const safeText = (value: unknown) => String(value ?? "")
  .replace(/[\u2013\u2014]/g, "-")
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");

export function formatPropertyPrice(value: number | string, operation: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Precio a consultar";
  const formatted = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(amount);
  return `${formatted} MXN${operation.toLowerCase().includes("renta") ? " / mes" : ""}`;
}

function safeRemoteUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "[::1]") return null;
    if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

async function fetchImage(urlValue: string, maxBytes = MAX_IMAGE_BYTES): Promise<{ bytes: Uint8Array; mime: "image/jpeg" | "image/png" } | null> {
  let url = safeRemoteUrl(urlValue);
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    for (let redirect = 0; redirect <= 2; redirect += 1) {
      const response = await fetch(url, { signal: controller.signal, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get("location");
        if (!next) return null;
        url = safeRemoteUrl(new URL(next, url).toString());
        if (!url) return null;
        continue;
      }
      if (!response.ok) return null;
      const mime = (response.headers.get("content-type") ?? "").split(";")[0];
      if (mime !== "image/jpeg" && mime !== "image/png") return null;
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > maxBytes) return null;
      if (!response.body) return null;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) { await reader.cancel(); return null; }
        chunks.push(value);
      }
      if (total === 0) return null;
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { bytes, mime };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function embedRemote(pdf: PDFDocument, url: string, maxBytes = MAX_IMAGE_BYTES): Promise<{ image: PDFImage; bytes: number } | null> {
  const downloaded = await fetchImage(url, maxBytes);
  if (!downloaded) return null;
  try {
    const image = downloaded.mime === "image/png" ? await pdf.embedPng(downloaded.bytes) : await pdf.embedJpg(downloaded.bytes);
    return { image, bytes: downloaded.bytes.byteLength };
  } catch {
    return null;
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const output: string[] = [];
  for (const paragraph of safeText(text).split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean).flatMap((word) => {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
      const parts: string[] = []; let part = "";
      for (const character of word) {
        if (part && font.widthOfTextAtSize(part + character, size) > maxWidth) { parts.push(part); part = character; }
        else part += character;
      }
      if (part) parts.push(part);
      return parts;
    });
    if (!words.length) { output.push(""); continue; }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) { output.push(line); line = word; }
      else line = candidate;
    }
    if (line) output.push(line);
  }
  return output;
}

function drawContained(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale; const drawHeight = image.height * scale;
  page.drawRectangle({ x, y, width, height, color: COLORS.soft });
  page.drawImage(image, { x: x + (width - drawWidth) / 2, y: y + (height - drawHeight) / 2, width: drawWidth, height: drawHeight });
}

function qrTarget(property: PropertySheetProperty, advisor: PropertySheetAdvisor | null): string | null {
  if (advisor) {
    const digits = advisor.telefono.replace(/\D/g, "");
    if (digits.length < 10) return null;
    const international = digits.length === 10 ? `52${digits}` : digits;
    return `https://wa.me/${international}?text=${encodeURIComponent(`Hola, me interesa la propiedad ${property.titulo}.`)}`;
  }
  const publicUrl = property.eb_public_url ? safeRemoteUrl(property.eb_public_url) : null;
  return publicUrl?.toString() ?? null;
}

async function embedQr(pdf: PDFDocument, value: string): Promise<PDFImage | null> {
  try {
    const dataUrl = await QRCode.toDataURL(value, { errorCorrectionLevel: "M", margin: 1, width: 320, color: { dark: "111827", light: "FFFFFFFF" } });
    const encoded = dataUrl.split(",")[1] ?? "";
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

export async function createPropertySheetPdf(input: {
  property: PropertySheetProperty;
  agency: PropertySheetAgency;
  advisor: PropertySheetAdvisor | null;
  options?: PropertySheetOptions;
}): Promise<Uint8Array> {
  const options = input.options ?? { includeQr: true, locationMode: "approximate", template: "commercial" };
  const pdf = await PDFDocument.create();
  pdf.setTitle(safeText(input.property.titulo));
  pdf.setSubject("Ficha comercial de propiedad");
  pdf.setAuthor(safeText(input.agency.nombre));
  pdf.setCreator("HomeID DocumentService P4.2");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const embeddedPhotos: PDFImage[] = [];
  let remoteBytes = 0;
  for (const url of (input.property.imagenes ?? []).slice(0, 10)) {
    if (remoteBytes >= MAX_REMOTE_BYTES) break;
    const embedded = await embedRemote(pdf, url, Math.min(MAX_IMAGE_BYTES, MAX_REMOTE_BYTES - remoteBytes));
    if (embedded) { embeddedPhotos.push(embedded.image); remoteBytes += embedded.bytes; }
  }
  const logoResult = input.agency.logo_url ? await embedRemote(pdf, input.agency.logo_url, 1024 * 1024) : null;
  const qrValue = options.includeQr ? qrTarget(input.property, input.advisor) : null;
  const qr = qrValue ? await embedQr(pdf, qrValue) : null;

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: COLORS.white });
  page.drawRectangle({ x: 0, y: PAGE.height - 76, width: PAGE.width, height: 76, color: COLORS.ink });
  page.drawText(safeText(input.agency.nombre || "Inmobiliaria"), { x: PAGE.margin, y: PAGE.height - 38, size: 16, font: bold, color: COLORS.white });
  page.drawText("FICHA COMERCIAL", { x: PAGE.margin, y: PAGE.height - 57, size: 8, font: regular, color: rgb(0.76, 0.72, 1) });
  if (logoResult) {
    const scaled = logoResult.image.scaleToFit(110, 46);
    page.drawImage(logoResult.image, { x: PAGE.width - PAGE.margin - scaled.width, y: PAGE.height - 61, width: scaled.width, height: scaled.height });
  }

  const heroY = PAGE.height - 370;
  if (embeddedPhotos[0]) drawContained(page, embeddedPhotos[0], PAGE.margin, heroY, PAGE.width - PAGE.margin * 2, 270);
  else {
    page.drawRectangle({ x: PAGE.margin, y: heroY, width: PAGE.width - PAGE.margin * 2, height: 270, color: COLORS.soft });
    page.drawText("Fotografia no disponible", { x: 213, y: heroY + 132, size: 10, font: regular, color: COLORS.muted });
  }
  page.drawRectangle({ x: PAGE.margin + 14, y: heroY + 14, width: 92, height: 24, color: COLORS.violet });
  page.drawText(safeText(`${input.property.tipo_inmueble} en ${input.property.tipo_operacion}`).toUpperCase(), { x: PAGE.margin + 22, y: heroY + 22, size: 7.5, font: bold, color: COLORS.white, maxWidth: 78 });

  let y = heroY - 34;
  for (const line of wrap(input.property.titulo, bold, 22, PAGE.width - PAGE.margin * 2).slice(0, 2)) {
    page.drawText(line, { x: PAGE.margin, y, size: 22, font: bold, color: COLORS.ink }); y -= 26;
  }
  page.drawText(formatPropertyPrice(input.property.precio, input.property.tipo_operacion), { x: PAGE.margin, y: y - 2, size: 17, font: bold, color: COLORS.violet });
  y -= 28;
  const location = [input.property.colonia || input.property.ubicacion, input.property.municipio, input.property.estado].filter(Boolean).join(", ");
  const locationLine = wrap(location, regular, 9.5, PAGE.width - PAGE.margin * 2)[0];
  if (locationLine) { page.drawText(locationLine, { x: PAGE.margin, y, size: 9.5, font: regular, color: COLORS.muted }); y -= 24; }

  const facts = ([
    ["Recamaras", Number(input.property.recamaras) > 0 ? String(input.property.recamaras) : ""],
    ["Banos", Number(input.property.banos) > 0 ? String(input.property.banos) : ""],
    ["Medios banos", Number(input.property.medios_banos) > 0 ? String(input.property.medios_banos) : ""],
    ["Estacionamientos", Number(input.property.estacionamientos) > 0 ? String(input.property.estacionamientos) : ""],
    ["Construccion", Number(input.property.m2) > 0 ? `${input.property.m2} m2` : ""],
    ["Terreno", Number(input.property.m2_terreno) > 0 ? `${input.property.m2_terreno} m2` : ""],
  ] as Array<[string, string]>).filter((fact) => fact[1]);
  const cardWidth = (PAGE.width - PAGE.margin * 2 - 12) / 3;
  facts.slice(0, 6).forEach(([label, value], index) => {
    const row = Math.floor(index / 3); const column = index % 3;
    const x = PAGE.margin + column * (cardWidth + 6); const cardY = y - row * 54 - 42;
    page.drawRectangle({ x, y: cardY, width: cardWidth, height: 44, color: COLORS.soft });
    page.drawText(safeText(value), { x: x + 10, y: cardY + 24, size: 12, font: bold, color: COLORS.ink });
    page.drawText(safeText(label), { x: x + 10, y: cardY + 10, size: 7.5, font: regular, color: COLORS.muted });
  });

  const addContentPage = (heading: string) => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: COLORS.white });
    page.drawText(safeText(heading), { x: PAGE.margin, y: PAGE.height - 58, size: 19, font: bold, color: COLORS.ink });
    page.drawRectangle({ x: PAGE.margin, y: PAGE.height - 70, width: 42, height: 3, color: COLORS.violet });
    return PAGE.height - 100;
  };

  y = addContentPage("Una propiedad para conocer");
  const descriptionLines = wrap(input.property.descripcion, regular, 10, PAGE.width - PAGE.margin * 2);
  if (descriptionLines.some(Boolean)) {
    page.drawText("DESCRIPCION", { x: PAGE.margin, y, size: 8, font: bold, color: COLORS.violet }); y -= 22;
    for (const line of descriptionLines) {
      if (y < 170) y = addContentPage("Descripcion");
      page.drawText(line, { x: PAGE.margin, y, size: 10, font: regular, color: COLORS.muted }); y -= 15;
    }
    y -= 18;
  }

  const amenities = [...new Set((input.property.amenidades ?? []).map((item) => safeText(item).trim()).filter(Boolean))];
  if (amenities.length) {
    if (y < 240) y = addContentPage("Amenidades y detalles");
    page.drawText("AMENIDADES Y DETALLES", { x: PAGE.margin, y, size: 8, font: bold, color: COLORS.violet }); y -= 25;
    let amenityIndex = 0;
    while (amenityIndex < amenities.length) {
      if (y < 150) {
        y = addContentPage("Amenidades y detalles (continuacion)");
        page.drawText("AMENIDADES Y DETALLES", { x: PAGE.margin, y, size: 8, font: bold, color: COLORS.violet }); y -= 25;
      }
      const availableRows = Math.max(1, Math.floor((y - 125) / 25));
      const pageItems = amenities.slice(amenityIndex, amenityIndex + availableRows * 2);
      pageItems.forEach((amenity, index) => {
        const column = index % 2; const row = Math.floor(index / 2); const itemY = y - row * 25;
        page.drawCircle({ x: PAGE.margin + column * 255 + 4, y: itemY + 3, size: 2.5, color: COLORS.violet });
        page.drawText(amenity, { x: PAGE.margin + column * 255 + 13, y: itemY, size: 9, font: regular, color: COLORS.ink, maxWidth: 225 });
      });
      y -= Math.ceil(pageItems.length / 2) * 25 + 18;
      amenityIndex += pageItems.length;
    }
  }

  const extraFacts = [
    Number(input.property.niveles) > 0 ? `${input.property.niveles} niveles` : "",
    Number(input.property.mantenimiento) > 0 ? `Mantenimiento: ${formatPropertyPrice(input.property.mantenimiento ?? 0, "")}` : "",
    safeText(input.property.tipo_inmueble), safeText(input.property.tipo_operacion),
  ].filter(Boolean);
  if (extraFacts.length) {
    if (y < 140) y = addContentPage("Detalles de la propiedad");
    page.drawRectangle({ x: PAGE.margin, y: y - 48, width: PAGE.width - PAGE.margin * 2, height: 60, color: COLORS.violetSoft });
    page.drawText(extraFacts.join("  |  "), { x: PAGE.margin + 16, y: y - 20, size: 9, font: regular, color: COLORS.ink, maxWidth: PAGE.width - PAGE.margin * 2 - 32 });
    y -= 78;
  }

  const gallery = embeddedPhotos.slice(1);
  for (let start = 0; start < gallery.length; start += 4) {
    const group = gallery.slice(start, start + 4);
    addContentPage(start === 0 ? "Galeria" : "Galeria (continuacion)");
    if (group.length === 1) drawContained(page, group[0], PAGE.margin, 175, PAGE.width - PAGE.margin * 2, 530);
    else {
      const gap = 12; const cellWidth = (PAGE.width - PAGE.margin * 2 - gap) / 2; const cellHeight = 255;
      group.forEach((image, index) => {
        const column = index % 2; const row = Math.floor(index / 2);
        drawContained(page, image, PAGE.margin + column * (cellWidth + gap), 440 - row * (cellHeight + gap), cellWidth, cellHeight);
      });
    }
  }

  const contactHeading = input.advisor ? "Tu asesor inmobiliario" : "Informacion de contacto";
  let contactCardY: number;
  if (gallery.length === 0 && y >= 420) {
    page.drawText(contactHeading, { x: PAGE.margin, y, size: 19, font: bold, color: COLORS.ink });
    page.drawRectangle({ x: PAGE.margin, y: y - 12, width: 42, height: 3, color: COLORS.violet });
    contactCardY = y - 252;
  } else {
    addContentPage(contactHeading);
    contactCardY = 470;
  }
  page.drawRectangle({ x: PAGE.margin, y: contactCardY, width: PAGE.width - PAGE.margin * 2, height: 210, color: COLORS.violetSoft });
  page.drawText(safeText(input.advisor?.nombre || input.agency.nombre), { x: PAGE.margin + 24, y: contactCardY + 165, size: 20, font: bold, color: COLORS.ink, maxWidth: qr ? 315 : 450 });
  const role = input.advisor?.puesto || (input.advisor ? "Asesor inmobiliario" : "Inmobiliaria");
  page.drawText(safeText(role), { x: PAGE.margin + 24, y: contactCardY + 140, size: 10, font: regular, color: COLORS.violet });
  const contactLines = input.advisor
    ? [input.advisor.telefono, input.advisor.correo, input.agency.nombre]
    : [input.agency.telefono, input.agency.correo, input.agency.sitio_web];
  contactLines.filter(Boolean).forEach((line, index) => page.drawText(safeText(line), { x: PAGE.margin + 24, y: contactCardY + 108 - index * 20, size: 9.5, font: regular, color: COLORS.muted }));
  if (qr) {
    page.drawImage(qr, { x: PAGE.width - PAGE.margin - 142, y: contactCardY + 40, width: 118, height: 118 });
    page.drawText(input.advisor ? "Escanea para escribir por WhatsApp" : "Escanea para ver la publicacion", { x: PAGE.width - PAGE.margin - 154, y: contactCardY + 20, size: 7, font: regular, color: COLORS.muted, maxWidth: 142 });
  }
  const locationHeadingY = contactCardY - 50;
  page.drawText("UBICACION COMERCIAL", { x: PAGE.margin, y: locationHeadingY, size: 8, font: bold, color: COLORS.violet });
  const finalLocation = location || "Ubicacion no disponible";
  wrap(finalLocation, regular, 11, PAGE.width - PAGE.margin * 2).slice(0, 3).forEach((line, index) => page.drawText(line, { x: PAGE.margin, y: locationHeadingY - 26 - index * 17, size: 11, font: regular, color: COLORS.ink }));
  page.drawText("Por privacidad, esta ficha muestra zona o colonia; no confirma una direccion exacta.", { x: PAGE.margin, y: locationHeadingY - 90, size: 8.5, font: regular, color: COLORS.muted });

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawLine({ start: { x: PAGE.margin, y: PAGE.footer + 5 }, end: { x: PAGE.width - PAGE.margin, y: PAGE.footer + 5 }, thickness: 0.5, color: rgb(0.86, 0.87, 0.9) });
    pdfPage.drawText(`${safeText(input.agency.nombre || "Inmobiliaria")}  |  ${index + 1}/${pages.length}`, { x: PAGE.margin, y: 16, size: 7.5, font: regular, color: rgb(0.55, 0.57, 0.62) });
  });
  const bytes = await pdf.save({ useObjectStreams: false });
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("PDF_TOO_LARGE");
  return bytes;
}
