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

  it("solicita el cambio de correo en Auth y espera confirmación sin mutar el perfil", async () => {
    const guardar = vi.fn().mockResolvedValue(true);
    const cambiarCorreo = vi.fn().mockResolvedValue({ requiereConfirmacion: true });
    render(
      <PerfilPersonal
        usuario={asesor}
        onGuardar={guardar}
        onCambiarContrasena={vi.fn()}
        onCambiarCorreo={cambiarCorreo}
      />,
    );

    const [, correo] = screen.getAllByRole("textbox");
    await userEvent.clear(correo);
    await userEvent.type(correo, "nueva@demo.mx");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(cambiarCorreo).toHaveBeenCalledWith("nueva@demo.mx");
    expect(guardar).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("confirmar el cambio");
  });

  it("muestra fallo de Auth y no afirma que guardó el correo", async () => {
    render(
      <PerfilPersonal
        usuario={asesor}
        onGuardar={vi.fn()}
        onCambiarContrasena={vi.fn()}
        onCambiarCorreo={vi.fn().mockResolvedValue({ error: "Ya existe una cuenta con ese correo." })}
      />,
    );

    const [, correo] = screen.getAllByRole("textbox");
    await userEvent.clear(correo);
    await userEvent.type(correo, "duplicado@demo.mx");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe");
    expect(screen.queryByText("Guardado ✓")).not.toBeInTheDocument();
  });

  it("solo confirma contraseña cuando Auth responde sin error", async () => {
    const { container } = render(
      <PerfilPersonal
        usuario={asesor}
        onGuardar={vi.fn()}
        onCambiarContrasena={vi.fn().mockResolvedValue(null)}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    const campos = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
    await userEvent.type(campos[0], "anterior123");
    await userEvent.type(campos[1], "nueva12345");
    await userEvent.type(campos[2], "nueva12345");
    await userEvent.click(screen.getByRole("button", { name: "Guardar nueva contraseña" }));
    expect(await screen.findByText("Contraseña actualizada ✓")).toBeInTheDocument();
  });

  it("rechaza enlaces sociales sin https antes de guardar", async () => {
    render(
      <PerfilPersonal
        usuario={asesor}
        onGuardar={vi.fn().mockResolvedValue(true)}
        onCambiarContrasena={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText("https://instagram.com/tu-usuario"), "javascript:alert(1)");

    expect(screen.getByRole("alert")).toHaveTextContent("Instagram debe ser una URL válida");
    expect(screen.getByRole("button", { name: "Guardar información pública" })).toBeDisabled();
  });

  it("guarda únicamente la URL social normalizada", async () => {
    const guardar = vi.fn().mockResolvedValue(true);
    render(
      <PerfilPersonal
        usuario={asesor}
        onGuardar={guardar}
        onCambiarContrasena={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText("https://instagram.com/tu-usuario"), " https://instagram.com/ana ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar información pública" }));

    expect(guardar).toHaveBeenCalledWith("u-asesor", expect.objectContaining({
      redesSociales: [{ red: "instagram", url: "https://instagram.com/ana" }],
    }));
  });
});
