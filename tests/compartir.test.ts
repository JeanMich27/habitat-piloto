import { afterEach, describe, expect, it, vi } from "vitest";
import { compartirEnlace } from "../src/lib/compartir";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("compartirEnlace", () => {
  it("usa Web Share cuando está disponible", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });

    await expect(compartirEnlace("https://homeid.mx/m/ana", "Ana", "Perfil")).resolves.toBe("compartido");
    expect(share).toHaveBeenCalledWith({ title: "Ana", text: "Perfil", url: "https://homeid.mx/m/ana" });
  });

  it("trata AbortError como cancelación y no copia", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("", "AbortError"));
    const writeText = vi.fn();
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await expect(compartirEnlace("https://homeid.mx/m/ana", "Ana", "Perfil")).resolves.toBe("cancelado");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copia el enlace cuando Web Share no existe", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await expect(compartirEnlace("https://homeid.mx/m/ana", "Ana", "Perfil")).resolves.toBe("copiado");
    expect(writeText).toHaveBeenCalledWith("https://homeid.mx/m/ana");
  });
});
