import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Zona horaria fija: la app opera en México (UTC-6) y varias reglas de agenda
// dependen del día LOCAL. Sin esto las pruebas pasan en un contenedor en UTC
// y fallan en la máquina de quien las corre — o al revés, que es peor.
process.env.TZ = "America/Mexico_City";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
  },
});
