import { describe, expect, it } from "vitest";
import { traducirError } from "../src/lib/authContext";

describe("errores de Auth seguros", () => {
  it("traduce credenciales, correo duplicado y contraseña inválida", () => {
    expect(traducirError("Invalid login credentials")).toContain("incorrectos");
    expect(traducirError("User already been registered")).toContain("Ya existe");
    expect(traducirError("Password should be at least 8 characters")).toContain("al menos");
  });

  it("conserva un mensaje de confirmación fallida sin simular éxito", () => {
    expect(traducirError("Email not confirmed")).toContain("Confirma tu correo");
  });
});
