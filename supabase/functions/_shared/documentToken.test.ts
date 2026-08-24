import { generateShareToken, getSharedLinkState, hashShareToken, isShareToken } from "./documentToken.ts";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("share tokens use 256 random bits and SHA-256", async () => {
  const first = generateShareToken();
  const second = generateShareToken();
  assert(isShareToken(first), "token format is invalid");
  assert(first.length === 64 && first !== second, "tokens are not independently random");
  const digest = await hashShareToken(first);
  assert(/^[0-9a-f]{64}$/.test(digest) && digest !== first, "token hash is invalid");
});

Deno.test("shared link state rejects expiration and revocation", () => {
  const now = Date.parse("2026-08-23T12:00:00Z");
  assert(getSharedLinkState({ expires_at: "2026-08-24T12:00:00Z", revoked_at: null }, now) === "valid", "valid link rejected");
  assert(getSharedLinkState({ expires_at: "2026-08-22T12:00:00Z", revoked_at: null }, now) === "expired", "expired link accepted");
  assert(getSharedLinkState({ expires_at: "2026-08-24T12:00:00Z", revoked_at: "2026-08-23T11:00:00Z" }, now) === "revoked", "revoked link accepted");
});
