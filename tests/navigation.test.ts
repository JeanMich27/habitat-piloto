import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { allowedViews, buildNavItems } from "../src/app/navigation/navigation";

const appSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

/**
 * Estas pruebas sólo valen si `App.tsx` de verdad usa estas funciones.
 *
 * El 26/08/2026 no las usaba: mantenía su propio `navItems` a mano y era el que
 * se pintaba. Las pruebas de abajo pasaban en verde sobre `buildNavItems`
 * mientras "Mi Micrositio" —presente sólo ahí— llevaba días invisible en la app
 * publicada. Una prueba sobre código que nadie ejecuta no es una prueba.
 */
describe("el menú del que se prueba es el que se pinta", () => {
  it("App.tsx construye su menú con buildNavItems y allowedViews", () => {
    const src = appSource();
    expect(src).toMatch(/buildNavItems\(\s*rol/);
    expect(src).toMatch(/allowedViews\(\s*navItems/);
  });

  it("App.tsx no vuelve a declarar su propia lista de destinos", () => {
    const src = appSource();
    // Un `navItems` que abre arreglo o switch propio en vez de delegar.
    expect(src).not.toMatch(/const navItems[^=]*=\s*useMemo\(\(\)\s*=>\s*\{?\s*switch/);
    expect(src).not.toMatch(/etiqueta:\s*"Dashboard"/);
  });

  it("cada rol con menú propio llega a su micrositio", () => {
    for (const rol of ["broker", "asesor_independiente", "asesor_equipo"] as const) {
      const views = allowedViews(buildNavItems(rol, 0, 0), rol);
      expect(views, `${rol} debería alcanzar mi-micrositio`).toContain("mi-micrositio");
    }
    // Propietario y cliente no tienen micrositio: no son asesores.
    for (const rol of ["propietario", "cliente"] as const) {
      expect(allowedViews(buildNavItems(rol, 0, 0), rol)).not.toContain("mi-micrositio");
    }
  });
});

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
