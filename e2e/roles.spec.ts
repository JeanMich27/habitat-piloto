import { expect, test, type Page } from "@playwright/test";

async function enterDemoAs(page: Page, name: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Modo demostración" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(name) }).click();
}

test("broker: dashboard, propiedades, detalle y leads", async ({ page }) => {
  await enterDemoAs(page, "Jean Morales");
  await expect(page.getByRole("heading", { name: "Hola, Jean" })).toBeVisible();
  await page.getByRole("button", { name: "Propiedades", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Propiedades de la agencia" })).toBeVisible();
  await page.getByRole("button", { name: /Acciones para Casa en Lomas Verdes/ }).click();
  await page.getByRole("button", { name: "Ver detalle", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Casa en Lomas Verdes/ })).toBeVisible();
  await page.getByRole("button", { name: "Generar ficha" }).click();
  await expect(page.getByRole("dialog", { name: "Generar ficha" })).toBeVisible();
  await expect(page.getByLabel("Vista previa de la ficha")).toContainText("A4 vertical");
  await expect(page.getByText("La propiedad no tiene fotografías disponibles")).toBeVisible();
  await page.getByRole("radio", { name: "Sin mis datos" }).click();
  await expect(page.getByRole("checkbox", { name: "Incluir código QR" })).toBeDisabled();
  await page.getByRole("button", { name: "Generar enlace" }).click();
  await expect(page.getByRole("alert")).toContainText("conexión segura a la nube");
  await page.getByRole("button", { name: "Cerrar" }).click();
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
});

test("asesor: cartera, seguimiento y agenda", async ({ page }) => {
  await enterDemoAs(page, "Lulu Zanabria");
  await expect(page.getByRole("heading", { name: "Hola, Lulu" })).toBeVisible();
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
  const note = page.getByPlaceholder("¿Qué pasó con este cliente?");
  await note.fill("Seguimiento smoke E2E");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText("Seguimiento smoke E2E", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
});

test("propietario: propiedad y actividad", async ({ page }) => {
  await enterDemoAs(page, "Ana Beltrán");
  await expect(page.getByRole("heading", { name: /Casa en Lomas Verdes/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Actividad reciente" })).toBeVisible();
  await page.getByRole("button", { name: "Cronología", exact: true }).click();
  await expect(page.getByText("Propiedad publicada tras aprobar documentos")).toBeVisible();
});

test("cliente: operación y estado de cita", async ({ page }) => {
  await enterDemoAs(page, "Roberto Salgado");
  await expect(page.getByText(/Proceso de (compra|renta)/)).toBeVisible();
  await page.getByRole("button", { name: /Citas/ }).click();
  await expect(page.getByText(/cita|agenda/i).first()).toBeVisible();
});
