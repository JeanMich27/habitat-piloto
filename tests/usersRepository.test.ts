import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  from: vi.fn(),
}));

vi.mock("../src/lib/supabaseClient", () => ({
  supabase: {
    auth: { getUser: supabaseMock.getUser },
    storage: { from: supabaseMock.from },
    from: supabaseMock.from,
  },
}));

import { actualizarUsuario, subirFotoPerfilPublico } from "../src/repositories/usersRepository";
import { setAgenciaActual } from "../src/lib/agenciaActual";
import { asesor } from "./fixtures";

afterEach(() => setAgenciaActual(null));

describe("usersRepository.subirFotoPerfilPublico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.from.mockReturnValue({
      upload: supabaseMock.upload,
      getPublicUrl: supabaseMock.getPublicUrl,
    });
  });

  it("devuelve la URL pública usando el contrato OperationResult", async () => {
    supabaseMock.getUser.mockResolvedValue({
      data: { user: { id: "10000000-0000-4000-8000-000000000001" } },
      error: null,
    });
    supabaseMock.upload.mockResolvedValue({ error: null });
    supabaseMock.getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.supabase.co/storage/avatar.jpg" },
    });

    const resultado = await subirFotoPerfilPublico(new File(["foto"], "foto.jpg", { type: "image/jpeg" }));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.data).toMatch(/^https:\/\/example\.supabase\.co\/storage\/avatar\.jpg\?v=\d+$/);
    expect(supabaseMock.upload).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001/foto.jpg",
      expect.any(File),
      { upsert: true, cacheControl: "3600" },
    );
  });

  it("falla cerrada cuando no existe una sesión válida", async () => {
    supabaseMock.getUser.mockResolvedValue({ data: { user: null }, error: new Error("sesión") });

    const resultado = await subirFotoPerfilPublico(new File(["foto"], "foto.png", { type: "image/png" }));

    expect(resultado).toMatchObject({
      ok: false,
      error: { code: "SERVER_ERROR", message: "Tu sesión expiró. Vuelve a iniciar sesión." },
    });
    expect(supabaseMock.upload).not.toHaveBeenCalled();
  });
});

describe("usersRepository.actualizarUsuario", () => {
  it("usa UPDATE para el perfil existente y no exige permiso RLS de inserción", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    supabaseMock.from.mockReturnValue({ update });
    setAgenciaActual("default");

    const resultado = await actualizarUsuario({ ...asesor, agenciaId: "default", fotoUrl: "https://images.example.com/ana.jpg" });

    expect(resultado.ok).toBe(true);
    expect(supabaseMock.from).toHaveBeenCalledWith("usuarios");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ foto_url: "https://images.example.com/ana.jpg" }));
    expect(eq).toHaveBeenCalledWith("id", asesor.id);
  });
});
