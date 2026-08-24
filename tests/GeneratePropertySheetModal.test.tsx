import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GeneratePropertySheetModal from "../src/components/GeneratePropertySheetModal";

const baseProps = {
  property: {
    titulo: "Casa Centro", ubicacion: "Centro", municipio: "Naucalpan", estado: "Estado de México", precio: 2_500_000,
    imagenes: ["https://images.example.invalid/one.jpg", "https://images.example.invalid/two.jpg", "https://images.example.invalid/three.jpg"],
    urlPublica: "https://listing.example.invalid/casa-centro",
  },
  advisor: { nombre: "Asesora Ficticia", telefono: "+52 55 5000 0000", correo: "qa@example.invalid", puesto: "Asesora" },
  agency: { nombre: "Inmobiliaria Ficticia", logoUrl: undefined },
  onClose: vi.fn(),
};

describe("modal de ficha técnica comercial", () => {
  it("solicita enlace con preset, imágenes, ubicación y QR", async () => {
    const generate = vi.fn().mockResolvedValue({
      documentId: "doc-1", shareUrl: "https://app.test/share/" + "a".repeat(64), expiresAt: "2030-01-01", reused: false,
    });
    render(<GeneratePropertySheetModal {...baseProps} onGenerate={generate} />);
    await userEvent.click(screen.getByRole("button", { name: "Generar enlace" }));
    expect(generate).toHaveBeenCalledWith({
      includeAdvisorData: true, output: "temporary_link", expiresInDays: 7,
      selectedImageIndexes: [0, 1, 2], includeQr: true, locationMode: "approximate", template: "commercial",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Enlace generado");
    expect((screen.getByLabelText("Enlace generado") as HTMLInputElement).value).toContain("/share/");
  });

  it("permite excluir datos, reordenar fotos y descarga con nombre comercial", async () => {
    const generate = vi.fn().mockResolvedValue({ documentId: "doc-2", download: new Blob(["pdf"]), reused: false });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<GeneratePropertySheetModal {...baseProps} onGenerate={generate} />);
    await userEvent.click(screen.getByRole("radio", { name: "Sin mis datos" }));
    await userEvent.click(screen.getByRole("button", { name: "Mover fotografía 3 arriba" }));
    await userEvent.click(screen.getByRole("button", { name: "Mover fotografía 3 arriba" }));
    await userEvent.click(screen.getByRole("button", { name: "Descargar PDF" }));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ includeAdvisorData: false, output: "pdf", selectedImageIndexes: [2, 0, 1], includeQr: true }));
    expect(await screen.findByRole("status")).toHaveTextContent("Ficha comercial generada");
    expect(click).toHaveBeenCalled();
    createObjectURL.mockRestore(); revokeObjectURL.mockRestore(); click.mockRestore();
  });

  it("limita la selección a diez fotografías con feedback accesible", async () => {
    const images = Array.from({ length: 11 }, (_, index) => `https://images.example.invalid/${index}.jpg`);
    render(<GeneratePropertySheetModal {...baseProps} property={{ ...baseProps.property, imagenes: images }} onGenerate={vi.fn()} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Incluir fotografía 11" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("máximo 10");
  });

  it("omite QR sin destino válido y muestra errores seguros", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("No tienes permiso para generar fichas."));
    render(<GeneratePropertySheetModal {...baseProps} property={{ ...baseProps.property, imagenes: [], urlPublica: undefined }} onGenerate={generate} />);
    await userEvent.click(screen.getByRole("radio", { name: "Sin mis datos" }));
    expect(screen.getByRole("checkbox", { name: "Incluir código QR" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Generar enlace" }));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ includeQr: false, selectedImageIndexes: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permiso");
  });
});
