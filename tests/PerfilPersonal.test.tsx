import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PerfilPersonal from "../src/views/PerfilPersonal";
import { asesor } from "./fixtures";

describe("PerfilPersonal: éxito respaldado por backend", () => {
  it("no muestra Guardado cuando el backend rechaza el perfil", async () => {
    const guardar = vi.fn().mockResolvedValue(false);
    render(
      <PerfilPersonal
        usuario={asesor}
        onGuardar={guardar}
        onCambiarContrasena={vi.fn().mockResolvedValue(null)}
      />,
    );

    const [nombre] = screen.getAllByRole("textbox");
    await userEvent.clear(nombre);
    await userEvent.type(nombre, "Ana Actualizada");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(guardar).toHaveBeenCalled();
    expect(screen.queryByText("Guardado ✓")).not.toBeInTheDocument();
  });

  it("muestra Guardado únicamente tras una respuesta exitosa", async () => {
    render(
      <PerfilPersonal
        usuario={asesor}
        onGuardar={vi.fn().mockResolvedValue(true)}
        onCambiarContrasena={vi.fn().mockResolvedValue(null)}
      />,
    );

    const [nombre] = screen.getAllByRole("textbox");
    await userEvent.clear(nombre);
    await userEvent.type(nombre, "Ana Actualizada");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Guardado ✓")).toBeInTheDocument();
  });

  it("no afirma que cambió la contraseña cuando la reautenticación falla", async () => {
    const cambiar = vi.fn().mockResolvedValue("La contraseña actual no es correcta.");
    const { container } = render(
      <PerfilPersonal usuario={asesor} onGuardar={vi.fn()} onCambiarContrasena={cambiar} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    const campos = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
    await userEvent.type(campos[0], "anterior123");
    await userEvent.type(campos[1], "nueva12345");
    await userEvent.type(campos[2], "nueva12345");
    await userEvent.click(screen.getByRole("button", { name: "Guardar nueva contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("contraseña actual");
    expect(screen.queryByText("Contraseña actualizada ✓")).not.toBeInTheDocument();
  });
});
