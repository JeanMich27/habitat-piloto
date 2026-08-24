import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GeneratePropertySheetModal from "../src/components/GeneratePropertySheetModal";

describe("modal de ficha técnica", () => {
  it("solicita enlace de 7 días con datos del asesor por defecto", async () => {
    const generate = vi.fn().mockResolvedValue({
      documentId: "doc-1", shareUrl: "https://app.test/share/" + "a".repeat(64), expiresAt: "2030-01-01", reused: false,
    });
    render(<GeneratePropertySheetModal propertyTitle="Casa Centro" onClose={vi.fn()} onGenerate={generate} />);
    await userEvent.click(screen.getByRole("button", { name: "Generar enlace" }));
    expect(generate).toHaveBeenCalledWith({ includeAdvisorData: true, output: "temporary_link", expiresInDays: 7 });
    expect(await screen.findByRole("status")).toHaveTextContent("Enlace generado");
    expect((screen.getByLabelText("Enlace generado") as HTMLInputElement).value).toContain("/share/");
  });

  it("permite excluir por completo los datos del asesor", async () => {
    const generate = vi.fn().mockResolvedValue({ documentId: "doc-2", download: new Blob(["pdf"]), reused: false });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<GeneratePropertySheetModal propertyTitle="Casa Centro" onClose={vi.fn()} onGenerate={generate} />);
    await userEvent.click(screen.getByRole("radio", { name: "Sin mis datos" }));
    await userEvent.click(screen.getByRole("button", { name: "Descargar PDF" }));
    expect(generate).toHaveBeenCalledWith({ includeAdvisorData: false, output: "pdf", expiresInDays: 7 });
    expect(await screen.findByRole("status")).toHaveTextContent("Ficha generada");
    createObjectURL.mockRestore(); revokeObjectURL.mockRestore(); click.mockRestore();
  });

  it("muestra errores seguros del backend", async () => {
    render(<GeneratePropertySheetModal propertyTitle="Casa" onClose={vi.fn()} onGenerate={vi.fn().mockRejectedValue(new Error("No tienes permiso para generar fichas."))} />);
    await userEvent.click(screen.getByRole("button", { name: "Generar enlace" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permiso");
  });
});
