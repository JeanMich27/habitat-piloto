import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/documentHttp.ts";
import { getSharedLinkState, hashShareToken, isShareToken } from "../_shared/documentToken.ts";

interface LinkRow {
  id: string; agencia_id: string; document_id: string; expires_at: string; revoked_at: string | null;
  generated_documents: { storage_path: string; deleted_at: string | null } | null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return json(405, { error: "Método no permitido" });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!isShareToken(token)) return json(404, { code: "invalid", error: "Este enlace no es válido." });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) return json(503, { error: "Servicio temporalmente no disponible." });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const tokenHash = await hashShareToken(token);
  const { data, error } = await admin.from("shared_links")
    .select("id,agencia_id,document_id,expires_at,revoked_at,generated_documents(storage_path,deleted_at)")
    .eq("token_hash", tokenHash).maybeSingle();
  if (error) console.error("[share-document] lookup_failed", { code: error.code });
  const link = data as LinkRow | null;
  if (!link || !link.generated_documents || link.generated_documents.deleted_at) return json(404, { code: "invalid", error: "Este enlace no es válido." });
  const state = getSharedLinkState(link);
  if (state === "revoked") return json(410, { code: "revoked", error: "Este enlace ya no está disponible." });
  if (state === "expired") {
    await admin.from("document_audit_events").insert({
      agencia_id: link.agencia_id, event_type: "share_link_expired", document_id: link.document_id, shared_link_id: link.id,
    });
    return json(410, { code: "expired", error: "Este enlace ha expirado." });
  }
  const { data: file, error: storageError } = await admin.storage.from("generated-documents").download(link.generated_documents.storage_path);
  if (storageError || !file) {
    console.error("[share-document] storage_failed", { linkId: link.id, code: storageError?.name });
    return json(404, { code: "invalid", error: "Este enlace no es válido." });
  }
  await admin.rpc("record_shared_link_access", { p_link_id: link.id });
  return new Response(file, {
    headers: { ...corsHeaders, "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
