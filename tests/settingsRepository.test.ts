import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock("../src/lib/supabaseClient", () => ({
  supabase: {
    storage: { from: supabaseMock.storageFrom },
  },
}));

import { subirLogoAgenciaPublico } from "../src/repositories/settingsRepository";

describe("settingsRepository.subirLogoAgenciaPublico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.storageFrom.mockReturnValue({
      upload: supabaseMock.upload,
      getPublicUrl: supabaseMock.getPublicUrl,
    });
  });

  it("publica el logo bajo la carpeta de la agencia", async () => {
    supabaseMock.upload.mockResolvedValue({ error: null });
    supabaseMock.getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.supabase.co/storage/logo.png" },
    });

    const resultado = await subirLogoAgenciaPublico(
      "default",
      new File(["logo"], "logo.png", { type: "image/png" }),
    );

    expect(resultado.ok).toBe(true);
    expect(supabaseMock.storageFrom).toHaveBeenCalledWith("logos-publicos");
    expect(supabaseMock.upload).toHaveBeenCalledWith(
      "default/logo.png",
      expect.any(File),
      { upsert: true, cacheControl: "3600" },
    );
  });

  it("rechaza un id de agencia que pudiera alterar la ruta", async () => {
    const resultado = await subirLogoAgenciaPublico(
      "../otra-agencia",
      new File(["logo"], "logo.png", { type: "image/png" }),
    );

    expect(resultado).toMatchObject({ ok: false });
    expect(supabaseMock.upload).not.toHaveBeenCalled();
  });
});
