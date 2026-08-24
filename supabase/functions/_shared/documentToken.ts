const TOKEN_BYTES = 32;

export function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function isShareToken(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export type SharedLinkState = "valid" | "expired" | "revoked";

export function getSharedLinkState(link: { expires_at: string; revoked_at: string | null }, now = Date.now()): SharedLinkState {
  if (link.revoked_at) return "revoked";
  return new Date(link.expires_at).getTime() <= now ? "expired" : "valid";
}
