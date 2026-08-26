export interface DatosVCard {
  nombre: string;
  telefono: string;
  oficina: string;
  url: string;
}

function escaparValorVCard(valor: string): string {
  return valor
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r\n|\r|\n/g, "\\n");
}

export function construirVCard(datos: DatosVCard): string {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escaparValorVCard(datos.nombre)}`,
    `ORG:${escaparValorVCard(datos.oficina)}`,
    `TEL;TYPE=CELL:${escaparValorVCard(datos.telefono)}`,
    `URL:${escaparValorVCard(datos.url)}`,
    "END:VCARD",
  ].join("\r\n");
}

export function nombreArchivoVCard(valor: string): string {
  const base = valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "contacto"}.vcf`;
}

export function descargarVCard(datos: DatosVCard, nombreArchivo: string): void {
  const blob = new Blob([construirVCard(datos)], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivoVCard(nombreArchivo);
  enlace.click();
  URL.revokeObjectURL(url);
}
