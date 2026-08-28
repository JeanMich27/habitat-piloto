import { expect, test } from "@playwright/test";

test("mobile: broker navega inventario con controles accesibles", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Jean Morales/ }).click();
  await expect(page.getByRole("heading", { name: "Centro de control de Jean" })).toBeVisible();
  await page.getByRole("button", { name: "Propiedades", exact: true }).click();
  await page.getByRole("button", { name: /Abrir Casa en Lomas Verdes/ }).click();
  await expect(page.getByRole("heading", { name: /Casa en Lomas Verdes/ })).toBeVisible();
});
