import type { Usuario } from "../types";
import { usuarioToRow } from "../lib/rowMappers";
import { supabase } from "../lib/supabaseClient";
import { fail, missingAgency, ok, type OperationResult } from "./repositoryResult";

export async function upsertUsuario(user: Usuario): Promise<OperationResult> {
  if (!supabase) return fail("upsertUsuario", "Sin conexión a la nube.");
  if (missingAgency("upsertUsuario")) return fail("upsertUsuario", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("usuarios").upsert(usuarioToRow(user));
  return error ? fail("upsertUsuario", "No se pudo guardar el usuario.", error) : ok();
}

/**
 * Actualiza una ficha existente. No usar upsert para el perfil propio: bajo
 * RLS, un asesor puede hacer UPDATE de su fila pero no INSERT de usuarios, y
 * `insert ... on conflict` exige también la política de inserción.
 */
export async function actualizarUsuario(user: Usuario): Promise<OperationResult> {
  if (!supabase) return fail("actualizarUsuario", "Sin conexión a la nube.");
  if (missingAgency("actualizarUsuario")) return fail("actualizarUsuario", "Esta sesión no tiene oficina asociada.");
  const { error } = await supabase.from("usuarios").update(usuarioToRow(user)).eq("id", user.id);
  return error ? fail("actualizarUsuario", "No se pudo guardar el usuario.", error) : ok();
}

export async function subirFotoPerfilPublico(archivo: File): Promise<OperationResult<string>> {
  if (!supabase) return fail("subirFotoPerfilPublico", "La foto no se puede subir sin conexión a la nube.");
  try {
    const { data: sesion, error: errorSesion } = await supabase.auth.getUser();
    if (errorSesion || !sesion.user) {
      return fail("subirFotoPerfilPublico", "Tu sesión expiró. Vuelve a iniciar sesión.", errorSesion);
    }

    const extensionPorMime: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = extensionPorMime[archivo.type];
    if (!extension) return fail("subirFotoPerfilPublico", "El formato de la imagen no es válido.");

    // La carpeta conserva auth.uid() mientras las políticas actuales de Storage
    // lo exijan. Eliminarlo de la URL pública requiere una migración posterior.
    const ruta = `${sesion.user.id}/foto.${extension}`;
    const bucket = supabase.storage.from("avatares-publicos");
    const { error: errorSubida } = await bucket.upload(ruta, archivo, {
      upsert: true,
      cacheControl: "3600",
    });
    if (errorSubida) return fail("subirFotoPerfilPublico", "No se pudo subir la foto.", errorSubida);

    const { data } = bucket.getPublicUrl(ruta);
    return ok(`${data.publicUrl}?v=${Date.now()}`);
  } catch (error) {
    return fail("subirFotoPerfilPublico", "No se pudo subir la foto. Revisa tu conexión e inténtalo de nuevo.", error);
  }
}
export async function desactivarAsesorAtomico(advisorId: string, reassignToId: string): Promise<OperationResult> {
  if (!supabase) return fail("desactivarAsesorAtomico", "Sin conexión a la nube.");
  const { error } = await supabase.rpc("desactivar_asesor_y_reasignar", { p_asesor_id: advisorId, p_reasignar_a_id: reassignToId });
  return error ? fail("desactivarAsesorAtomico", "No se pudo desactivar y reasignar al asesor.", error) : ok();
}
export async function upsertUsuarioConError(user: Usuario): Promise<string | null> {
  if (!supabase) return "Sin conexión a la nube.";
  if (missingAgency("upsertUsuarioConError")) return "Esta sesión no tiene oficina asociada. Vuelve a entrar.";
  const { error } = await supabase.from("usuarios").upsert(usuarioToRow(user));
  if (!error) return null;
  console.error("[Supabase] upsertUsuarioConError", error);
  const message = error.message.toLowerCase();
  if (message.includes("row-level security") || message.includes("violates row-level")) return "Tu cuenta no tiene permiso para dar de alta gente en esta oficina.";
  if (message.includes("duplicate key") && message.includes("correo")) return "Ya existe una cuenta con ese correo.";
  return error.message;
}
