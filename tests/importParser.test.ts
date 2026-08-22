import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  parseArchivo,
} from "../src/lib/importParser";

const csv = (contenido: string, nombre = "datos.csv", tipo = "text/csv") =>
  new File([contenido], nombre, { type: tipo });

describe("parseArchivo: límites de importación CSV", () => {
  it("acepta un CSV válido", async () => {
    await expect(parseArchivo(csv("nombre,telefono\nAna,5551234567"))).resolves.toEqual({
      encabezados: ["nombre", "telefono"],
      filas: [{ nombre: "Ana", telefono: "5551234567" }],
    });
  });

  it("rechaza un CSV corrupto", async () => {
    await expect(parseArchivo(csv('nombre,telefono\n"Ana,5551234567'))).rejects.toThrow(/corrupto/i);
  });

  it("rechaza un archivo que supera 5 MiB antes de parsearlo", async () => {
    const enorme = new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], "enorme.csv", {
      type: "text/csv",
    });
    await expect(parseArchivo(enorme)).rejects.toThrow(/5 MiB/i);
  });

  it("rechaza XLS/XLSX y tipos no permitidos aunque intenten usar otro MIME", async () => {
    await expect(parseArchivo(csv("PK", "datos.xlsx", "text/csv"))).rejects.toThrow(/formato no permitido/i);
    await expect(parseArchivo(csv("nombre\nAna", "datos.csv", "application/pdf"))).rejects.toThrow(
      /formato no permitido/i,
    );
  });

  it("rechaza más filas que el máximo", async () => {
    const filas = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Persona ${i},${i}`).join("\n");
    await expect(parseArchivo(csv(`nombre,indice\n${filas}`))).rejects.toThrow(/5[,.]000 filas/i);
  });

  it("rechaza más columnas que el máximo", async () => {
    const encabezados = Array.from({ length: MAX_IMPORT_COLUMNS + 1 }, (_, i) => `c${i}`).join(",");
    const valores = Array.from({ length: MAX_IMPORT_COLUMNS + 1 }, () => "x").join(",");
    await expect(parseArchivo(csv(`${encabezados}\n${valores}`))).rejects.toThrow(/100 columnas/i);
  });
});
