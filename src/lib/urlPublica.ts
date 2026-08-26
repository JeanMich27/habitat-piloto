const PROTOCOLOS_PERMITIDOS = new Set(["https:"]);

/**
 * Normaliza una URL pública y falla cerrada ante protocolos inseguros.
 * No agrega un esquema implícito: el usuario debe declarar https://.
 */
export function urlPublicaSegura(valor: string): string | null {
  const candidata = valor.trim();
  if (!candidata) return null;
  try {
    const url = new URL(candidata);
    return PROTOCOLOS_PERMITIDOS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
