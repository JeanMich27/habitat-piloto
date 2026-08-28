import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MiMicrositio from "../src/views/MiMicrositio";
import { asesor } from "./fixtures";

describe("MiMicrositio: resumen dentro del perfil", () => {
  it.each(["broker", "asesor_independiente", "asesor_equipo"] as const)(
    "muestra el enlace público al rol %s sin duplicar campos",
    (rol) => {
      render(
        <MiMicrositio
          usuario={{ ...asesor, rol, slugPublico: "ana-rivera" }}
          agencia={{ id: "default", nombre: "Hábitat", direccion: "Monterrey" }}
        />,
      );

      expect(screen.getByText("Tu micrositio público")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Ver micrositio" })).toHaveAttribute("href", "http://localhost:3000/m/ana-rivera");
      expect(screen.queryByLabelText("Nombre visible")).not.toBeInTheDocument();
    },
  );
});
