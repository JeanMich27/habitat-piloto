import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Configuracion from "../src/views/Configuracion";
import { InformacionInmobiliaria } from "../src/views/PerfilPersonal";

describe("Configuración de marca pública", () => {
  it("sube y asocia el logo en una sola acción", async () => {
    const guardar = vi.fn().mockResolvedValue(true);
    const subir = vi.fn().mockResolvedValue({
      url: "https://example.supabase.co/storage/logo.png?v=1",
      error: null,
    });
    render(
      <InformacionInmobiliaria
        agencia={{ id: "default", nombre: "Hábitat", direccion: "Monterrey" }}
        onGuardar={guardar}
        onSubirLogo={subir}
      />,
    );

    await userEvent.upload(
      screen.getByLabelText("Cambiar logo"),
      new File(["logo"], "logo.png", { type: "image/png" }),
    );

    expect(subir).toHaveBeenCalledOnce();
    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({
      id: "default",
      logoUrl: "https://example.supabase.co/storage/logo.png?v=1",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Logo publicado");
  });

  it("rechaza archivos que no son imágenes públicas compatibles", async () => {
    render(
      <InformacionInmobiliaria
        agencia={{ id: "default", nombre: "Hábitat", direccion: "Monterrey" }}
        onGuardar={vi.fn().mockResolvedValue(true)}
        onSubirLogo={vi.fn()}
      />,
    );

    await userEvent.upload(
      screen.getByLabelText("Cambiar logo"),
      new File(["svg"], "logo.svg", { type: "image/svg+xml" }),
      { applyAccept: false },
    );

    expect(screen.getByRole("alert")).toHaveTextContent("JPG, PNG o WEBP");
  });

  it("normaliza el sitio web que consume el micrositio", async () => {
    const guardar = vi.fn().mockResolvedValue(true);
    render(
      <Configuracion
        agencia={{ id: "default", nombre: "Hábitat", direccion: "Monterrey" }}
        onGuardarAgencia={guardar}
        permisoEquipoVerTodas={false}
        onGuardarPermisoEquipo={vi.fn()}
        notificaciones={{}}
        onGuardarNotificaciones={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText("Sitio web público"), " https://habitat.mx ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ sitioWeb: "https://habitat.mx/" }));
  });
});
