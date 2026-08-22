import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
const sql = migrationFiles
  .map((file) => `-- ${file}\n${readFileSync(resolve(migrationsDir, file), "utf8")}`)
  .join("\n");

describe("migraciones Supabase canónicas", () => {
  it("usa nombres únicos y ordenables compatibles con Supabase CLI", () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
    expect(new Set(migrationFiles.map((file) => file.slice(0, 14))).size).toBe(migrationFiles.length);
    for (const file of migrationFiles) {
      expect(file).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  it("no incluye verificaciones con rollback ni reversas en el flujo desplegable", () => {
    expect(sql).not.toMatch(/^\s*rollback\s*;/im);
    expect(migrationFiles.some((file) => /reversa|verificacion/.test(file))).toBe(false);
  });

  it("no contiene RLS piloto permisivo, secretos placeholder ni JWT hardcodeados", () => {
    expect(sql).not.toMatch(/create\s+policy\s+"piloto_todo_acceso"/i);
    expect(sql).not.toContain("__SYNC_SECRET_PLACEHOLDER__");
    expect(sql).not.toMatch(/Bearer\s+eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

  it("mantiene el bootstrap en orden: esquema, sync, auth, BANT y multi-tenant", () => {
    expect(migrationFiles.slice(0, 6)).toEqual([
      "20260701000000_initial_schema.sql",
      "20260701500000_sync_bootstrap.sql",
      "20260702000000_auth_rls.sql",
      "20260703000000_bant_clientes.sql",
      "20260813000100_multitenant_modelo_datos.sql",
      "20260813000200_multitenant_rls.sql",
    ]);
  });

  it("incluye la remediación P0 de leads y directorio antes de sus extensiones", () => {
    expect(migrationFiles).toContain("20260822000100_p0_leads_y_directorio.sql");
    expect(migrationFiles.indexOf("20260822000100_p0_leads_y_directorio.sql")).toBeLessThan(
      migrationFiles.indexOf("20260822000200_eventos_tareas_ingesta_leads.sql"),
    );
    expect(sql).toContain("cliente_confirmar_cita");
    expect(sql).toContain("directorio_visible");
  });
});
