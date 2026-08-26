import { expect, test, type Page } from "@playwright/test";

const PERFIL_FIXTURE = {
  nombre: "Daniela Ríos",
  puesto: "Asesora inmobiliaria",
  foto_url: null,
  bio_corta: "Acompaño decisiones inmobiliarias con información clara y atención cercana.",
  especialidades: ["Residencial", "Zona Norte"],
  anos_experiencia: 4,
  idiomas: ["Español", "Inglés"],
  certificaciones: ["AMPI"],
  redes_sociales: [{ red: "instagram", url: "javascript:alert(1)" }],
  telefono: "55 1234 5678",
  perfil_completo: true,
  oficina: {
    nombre: "Oficina Demo",
    logo_url: null,
    sitio_web: "https://oficina.example.com",
  },
  propiedades: [],
};

async function abrirMicrositio(page: Page) {
  await page.route("**/functions/v1/micrositio-publico*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(PERFIL_FIXTURE),
  }));
  await page.goto("/m/daniela-rios");
}

test("micrositio público carga datos reales del contrato sin red externa", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrirMicrositio(page);

  await expect(page.getByRole("heading", { level: 1, name: "Daniela Ríos" })).toBeVisible();
  await expect(page.getByText("Asesora inmobiliaria", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Oficina Demo" })).toBeVisible();
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(desborde).toBe(false);
});

test("micrositio omite una red social con protocolo peligroso", async ({ page }) => {
  await abrirMicrositio(page);

  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Abrir instagram/i })).toHaveCount(0);
});

test("micrositio genera un enlace de WhatsApp con teléfono normalizado", async ({ page }) => {
  await abrirMicrositio(page);

  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/525512345678\?text=/,
  );
});
