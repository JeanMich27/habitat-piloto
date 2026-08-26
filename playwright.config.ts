import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    // El micrositio público necesita estas variables para construir la URL,
    // pero sus E2E interceptan la petición: nunca se usa una red real.
    env: {
      VITE_APP_MODE: "demo",
      VITE_SUPABASE_URL: "https://supabase-e2e.invalid",
      VITE_SUPABASE_ANON_KEY: "anon-e2e-no-real",
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
