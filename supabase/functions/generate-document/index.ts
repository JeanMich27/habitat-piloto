import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { bearerToken, corsHeaders, json } from "../_shared/documentHttp.ts";
import { generateShareToken, hashShareToken } from "../_shared/documentToken.ts";
import { createPropertySheetPdf } from "../_shared/propertySheetPdf.ts";

type Output = "pdf" | "temporary_link";
interface GenerateInput {
  type: "property_sheet";
  resourceId: string;
  advisorId?: string;
  options: { includeAdvisorData: boolean; output: Output; expiresInDays?: 1 | 7 | 30 };
}

interface UserRow {
  id: string; agencia_id: string; nombre: string; correo: string; telefono: string; rol: string;
}
interface AgencyRow { nombre: string; logo_url: string | null; }
interface DocumentRow { id: string; storage_path: string; }

function parseInput(value: unknown): GenerateInput {
  if (!value || typeof value !== "object") throw new Error("Solicitud inválida");
  const input = value as Record<string, unknown>;
  const options = input.options as Record<string, unknown> | undefined;
  if (input.type !== "property_sheet") throw new Error("Tipo de documento no soportado");
  if (typeof input.resourceId !== "string" || input.resourceId.length < 1 || input.resourceId.length > 200) throw new Error("Propiedad inválida");
  if (!options || typeof options.includeAdvisorData !== "boolean") throw new Error("Opciones inválidas");
  if (options.output !== "pdf" && options.output !== "temporary_link") throw new Error("Salida inválida");
  const expires = options.expiresInDays ?? 7;
  if (![1, 7, 30].includes(Number(expires))) throw new Error("Vigencia inválida");
  return {
    type: "property_sheet",
    resourceId: input.resourceId,
    advisorId: typeof input.advisorId === "string" ? input.advisorId : undefined,
    options: { includeAdvisorData: options.includeAdvisorData, output: options.output, expiresInDays: Number(expires) as 1 | 7 | 30 },
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Método no permitido" });
  const jwt = bearerToken(request);
  if (!jwt) return json(401, { error: "Tu sesión expiró. Inicia sesión de nuevo." });

  let input: GenerateInput;
  try { input = parseInput(await request.json()); }
  catch (error) { return json(400, { error: error instanceof Error ? error.message : "Solicitud inválida" }); }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !anonKey || !serviceKey) return json(503, { error: "Servicio de documentos no configurado." });
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !authData.user) return json(401, { error: "Tu sesión expiró. Inicia sesión de nuevo." });
  const { data: userData } = await userClient.from("usuarios").select("id,agencia_id,nombre,correo,telefono,rol").eq("auth_id", authData.user.id).maybeSingle();
  const user = userData as UserRow | null;
  if (!user || !["broker", "asesor_independiente", "asesor_equipo"].includes(user.rol)) return json(403, { error: "No tienes permiso para generar fichas." });
  if (input.advisorId && input.advisorId !== user.id) return json(403, { error: "Solo puedes incluir tus propios datos de contacto." });

  // Esta consulta usa el JWT del usuario: la RLS canónica decide tanto tenant
  // como asignación/permisos de cartera. service_role nunca elige la propiedad.
  const { data: property, error: propertyError } = await userClient.from("propiedades").select("*").eq("id", input.resourceId).maybeSingle();
  if (propertyError) console.warn("[generate-document] property_query", { code: propertyError.code });
  if (!property) return json(404, { error: "La propiedad no existe o no tienes permiso para verla." });
  const { data: agencyData } = await userClient.from("agencias").select("nombre,logo_url").eq("id", user.agencia_id).maybeSingle();
  const agency = agencyData as AgencyRow | null;
  if (!agency) return json(403, { error: "No fue posible validar la inmobiliaria." });

  const metadata = {
    includeAdvisorData: input.options.includeAdvisorData,
    advisorId: input.options.includeAdvisorData ? user.id : null,
    resourceVersion: Number((property as Record<string, unknown>).version ?? 0),
    generatorVersion: 1,
  };
  const reuseAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: reusable } = await admin.from("generated_documents")
    .select("id,storage_path").eq("agencia_id", user.agencia_id).eq("document_type", input.type)
    .eq("resource_type", "property").eq("resource_id", input.resourceId).is("deleted_at", null)
    .gte("created_at", reuseAfter).contains("metadata", metadata).order("created_at", { ascending: false }).limit(1).maybeSingle();
  let document = reusable as DocumentRow | null;

  if (!document) {
    try {
      const bytes = await createPropertySheetPdf({
        property: property as Parameters<typeof createPropertySheetPdf>[0]["property"],
        agency,
        advisor: input.options.includeAdvisorData ? { nombre: user.nombre, correo: user.correo, telefono: user.telefono } : null,
      });
      const documentId = crypto.randomUUID();
      const storagePath = `${user.agencia_id}/${input.type}/${documentId}.pdf`;
      const { error: uploadError } = await admin.storage.from("generated-documents").upload(storagePath, bytes, {
        contentType: "application/pdf", upsert: false, cacheControl: "0",
      });
      if (uploadError) throw uploadError;
      const { data: inserted, error: insertError } = await admin.from("generated_documents").insert({
        id: documentId, agencia_id: user.agencia_id, created_by: user.id, document_type: input.type,
        resource_type: "property", resource_id: input.resourceId, storage_path: storagePath,
        mime_type: "application/pdf", file_size: bytes.byteLength, metadata,
      }).select("id,storage_path").single();
      if (insertError || !inserted) {
        await admin.storage.from("generated-documents").remove([storagePath]);
        throw insertError ?? new Error("No se registró el documento");
      }
      document = inserted as DocumentRow;
      await admin.from("document_audit_events").insert({
        agencia_id: user.agencia_id, actor_id: user.id, event_type: "document_created", document_id: document.id,
      });
    } catch (error) {
      console.error("[generate-document] generation_failed", { message: error instanceof Error ? error.message : "unknown" });
      return json(500, { error: "No pudimos generar la ficha. Intenta de nuevo." });
    }
  }

  if (input.options.output === "temporary_link") {
    try {
      const expiresAt = new Date(Date.now() + (input.options.expiresInDays ?? 7) * 86_400_000).toISOString();
      let link: { token: string; expiresAt: string; linkId: string } | null = null;
      for (let attempt = 0; attempt < 3 && !link; attempt += 1) {
        const token = generateShareToken();
        const tokenHash = await hashShareToken(token);
        const { data, error } = await admin.from("shared_links").insert({
          agencia_id: user.agencia_id, created_by: user.id, resource_type: "property",
          resource_id: input.resourceId, document_id: document.id, token_hash: tokenHash, expires_at: expiresAt,
        }).select("id").single();
        if (!error && data) {
          await admin.from("document_audit_events").insert({
            agencia_id: user.agencia_id, actor_id: user.id, event_type: "share_link_created",
            document_id: document.id, shared_link_id: data.id,
          });
          link = { token, expiresAt, linkId: data.id as string };
        } else if (error?.code !== "23505") throw error;
      }
      if (!link) throw new Error("No se pudo crear un token único");
      return json(200, { documentId: document.id, shareToken: link.token, linkId: link.linkId, expiresAt: link.expiresAt, reused: Boolean(reusable) });
    } catch (error) {
      console.error("[generate-document] link_failed", { message: error instanceof Error ? error.message : "unknown" });
      return json(500, { error: "La ficha se generó, pero no pudimos crear el enlace." });
    }
  }
  return json(200, { documentId: document.id, reused: Boolean(reusable) });
});
