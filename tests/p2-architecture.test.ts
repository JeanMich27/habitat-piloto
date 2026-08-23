import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("límites de arquitectura P2", () => {
  it("App consume repositorios por dominio para mutaciones", () => {
    const app = read("src/App.tsx");
    for (const repository of ["leads", "properties", "appointments", "users", "settings", "statusRequests"]) {
      expect(app).toContain(`./repositories/${repository}Repository`);
    }
    const legacyImport = app.match(/import \{([\s\S]*?)\} from "\.\/lib\/dataStore";/)?.[1] ?? "";
    expect(legacyImport).not.toMatch(/upsert|bulkUpsert|eliminarCita/);
  });

  it("mappers no aceptan any en fronteras de tablas", () => {
    const mappers = read("src/lib/rowMappers.ts");
    expect(mappers).not.toMatch(/rowTo\w+\(r: any\)/);
    expect(mappers).toContain("PropertyRow");
    expect(mappers).toContain("LeadRow");
  });

  it("mantiene reglas puras fuera de React", () => {
    expect(read("src/domain/leads/qualification.ts")).not.toMatch(/from ["']react["']/);
    expect(read("src/lib/comisiones.ts")).not.toMatch(/from ["']react["']/);
  });
});
