import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-test",
}));

import PropiedadPublica from "../src/views/PropiedadPublica";

const ficha = {
  slug: "casa-bosque-a1b2c3d4e5",
  titulo: "Casa Bosque",
  precio: 5_800_000,
  tipo_operacion: "Venta",
  tipo_inmueble: "Casa",
  descripcion: "Residencia con espacios amplios.",
  municipio: "Monterrey",
  estado: "Nuevo León",
  colonia: "Bosques",
  recamaras: 3,
  banos: 2,
  medios_banos: 1,
  m2: 240,
  m2_terreno: 300,
  estacionamientos: 2,
  imagenes: ["https://images.example.com/casa.jpg", "javascript:alert(1)"],
  amenidades: ["Jardín"],
  asesor: { nombre: "Ana Rivera", puesto: "Asesora", foto_url: null, telefono: "8112345678", slug: "ana-rivera" },
  oficina: { nombre: "Hábitat", logo_url: null, sitio_web: null },
};

describe("PropiedadPublica", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ficha }));
  });

  it("muestra la ficha propia y dirige el contacto al asesor", async () => {
    render(<PropiedadPublica slug={ficha.slug} />);
    expect(await screen.findByRole("heading", { name: "Casa Bosque" })).toBeInTheDocument();
    expect(screen.getByText("Bosques, Monterrey, Nuevo León")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Preguntar por esta propiedad/ })).toHaveAttribute("href", expect.stringMatching(/^https:\/\/wa\.me\/528112345678/));
    expect(screen.getByRole("link", { name: /Ver perfil del asesor/ })).toHaveAttribute("href", "/m/ana-rivera");
  });

  it("descarta imágenes con protocolos peligrosos y evita caché obsoleta", async () => {
    render(<PropiedadPublica slug={ficha.slug} />);
    expect(await screen.findByRole("img", { name: /Casa Bosque — imagen 1/ })).toHaveAttribute("src", "https://images.example.com/casa.jpg");
    expect(screen.queryByRole("button", { name: "Imagen siguiente" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      `https://example.supabase.co/functions/v1/propiedad-publica?slug=${ficha.slug}`,
      { headers: { apikey: "anon-test" }, cache: "no-store" },
    );
  });
});
