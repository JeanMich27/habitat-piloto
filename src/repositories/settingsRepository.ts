import type { AgenciaInfo } from "../types";
import { agenciaToRow, configuracionToRow } from "../lib/rowMappers";
import { supabase } from "../lib/supabaseClient";
import { fail, missingAgency, ok, type OperationResult } from "./repositoryResult";

export async function upsertAgencia(agency: AgenciaInfo): Promise<OperationResult> {
  if (!supabase) return fail("upsertAgencia", "Sin conexión a la nube.");
  if (missingAgency("upsertAgencia")) return fail("upsertAgencia", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("agencias").upsert(agenciaToRow(agency));
  return error ? fail("upsertAgencia", "No se pudo guardar la agencia.", error) : ok();
}

export async function subirLogoAgenciaPublico(
  agenciaId: string,
  archivo: File,
): Promise<OperationResult<string>> {
  if (!supabase) return fail("subirLogoAgenciaPublico", "El logo no se puede subir sin conexión a la nube.");
  if (!/^[a-zA-Z0-9_-]+$/.test(agenciaId)) {
    return fail("subirLogoAgenciaPublico", "La oficina asociada a esta sesión no es válida.");
  }

  const extensionPorMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensionPorMime[archivo.type];
  if (!extension) return fail("subirLogoAgenciaPublico", "El formato del logo no es válido.");

  const ruta = `${agenciaId}/logo.${extension}`;
  const bucket = supabase.storage.from("logos-publicos");
  const { error: errorSubida } = await bucket.upload(ruta, archivo, {
    upsert: true,
    cacheControl: "3600",
  });
  if (errorSubida) return fail("subirLogoAgenciaPublico", "No se pudo subir el logo.", errorSubida);

  const { data } = bucket.getPublicUrl(ruta);
  return ok(`${data.publicUrl}?v=${Date.now()}`);
}

export async function upsertConfiguracion(teamCanSeeAll: boolean, notifications: Record<string, boolean>): Promise<OperationResult> {
  if (!supabase) return fail("upsertConfiguracion", "Sin conexión a la nube.");
  if (missingAgency("upsertConfiguracion")) return fail("upsertConfiguracion", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("configuracion").upsert(configuracionToRow(teamCanSeeAll, notifications));
  return error ? fail("upsertConfiguracion", "No se pudo guardar la configuración.", error) : ok();
}
