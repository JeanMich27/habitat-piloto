import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MiMicrositio from "../src/views/MiMicrositio";
import { asesor } from "./fixtures";

describe("MiMicrositio: editor por rol", () => {
  it.each(["broker", "asesor_independiente", "asesor_equipo"] as const)(
    "muestra los campos públicos al rol %s",
    (rol) => {
      render(
        <MiMicrositio
          usuario={{ ...asesor, rol, slugPublico: "ana-rivera" }}
          agencia={{ id: "default", nombre: "Hábitat", direccion: "Monterrey" }}
          onGuardar={vi.fn().mockResolvedValue(true)}
          onSubirFoto={vi.fn()}
        />,
      );

      expect(screen.getByLabelText("Nombre visible")).toHaveValue("Ana Rivera");
      expect(screen.getByLabelText("Puesto visible")).toHaveValue("Asesor");
      expect(screen.getByLabelText("Teléfono de contacto y WhatsApp")).toHaveValue("5550000000");
      expect(screen.getByLabelText("Cambiar foto")).toHaveAttribute("type", "file");
    },
  );
});
