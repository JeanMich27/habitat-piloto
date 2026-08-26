export type ResultadoCompartir = "compartido" | "cancelado" | "copiado" | "error";

/**
 * Comparte la URL actual cuando el navegador lo permite y usa el
 * portapapeles como alternativa. Cancelar el diálogo nativo es neutral.
 */
export async function compartirEnlace(
  url: string,
  titulo: string,
  texto: string,
): Promise<ResultadoCompartir> {
  if (navigator.share) {
    try {
      await navigator.share({ title: titulo, text: texto, url });
      return "compartido";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelado";
      return "error";
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copiado";
  } catch {
    return "error";
  }
}
