// Enlaces de WhatsApp con el mensaje ya escrito.
//
// El objetivo es que contactar cueste un toque: el asesor no debería tener
// que copiar un teléfono, abrir otra app, pegarlo y redactar de cero.
import type { Lead, Propiedad } from "../types";
import { formatoMXN } from "../types";

/**
 * Normaliza a formato internacional. México se asume solo cuando el número
 * viene sin lada de país (10 dígitos): es el caso de captura más común y
 * evita que el enlace falle en silencio.
 */
export function telefonoWhatsApp(telefono: string): string | null {
  const solo = (telefono ?? "").replace(/\D/g, "");
  if (solo.length < 10) return null;
  if (solo.length === 10) return `52${solo}`;
  return solo;
}

/** Primer nombre, para que el saludo no suene a plantilla. */
const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

/**
 * Mensaje inicial sugerido. Es un punto de partida editable dentro de
 * WhatsApp: nunca se envía solo.
 */
export function mensajeParaLead(
  lead: Lead,
  propiedad?: Propiedad,
  nombreAsesor?: string,
): string {
  const saludo = `Hola ${primerNombre(lead.nombre)}, buen día.`;
  const quien = nombreAsesor ? ` Soy ${nombreAsesor}.` : "";
  const sobre = propiedad
    ? ` Le escribo por ${propiedad.titulo} en ${propiedad.ubicacion} (${formatoMXN(
        propiedad.precio,
      )}${propiedad.tipoOperacion === "Renta" ? " al mes" : ""}).`
    : " Le escribo para dar seguimiento a su interés.";
  return `${saludo}${quien}${sobre} ¿Le queda bien que le comparta la información?`;
}

/** URL lista para abrir. Devuelve null si el teléfono no sirve. */
export function enlaceWhatsApp(telefono: string, mensaje?: string): string | null {
  const numero = telefonoWhatsApp(telefono);
  if (!numero) return null;
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : "";
  return `https://wa.me/${numero}${texto}`;
}
