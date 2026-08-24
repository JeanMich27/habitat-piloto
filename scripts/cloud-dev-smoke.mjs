import { createHash } from "node:crypto";
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
  return { token: data.session.access_token, userId: data.user.id };
}

async function generate(client, output, {
  expiresInDays = 7, includeAdvisorData = true, selectedImageIndexes = [], includeQr = true,
} = {}) {
  const { data, error } = await client.functions.invoke("generate-document", {
    body: {
      type: "property_sheet",
      resourceId: env.P41_DEV_PROPERTY_ID,
      options: {
        includeAdvisorData, output, expiresInDays, selectedImageIndexes,
        includeQr, locationMode: "approximate", template: "commercial",
      },
    },
  });
  if (error || !data?.documentId) throw new Error(`Document generation failed: ${error?.message ?? "invalid response"}`);
  return data;
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const whatsappTarget = (phone, title) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const international = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(`Hola, me interesa la propiedad ${title}.`)}`;
};
const publicQrTarget = (value) => {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
};

const advisorAuth = await signIn(advisor, env.P41_DEV_ADVISOR_EMAIL, env.P41_DEV_ADVISOR_PASSWORD, "Advisor");
const ownerAuth = await signIn(owner, env.P41_DEV_OWNER_EMAIL, env.P41_DEV_OWNER_PASSWORD, "Owner");
const { data: visibleProperty, error: visiblePropertyError } = await advisor.from("propiedades")
  .select("id").eq("id", env.P41_DEV_PROPERTY_ID).single();
if (visiblePropertyError || !visibleProperty) throw new Error("Smoke property is not visible to the advisor.");
const [{ data: smokeProperty, error: smokePropertyError }, { data: advisorProfile }, { data: ownerProfile }] = await Promise.all([
  admin.from("propiedades").select("id,agencia_id,asesor_id,titulo,imagenes,eb_public_url").eq("id", env.P41_DEV_PROPERTY_ID).single(),
  admin.from("usuarios").select("id,agencia_id,rol,telefono").eq("auth_id", advisorAuth.userId).single(),
  admin.from("usuarios").select("id,agencia_id,rol").eq("auth_id", ownerAuth.userId).single(),
]);
if (smokePropertyError || !smokeProperty || !advisorProfile || !ownerProfile) throw new Error("DEV smoke fixtures are incomplete.");
assert(smokeProperty.agencia_id === advisorProfile.agencia_id, "Smoke property and advisor belong to different DEV agencies.");
assert(smokeProperty.asesor_id === advisorProfile.id, "P4.2 team-advisor smoke property must be assigned to the authorized advisor.");
assert(ownerProfile.agencia_id === advisorProfile.agencia_id, "Owner/client rejection fixture must belong to the same fictitious DEV agency.");
const imageUrls = Array.isArray(smokeProperty.imagenes) ? smokeProperty.imagenes.filter((url) => typeof url === "string") : [];
assert(imageUrls.length >= 4, "P4.2 smoke property must contain at least four real DEV images.");
const baseIndexes = imageUrls.slice(0, 10).map((_, index) => index);
const selectedImageIndexes = [3, 1, 2, 0, ...baseIndexes.slice(4)];

async function setFixtureRole(profile, role) {
  const { error } = await admin.from("usuarios").update({ rol: role }).eq("id", profile.id).eq("agencia_id", profile.agencia_id);
  if (error) throw new Error(`Could not set temporary DEV role ${role}: ${error.message}`);
}

const allowedRoles = ["broker", "asesor_independiente", "asesor_equipo"];
const rejectedRoles = ["propietario", "cliente"];
try {
  for (const role of allowedRoles) {
    await setFixtureRole(advisorProfile, role);
    const result = await generate(advisor, "pdf", { includeAdvisorData: false, selectedImageIndexes: [], includeQr: false });
    assert(Boolean(result.documentId), `${role} could not generate a property sheet through the real Edge Function.`);
  }
  for (const role of rejectedRoles) {
    await setFixtureRole(ownerProfile, role);
    const { data, error } = await owner.functions.invoke("generate-document", {
      body: {
        type: "property_sheet", resourceId: env.P41_DEV_PROPERTY_ID,
        options: { includeAdvisorData: false, output: "pdf", selectedImageIndexes: [], includeQr: false, locationMode: "approximate", template: "commercial" },
      },
    });
    assert(Boolean(error) && !data?.documentId, `${role} unexpectedly generated a property sheet.`);
  }
} finally {
  await Promise.all([setFixtureRole(advisorProfile, advisorProfile.rol), setFixtureRole(ownerProfile, ownerProfile.rol)]);
}

const advisorQrTarget = whatsappTarget(advisorProfile.telefono, smokeProperty.titulo);
assert(Boolean(advisorQrTarget), "The fictitious DEV advisor needs a valid phone for the WhatsApp QR smoke.");
const generated = await generate(advisor, "pdf", { includeAdvisorData: true, selectedImageIndexes, includeQr: true });
const download = await fetch(edgeUrl("download-document", `?id=${encodeURIComponent(generated.documentId)}`), {
  headers: { Authorization: `Bearer ${advisorAuth.token}`, apikey: env.SUPABASE_ANON_KEY_DEV },
});
assert(download.status === 200, `Authorized PDF download returned ${download.status}.`);
const pdf = new Uint8Array(await download.arrayBuffer());
assert(pdf.byteLength > 500 && new TextDecoder().decode(pdf.slice(0, 5)) === "%PDF-", "Generated artifact is not a valid PDF.");
assert(pdf.byteLength < 10 * 1024 * 1024, "Generated advisor PDF exceeds 10 MB.");
mkdirSync("test-results", { recursive: true });
writeFileSync("test-results/p42-property-sheet-dev-advisor.pdf", pdf);

const shared = await generate(advisor, "temporary_link", { expiresInDays: 7, includeAdvisorData: true, selectedImageIndexes, includeQr: true });
assert(shared.documentId === generated.documentId, "The temporary link did not preserve PDF A.");
assert(typeof shared.shareToken === "string" && shared.shareToken.length === 64 && shared.linkId, "Share response is incomplete.");
const publicAccess = await fetch(edgeUrl("share-document", `?token=${shared.shareToken}`), { headers: { apikey: env.SUPABASE_ANON_KEY_DEV } });
assert(publicAccess.status === 200 && publicAccess.headers.get("content-type")?.includes("application/pdf"), "Valid shared link did not return a PDF.");
const linkedPdf = new Uint8Array(await publicAccess.arrayBuffer());
assert(sha256(linkedPdf) === sha256(pdf), "PDF A and link A returned different immutable bytes.");

const agencyQrTarget = publicQrTarget(smokeProperty.eb_public_url);
const anonymousGenerated = await generate(advisor, "pdf", { includeAdvisorData: false, selectedImageIndexes, includeQr: Boolean(agencyQrTarget) });
assert(anonymousGenerated.documentId !== generated.documentId, "Changing advisor visibility must create a distinct immutable document.");
const anonymousDownload = await fetch(edgeUrl("download-document", `?id=${encodeURIComponent(anonymousGenerated.documentId)}`), {
  headers: { Authorization: `Bearer ${advisorAuth.token}`, apikey: env.SUPABASE_ANON_KEY_DEV },
});
assert(anonymousDownload.status === 200, `Anonymous-version PDF download returned ${anonymousDownload.status}.`);
const anonymousPdf = new Uint8Array(await anonymousDownload.arrayBuffer());
assert(anonymousPdf.byteLength > 500 && anonymousPdf.byteLength < 10 * 1024 * 1024, "Anonymous-version PDF has an invalid size.");
writeFileSync("test-results/p42-property-sheet-dev-agency.pdf", anonymousPdf);

const immutableAccess = await fetch(edgeUrl("share-document", `?token=${shared.shareToken}`), { headers: { apikey: env.SUPABASE_ANON_KEY_DEV } });
assert(immutableAccess.status === 200, "Link A stopped working after PDF B was generated.");
assert(sha256(new Uint8Array(await immutableAccess.arrayBuffer())) === sha256(pdf), "Link A changed silently after PDF B was generated.");

const unauthorized = await fetch(edgeUrl("download-document", `?id=${encodeURIComponent(generated.documentId)}`), {
  headers: { Authorization: `Bearer ${ownerAuth.token}`, apikey: env.SUPABASE_ANON_KEY_DEV },
});
assert(unauthorized.status === 404, `Unauthorized owner download returned ${unauthorized.status}, expected 404.`);
const unauthorizedBody = await readJson(unauthorized);
assert(!JSON.stringify(unauthorizedBody).match(/storage_path|token_hash|generated_documents/i), "Unauthorized response leaked internals.");

const { data: document, error: documentError } = await admin.from("generated_documents")
  .select("id,agencia_id,storage_path,metadata,file_size").eq("id", generated.documentId).single();
if (documentError || !document) throw new Error("Generated document was not registered.");
assert(document.storage_path.startsWith(`${document.agencia_id}/property_sheet/`), "Private Storage path does not preserve tenant layout.");
assert(document.file_size < 10 * 1024 * 1024, "Registered document exceeds the P4.2 size budget.");
assert(document.metadata?.template === "commercial" && document.metadata?.locationMode === "approximate", "P4.2 generation metadata is incomplete.");
assert(JSON.stringify(document.metadata?.selectedImageIndexes) === JSON.stringify(selectedImageIndexes), "Selected image order was not persisted.");
assert(document.metadata?.includeAdvisorData === true && document.metadata?.includeQr === true, "Advisor/QR metadata does not match PDF A.");
assert(!/password|token|service.?role|telefono|correo|storage.?path/i.test(JSON.stringify(document.metadata)), "Sensitive values leaked into document metadata.");
const { data: bucket } = await admin.storage.getBucket("generated-documents");
assert(bucket?.public === false, "generated-documents bucket is not private.");
const publicStorageAttempt = await fetch(`${env.SUPABASE_URL_DEV}/storage/v1/object/public/generated-documents/${document.storage_path}`, {
  headers: { apikey: env.SUPABASE_ANON_KEY_DEV }, redirect: "manual",
});
assert(publicStorageAttempt.status !== 200, "Private generated document was readable through a public Storage URL.");

const { data: revoked, error: revokeError } = await advisor.rpc("revoke_shared_link", { p_link_id: shared.linkId });
if (revokeError || revoked !== true) throw new Error("Advisor could not revoke the shared link.");
const revokedAccess = await fetch(edgeUrl("share-document", `?token=${shared.shareToken}`), { headers: { apikey: env.SUPABASE_ANON_KEY_DEV } });
const revokedBody = await readJson(revokedAccess);
assert(revokedAccess.status === 410 && revokedBody.code === "revoked", "Revoked link was not rejected safely.");

const expiring = await generate(advisor, "temporary_link", { expiresInDays: 1, includeAdvisorData: true, selectedImageIndexes, includeQr: true });
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

const requiredAuditEvents = ["document_created", "document_downloaded", "share_link_created", "share_link_accessed", "share_link_revoked"];
const { data: auditEvents, error: auditError } = await admin.from("document_audit_events")
  .select("event_type").eq("document_id", generated.documentId).in("event_type", requiredAuditEvents);
if (auditError) throw new Error(`Could not inspect document audit events: ${auditError.message}`);
for (const eventType of requiredAuditEvents) {
  assert(auditEvents.some((event) => event.event_type === eventType), `${eventType} audit event is missing.`);
}

const summary = {
  environment: "development",
  roles: { allowed: allowedRoles, rejected: rejectedRoles },
  selectedImageIndexes,
  advisorPdf: {
    file: "p42-property-sheet-dev-advisor.pdf", bytes: pdf.byteLength,
    requestedPhotos: selectedImageIndexes.length, includeAdvisorData: true,
    qr: "whatsapp", qrTargetSha256: sha256(advisorQrTarget),
  },
  agencyPdf: {
    file: "p42-property-sheet-dev-agency.pdf", bytes: anonymousPdf.byteLength,
    requestedPhotos: selectedImageIndexes.length, includeAdvisorData: false,
    qr: agencyQrTarget ? "public_listing" : "omitted", qrTargetSha256: agencyQrTarget ? sha256(agencyQrTarget) : null,
  },
  storagePrivate: true,
  immutableLinkVerified: true,
  auditEvents: requiredAuditEvents,
};
writeFileSync("test-results/p42-cloud-smoke-summary.json", `${JSON.stringify(summary, null, 2)}\n`);

console.log("P4.2 Cloud DEV smoke passed: real RBAC calls, reordered images, advisor/agency variants, QR expectations, immutable sharing, private Storage, metadata and audit.");
