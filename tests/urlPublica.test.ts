import { describe, expect, it } from "vitest";
import { urlPublicaSegura } from "../src/lib/urlPublica";

describe("urlPublicaSegura", () => {
  it("acepta y normaliza una URL https", () => {
    expect(urlPublicaSegura(" https://instagram.com/x ")).toBe("https://instagram.com/x");
  });

  it.each([
    "http://x.com",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "instagram.com/x",
    "",
  ])("rechaza un enlace público inseguro o incompleto: %s", (valor) => {
    expect(urlPublicaSegura(valor)).toBeNull();
  });
});
