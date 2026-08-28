import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-test",
}));

import MicrositioPublico from "../src/views/MicrositioPublico";

const perfil = {
  nombre: "Daniela Ríos",
  puesto: "Asesora inmobiliaria",
  foto_url: "https://images.example.com/daniela.jpg",
  bio_corta: "Acompaño decisiones inmobiliarias con información clara.",
  especialidades: ["Residencial", "Monterrey"],
  anos_experiencia: 4,
  idiomas: ["Español", "Inglés"],
  certificaciones: ["AMPI"],
  redes_sociales: [{ red: "instagram", url: "https://instagram.com/daniela" }],
  telefono: "8112345678",
  perfil_completo: true,
  oficina: {
    nombre: "Hábitat Bienes Raíces",
    logo_url: "https://images.example.com/logo.png",
    sitio_web: "https://habitat.example.com",
  },
  propiedades: [
    {
      id: "venta-1",
      titulo: "Casa Bosque Real",
      precio: 12_500_000,
      ubicacion: "Bosque Real",
      municipio: "Monterrey",
      recamaras: 4,
      banos: 4,
      m2: 450,
      imagen: "https://images.example.com/casa.jpg",
      eb_public_url: "https://propiedades.example.com/casa",
      tipo_operacion: "Venta",
      tipo_inmueble: "Casa",
    },
    {
      id: "renta-1",
      titulo: "Departamento Centro",
      precio: 28_000,
      ubicacion: "Centro",
      municipio: "Monterrey",
      recamaras: 2,
      banos: 2,
      m2: 120,
      imagen: null,
      eb_public_url: null,
      tipo_operacion: "Renta",
      tipo_inmueble: "Depto",
    },
  ],
};

describe("MicrositioPublico", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => perfil,
    }));
  });

  it("muestra la marca y foto persistidas, sin una sección ficticia de opiniones", async () => {
    render(<MicrositioPublico slug="daniela-rios" />);

    expect(await screen.findByRole("heading", { name: "Daniela Ríos" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Daniela Ríos" })).toHaveAttribute("src", perfil.foto_url);
    expect(screen.getAllByRole("img", { name: "Logo de Hábitat Bienes Raíces" })[0]).toHaveAttribute("src", perfil.oficina.logo_url);
    expect(screen.queryByText("Opiniones")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/micrositio-publico?slug=daniela-rios",
      { headers: { apikey: "anon-test" } },
    );
  });

  it("filtra el inventario con controles accesibles", async () => {
    render(<MicrositioPublico slug="daniela-rios" />);
    expect(await screen.findByText("Casa Bosque Real")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Renta" }));

    expect(screen.queryByText("Casa Bosque Real")).not.toBeInTheDocument();
    expect(screen.getByText("Departamento Centro")).toBeInTheDocument();
  });
});
