import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clasificarErrorDominio } from "../src/lib/dataStore";

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), "utf8");

describe("integridad P1", () => {
  it("clasifica errores sin exponer mensajes técnicos como contrato", () => {
    expect(clasificarErrorDominio({ code: "42501" })).toBe("PERMISSION_ERROR");
    expect(clasificarErrorDominio({ code: "23505" })).toBe("CONFLICT");
    expect(clasificarErrorDominio({ code: "P0002" })).toBe("NOT_FOUND");
    expect(clasificarErrorDominio({ code: "22023" })).toBe("VALIDATION_ERROR");
    expect(clasificarErrorDominio(new TypeError("Failed to fetch"))).toBe("NETWORK_ERROR");
    expect(clasificarErrorDominio(new Error("boom"))).toBe("SERVER_ERROR");
  });

  it("aplica concurrencia optimista en lead, propiedad y cita", () => {
    const repositories = ["leads", "properties", "appointments"]
      .map((name) => leer(`src/repositories/${name}Repository.ts`))
      .join("\n");
    const migration = leer("supabase/migrations/20260822000800_concurrencia_optimista.sql");
    for (const tabla of ["leads", "propiedades", "citas"]) {
      expect(migration).toContain(`alter table public.${tabla} add column if not exists version`);
    }
    expect(repositories.match(/\.eq\("version",/g)).toHaveLength(3);
    expect(repositories.match(/"CONFLICT"/g)).toHaveLength(3);
  });

  it("backend tampoco clasifica ni avanza un BANT parcial", () => {
    const migration = leer("supabase/migrations/20260822000900_bant_parcial_consistente.sql");
    expect(migration).toContain("when not public.bant_completo(bant) then null");
    expect(migration).toContain("before insert or update of etapa, bant");
    expect(migration).toContain("new.bant is distinct from old.bant");
  });

  it("EasyBroker resuelve tenant y credenciales en servidor sin IDs globales", () => {
    const shared = leer("supabase/functions/_shared/easybrokerTenant.ts");
    expect(shared).toContain("EASYBROKER_CREDENTIALS_JSON");
    expect(shared).toContain('request.headers.get("x-agencia-id")');
    expect(shared).not.toContain('?? "default"');
    for (const nombre of ["sync-propiedades", "sync-leads", "sync-contactos"]) {
      const edge = leer(`supabase/functions/${nombre}/index.ts`);
      expect(edge).toContain("resolverEasyBrokerTenant");
      expect(edge).not.toContain('Deno.env.get("AGENCIA_ID") ?? "default"');
    }
    expect(leer("supabase/migrations/20260822000700_frontera_externa_multitenant.sql"))
      .toContain("agencia_id, proveedor_externo, eb_contact_request_id");
  });

  it("métricas del propietario y citas del cliente omiten datos privados", () => {
    const metricas = leer("supabase/migrations/20260822000600_metricas_propietario_seguras.sql");
    expect(metricas).not.toMatch(/select\s+l\.\*/i);
    expect(metricas).not.toContain("l.bant");
    const agenda = leer("supabase/migrations/20260822000500_agenda_cliente_canonica.sql");
    expect(agenda).toContain("''::text as notas");
    expect(agenda).toContain("update public.citas");
    expect(agenda).not.toContain("jsonb_set");
  });
});
