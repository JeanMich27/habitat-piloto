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
    nombre: "Oficina Demo, Norte",
    logo_url: null,
    sitio_web: "https://oficina.example.com",
  },
  propiedades: [
    {
      id: "prop-venta",
      titulo: "Casa Venta",
      precio: 4_500_000,
      ubicacion: "Colonia Centro",
      municipio: "Monterrey",
      recamaras: 3,
      banos: 2,
      m2: 220,
      imagen: null,
      eb_public_url: "https://propiedades.example.com/venta",
      tipo_operacion: "Venta",
      tipo_inmueble: "Casa",
    },
    {
      id: "prop-renta",
      titulo: "Depto Renta",
      precio: 28_000,
      ubicacion: "Zona Valle",
      municipio: "San Pedro Garza García",
      recamaras: 2,
      banos: 2,
      m2: 120,
      imagen: null,
      eb_public_url: "https://propiedades.example.com/renta",
      tipo_operacion: "Renta",
      tipo_inmueble: "Depto",
    },
  ],
};

type PerfilFixture = typeof PERFIL_FIXTURE;

async function abrirMicrositio(page: Page, perfil: PerfilFixture = PERFIL_FIXTURE) {
  await page.route("**/functions/v1/micrositio-publico*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(perfil),
  }));
  await page.goto("/m/daniela-rios");
}

test("micrositio público carga el contrato real sin desborde móvil", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrirMicrositio(page);

  await expect(page.getByRole("heading", { level: 1, name: "Daniela Ríos" })).toBeVisible();
  await expect(page.getByText("Asesora inmobiliaria", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Oficina Demo, Norte" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Código QR de WhatsApp" })).toBeVisible();
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(desborde).toBe(false);
});

test("micrositio omite una red social con protocolo peligroso", async ({ page }) => {
  await abrirMicrositio(page);

  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Abrir instagram/i })).toHaveCount(0);
});

test("micrositio usa el teléfono normalizado en WhatsApp y llamada", async ({ page }) => {
  await abrirMicrositio(page);

  await expect(page.getByRole("link", { name: "WhatsApp", exact: true })).toHaveAttribute("href", /^https:\/\/wa\.me\/525512345678\?text=/);
  await expect(page.getByRole("link", { name: "Llamar", exact: true }).first()).toHaveAttribute("href", "tel:+525512345678");
});

test("filtro Venta y Renta muestra únicamente el inventario correspondiente", async ({ page }) => {
  await abrirMicrositio(page);

  await expect(page.getByText("Casa Venta")).toBeVisible();
  await expect(page.getByText("Depto Renta")).toBeVisible();
  await page.getByRole("button", { name: "Renta", exact: true }).click();
  await expect(page.getByText("Casa Venta")).toHaveCount(0);
  await expect(page.getByText("Depto Renta")).toBeVisible();
  await expect(page.getByText("Departamento", { exact: true })).toBeVisible();
});

test("sin teléfono válido oculta QR, servicios y acciones de contacto", async ({ page }) => {
  const sinTelefono = { ...PERFIL_FIXTURE, telefono: "123" };
  await abrirMicrositio(page, sinTelefono);

  await expect(page.getByRole("img", { name: "Código QR de WhatsApp" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "¿En qué puedo ayudarte?" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Servicios", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar contacto" })).toHaveCount(0);
  await expect(page.getByText("Contacto no disponible por el momento").first()).toBeVisible();
});

test("Compartir copia el enlace cuando Web Share no está disponible", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } });
  });
  await abrirMicrositio(page);

  await page.getByRole("button", { name: "Compartir", exact: true }).first().click();
  await expect(page.getByText("Enlace copiado", { exact: true })).toBeVisible();
});

test("cancelar Web Share no muestra éxito ni error", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => { throw new DOMException("", "AbortError"); },
    });
  });
  await abrirMicrositio(page);

  await page.getByRole("button", { name: "Compartir", exact: true }).first().click();
  await expect(page.getByText("Enlace copiado")).toHaveCount(0);
  await expect(page.getByText("No se pudo compartir")).toHaveCount(0);
});

test("barra de contacto respeta mobile y queda oculta en desktop", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrirMicrositio(page);
  await expect(page.getByRole("navigation", { name: "Contacto rápido" })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("navigation", { name: "Contacto rápido" })).toBeHidden();
});

test("Guardar contacto descarga un vCard escapado y sin correo", async ({ page }) => {
  await abrirMicrositio(page);
  const descargaPendiente = page.waitForEvent("download");
  await page.getByRole("button", { name: "Guardar contacto" }).click();
  const descarga = await descargaPendiente;
  expect(descarga.suggestedFilename()).toBe("daniela-rios.vcf");
  const flujo = await descarga.createReadStream();
  const partes: Buffer[] = [];
  for await (const parte of flujo) partes.push(Buffer.from(parte));
  const contenido = Buffer.concat(partes).toString("utf8");

  expect(contenido).toContain("ORG:Oficina Demo\\, Norte");
  expect(contenido).not.toContain("EMAIL:");
});
