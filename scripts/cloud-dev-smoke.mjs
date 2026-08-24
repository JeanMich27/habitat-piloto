import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const requiredNames = [
  "SUPABASE_PROJECT_REF_DEV", "SUPABASE_PROJECT_REF_PROD", "SUPABASE_URL_DEV",
  "SUPABASE_ANON_KEY_DEV", "SUPABASE_SERVICE_ROLE_KEY_DEV", "P41_DEV_ADVISOR_EMAIL",
  "P41_DEV_ADVISOR_PASSWORD", "P41_DEV_OWNER_EMAIL", "P41_DEV_OWNER_PASSWORD",
  "P41_DEV_PROPERTY_ID",
];

const env = Object.fromEntries(requiredNames.map((name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required DEV secret: ${name}`);
  return [name, value];
}));

if (process.env.HABITAT_ENV !== "development") throw new Error("HABITAT_ENV must be development.");
if (env.SUPABASE_PROJECT_REF_DEV === env.SUPABASE_PROJECT_REF_PROD) throw new Error("DEV and PROD refs match; refusing smoke test.");
const projectUrl = new URL(env.SUPABASE_URL_DEV);
if (projectUrl.protocol !== "https:" || projectUrl.hostname !== `${env.SUPABASE_PROJECT_REF_DEV}.supabase.co`) {
  throw new Error("SUPABASE_URL_DEV does not match SUPABASE_PROJECT_REF_DEV.");
}

const advisor = createClient(env.SUPABASE_URL_DEV, env.SUPABASE_ANON_KEY_DEV, { auth: { persistSession: false } });
const owner = createClient(env.SUPABASE_URL_DEV, env.SUPABASE_ANON_KEY_DEV, { auth: { persistSession: false } });
const admin = createClient(env.SUPABASE_URL_DEV, env.SUPABASE_SERVICE_ROLE_KEY_DEV, { auth: { persistSession: false } });

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async (response) => response.json().catch(() => ({}));
const edgeUrl = (name, query = "") => `${env.SUPABASE_URL_DEV}/functions/v1/${name}${query}`;

async function signIn(client, email, password, label) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`${label} could not authenticate in HABITAT DEV.`);
  return data.session.access_token;
}

async function generate(output, expiresInDays = 7) {
  const { data, error } = await advisor.functions.invoke("generate-document", {
    body: {
      type: "property_sheet",
      resourceId: env.P41_DEV_PROPERTY_ID,
      options: { includeAdvisorData: true, output, expiresInDays },
    },
  });
  if (error || !data?.documentId) throw new Error(`Document generation failed: ${error?.message ?? "invalid response"}`);
  return data;
}

const advisorToken = await signIn(advisor, env.P41_DEV_ADVISOR_EMAIL, env.P41_DEV_ADVISOR_PASSWORD, "Advisor");
const ownerToken = await signIn(owner, env.P41_DEV_OWNER_EMAIL, env.P41_DEV_OWNER_PASSWORD, "Owner");

const generated = await generate("pdf");
const download = await fetch(edgeUrl("download-document", `?id=${encodeURIComponent(generated.documentId)}`), {
  headers: { Authorization: `Bearer ${advisorToken}`, apikey: env.SUPABASE_ANON_KEY_DEV },
});
assert(download.status === 200, `Authorized PDF download returned ${download.status}.`);
const pdf = new Uint8Array(await download.arrayBuffer());
assert(pdf.byteLength > 500 && new TextDecoder().decode(pdf.slice(0, 5)) === "%PDF-", "Generated artifact is not a valid PDF.");
mkdirSync("test-results", { recursive: true });
writeFileSync("test-results/p41-property-sheet-dev.pdf", pdf);

const unauthorized = await fetch(edgeUrl("download-document", `?id=${encodeURIComponent(generated.documentId)}`), {
  headers: { Authorization: `Bearer ${ownerToken}`, apikey: env.SUPABASE_ANON_KEY_DEV },
});
assert(unauthorized.status === 404, `Unauthorized owner download returned ${unauthorized.status}, expected 404.`);
const unauthorizedBody = await readJson(unauthorized);
assert(!JSON.stringify(unauthorizedBody).match(/storage_path|token_hash|generated_documents/i), "Unauthorized response leaked internals.");

const shared = await generate("temporary_link", 7);
assert(typeof shared.shareToken === "string" && shared.shareToken.length === 64 && shared.linkId, "Share response is incomplete.");
const publicAccess = await fetch(edgeUrl("share-document", `?token=${shared.shareToken}`), { headers: { apikey: env.SUPABASE_ANON_KEY_DEV } });
assert(publicAccess.status === 200 && publicAccess.headers.get("content-type")?.includes("application/pdf"), "Valid shared link did not return a PDF.");

const { data: document, error: documentError } = await admin.from("generated_documents")
  .select("id,agencia_id,storage_path").eq("id", generated.documentId).single();
if (documentError || !document) throw new Error("Generated document was not registered.");
assert(document.storage_path.startsWith(`${document.agencia_id}/property_sheet/`), "Private Storage path does not preserve tenant layout.");
const { data: bucket } = await admin.storage.getBucket("generated-documents");
assert(bucket?.public === false, "generated-documents bucket is not private.");
const { count: auditCount } = await admin.from("document_audit_events")
  .select("id", { count: "exact", head: true }).eq("document_id", generated.documentId).eq("event_type", "document_created");
assert((auditCount ?? 0) >= 1, "document_created audit event is missing.");

const { data: revoked, error: revokeError } = await advisor.rpc("revoke_shared_link", { p_link_id: shared.linkId });
if (revokeError || revoked !== true) throw new Error("Advisor could not revoke the shared link.");
const revokedAccess = await fetch(edgeUrl("share-document", `?token=${shared.shareToken}`), { headers: { apikey: env.SUPABASE_ANON_KEY_DEV } });
const revokedBody = await readJson(revokedAccess);
assert(revokedAccess.status === 410 && revokedBody.code === "revoked", "Revoked link was not rejected safely.");

const expiring = await generate("temporary_link", 1);
const now = Date.now();
const { error: expireError } = await admin.from("shared_links").update({
  created_at: new Date(now - 2 * 86_400_000).toISOString(),
  expires_at: new Date(now - 86_400_000).toISOString(),
}).eq("id", expiring.linkId).eq("agencia_id", document.agencia_id);
if (expireError) throw new Error(`Could not prepare controlled expiration: ${expireError.message}`);
const expiredAccess = await fetch(edgeUrl("share-document", `?token=${expiring.shareToken}`), { headers: { apikey: env.SUPABASE_ANON_KEY_DEV } });
const expiredBody = await readJson(expiredAccess);
assert(expiredAccess.status === 410 && expiredBody.code === "expired", "Expired link was not rejected safely.");

const invalidAccess = await fetch(edgeUrl("share-document", `?token=${"0".repeat(64)}`), { headers: { apikey: env.SUPABASE_ANON_KEY_DEV } });
const invalidBody = await readJson(invalidAccess);
assert(invalidAccess.status === 404 && invalidBody.code === "invalid", "Invalid token did not return the safe public error.");
assert(!JSON.stringify(invalidBody).match(/sql|uuid|table|storage|hash|stack/i), "Invalid-token response leaked internals.");

console.log("P4.1 Cloud DEV smoke passed: auth, PDF, private Storage, audit, download, sharing, revocation, expiration, invalid token.");
