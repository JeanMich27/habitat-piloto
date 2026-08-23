import { describe, expect, it } from "vitest";
import { allowedViews, buildNavItems } from "../src/app/navigation/navigation";

describe("navegación por rol", () => {
  it("mantiene destinos sensibles fuera del asesor de equipo", () => {
    const items = buildNavItems("asesor_equipo", 0, 2);
    const views = allowedViews(items, "asesor_equipo");
    expect(items.find((item) => item.id === "agenda")?.badge).toBe(2);
    expect(views).toContain("detalle");
    expect(views).not.toContain("nueva");
    expect(views).not.toContain("reportes");
  });

  it("habilita vistas internas únicamente desde capacidades del menú", () => {
    const broker = allowedViews(buildNavItems("broker", 3, 0), "broker");
    const owner = allowedViews(buildNavItems("propietario", 0, 0), "propietario");
    expect([...broker]).toEqual(expect.arrayContaining(["detalle", "nueva", "perfil"]));
    expect([...owner]).toEqual(["propietario", "mi-perfil"]);
  });
});
