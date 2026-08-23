import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("límites de arquitectura P2", () => {
  it("App delega mutaciones a application y application consume repositorios", () => {
    const app = read("src/App.tsx");
    const actionFiles = ["leadActions", "propertyActions", "appointmentActions", "teamSettingsActions"];
    for (const action of actionFiles) expect(app).toContain(`./app/application/${action}`);
    const application = actionFiles.map((action) => read(`src/app/application/${action}.ts`)).join("\n");
    for (const repository of ["leads", "properties", "appointments", "users", "settings", "statusRequests"]) {
      expect(application).toContain(`repositories/${repository}Repository`);
    }
    const legacyImport = app.match(/import \{([\s\S]*?)\} from "\.\/lib\/dataStore";/)?.[1] ?? "";
    expect(legacyImport).not.toMatch(/upsert|bulkUpsert|eliminarCita/);
    expect(app).not.toMatch(/supabase\.from|\.rpc\(/);
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
