import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "../lib/supabaseClient";
import type { NormalizedDocumentOptions } from "../domain/documents/documentPolicy";

interface GenerateDocumentResult {
  documentId: string;
  shareToken?: string;
  linkId?: string;
  expiresAt?: string;
  reused: boolean;
}

interface GenerateDocumentCommand {
  type: "property_sheet";
  resourceId: string;
  advisorId: string;
  options: NormalizedDocumentOptions;
}

interface FunctionErrorData { error?: string; }

export async function generateDocument(input: GenerateDocumentCommand): Promise<GenerateDocumentResult> {
  if (!supabase) throw new Error("La generación de fichas requiere conexión segura a la nube.");
  const { data, error } = await supabase.functions.invoke<GenerateDocumentResult>("generate-document", {
    body: {
      type: input.type,
      resourceId: input.resourceId,
      advisorId: input.advisorId,
      options: input.options,
    },
  });
  if (error) {
    const context = error.context as Response | undefined;
    const details = context ? await context.clone().json().catch(() => null) as FunctionErrorData | null : null;
    throw new Error(details?.error ?? "No pudimos generar la ficha.");
  }
  if (!data?.documentId) throw new Error("El servicio no devolvió un documento válido.");
  return data;
}

export const generatePropertySheet = (input: { propertyId: string; advisorId: string; options: NormalizedDocumentOptions }) =>
  generateDocument({ type: "property_sheet", resourceId: input.propertyId, advisorId: input.advisorId, options: input.options });

export async function downloadGeneratedDocument(documentId: string): Promise<Blob> {
  if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("La descarga segura no está disponible.");
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/download-document?id=${encodeURIComponent(documentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as FunctionErrorData | null;
    throw new Error(details?.error ?? "No pudimos descargar la ficha.");
  }
  return response.blob();
}

export async function revokeSharedLink(linkId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("revoke_shared_link", { p_link_id: linkId });
  if (error) throw new Error("No pudimos revocar el enlace.");
  return data === true;
}
