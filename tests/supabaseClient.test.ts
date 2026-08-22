import { describe, expect, it } from "vitest";
import { resolveAppConfig } from "../src/lib/supabaseClient";

describe("configuración cloud/demo", () => {
  it("producción sin Supabase falla cerrada", () => {
    expect(resolveAppConfig({ production: true })).toEqual({
      mode: "blocked",
      error: "Falta configurar VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.",
    });
  });

  it("producción nunca acepta modo demo", () => {
    expect(resolveAppConfig({ production: true, appMode: "demo" }).mode).toBe("blocked");
  });

  it("desarrollo sólo habilita demo mediante bandera explícita", () => {
    expect(resolveAppConfig({ production: false }).mode).toBe("blocked");
    expect(resolveAppConfig({ production: false, appMode: "demo" })).toEqual({
      mode: "demo",
      error: null,
    });
  });

  it("cloud requiere ambas credenciales", () => {
    expect(
      resolveAppConfig({
        production: true,
        appMode: "cloud",
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon-key",
      }),
    ).toEqual({ mode: "cloud", error: null });
  });
});

