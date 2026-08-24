import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json } from "../_shared/documentHttp.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET") return json(405, { error: "Método no permitido" });
  const jwt = bearerToken(request);
  const documentId = new URL(request.url).searchParams.get("id") ?? "";
  if (!jwt) return json(401, { error: "Tu sesión expiró. Inicia sesión de nuevo." });
  if (!UUID.test(documentId)) return json(404, { error: "Documento no disponible." });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !anonKey || !serviceKey) return json(503, { error: "Servicio de documentos no configurado." });
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !authData.user) return json(401, { error: "Tu sesión expiró. Inicia sesión de nuevo." });

  // RLS verifica rol, tenant, documento activo y acceso actual a la propiedad.
  const { data: authorizedDocument } = await userClient.from("generated_documents")
    .select("id,agencia_id,resource_id").eq("id", documentId).maybeSingle();
  if (!authorizedDocument) return json(404, { error: "Documento no disponible." });
  const { data: privateDocument } = await admin.from("generated_documents").select("storage_path").eq("id", authorizedDocument.id).maybeSingle();
  if (!privateDocument) return json(404, { error: "Documento no disponible." });
  const { data: file, error: downloadError } = await admin.storage.from("generated-documents").download(privateDocument.storage_path);
  if (downloadError || !file) {
    console.error("[download-document] storage_failed", { documentId, code: downloadError?.name });
    return json(500, { error: "No pudimos descargar la ficha." });
  }
  const { data: profile } = await userClient.from("usuarios").select("id").eq("auth_id", authData.user.id).maybeSingle();
  await admin.from("document_audit_events").insert({
    agencia_id: authorizedDocument.agencia_id, actor_id: profile?.id ?? null, event_type: "document_downloaded", document_id: authorizedDocument.id,
  });
  const filename = `ficha-${String(authorizedDocument.resource_id).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}.pdf`;
  return new Response(file, {
    headers: { ...corsHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
});
