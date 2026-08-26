import { beforeEach, describe, expect, it, vi } from "vitest";

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
  },
}));

import { subirFotoPerfilPublico } from "../src/repositories/usersRepository";

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
