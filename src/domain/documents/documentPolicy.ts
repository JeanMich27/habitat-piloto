import type { UserRole } from "../../types";

export type DocumentOutput = "pdf" | "temporary_link";
export type DocumentType = "property_sheet" | "comparative_report";
export type ShareLinkStatus = "valid" | "expired" | "revoked";

export interface DocumentOptions {
  includeAdvisorData: boolean;
  output: DocumentOutput;
  expiresInDays?: 1 | 7 | 30;
}

export const canGenerateDocuments = (role: UserRole): boolean =>
  role === "broker" || role === "asesor_independiente" || role === "asesor_equipo";

export function normalizeDocumentOptions(options: DocumentOptions): Required<DocumentOptions> {
  const expiresInDays = options.expiresInDays ?? 7;
  if (![1, 7, 30].includes(expiresInDays)) throw new Error("La vigencia seleccionada no es válida.");
  return { ...options, expiresInDays };
}

export function getShareLinkStatus(input: { expiresAt: string; revokedAt?: string | null }, now = Date.now()): ShareLinkStatus {
  if (input.revokedAt) return "revoked";
  return new Date(input.expiresAt).getTime() <= now ? "expired" : "valid";
}
