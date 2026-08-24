import type { UserRole } from "../../types";

export type DocumentOutput = "pdf" | "temporary_link";
export type DocumentType = "property_sheet" | "comparative_report";
export type ShareLinkStatus = "valid" | "expired" | "revoked";
export type PropertySheetTemplate = "commercial";
export type PropertySheetLocationMode = "approximate";

export const MAX_PROPERTY_SHEET_IMAGES = 10;

export interface DocumentOptions {
  includeAdvisorData: boolean;
  output: DocumentOutput;
  expiresInDays?: 1 | 7 | 30;
  selectedImageIndexes?: number[];
  includeQr?: boolean;
  locationMode?: PropertySheetLocationMode;
  template?: PropertySheetTemplate;
}

export interface NormalizedDocumentOptions {
  includeAdvisorData: boolean;
  output: DocumentOutput;
  expiresInDays: 1 | 7 | 30;
  selectedImageIndexes: number[];
  includeQr: boolean;
  locationMode: PropertySheetLocationMode;
  template: PropertySheetTemplate;
}

export const canGenerateDocuments = (role: UserRole): boolean =>
  role === "broker" || role === "asesor_independiente" || role === "asesor_equipo";

export function normalizeSelectedImageIndexes(indexes: number[] | undefined): number[] {
  if (!indexes) return [];
  const normalized = [...new Set(indexes)];
  if (normalized.length > MAX_PROPERTY_SHEET_IMAGES) {
    throw new Error(`Puedes incluir como máximo ${MAX_PROPERTY_SHEET_IMAGES} fotografías.`);
  }
  if (normalized.some((index) => !Number.isInteger(index) || index < 0 || index > 99)) {
    throw new Error("La selección de fotografías no es válida.");
  }
  return normalized;
}

export function normalizeDocumentOptions(options: DocumentOptions): NormalizedDocumentOptions {
  const expiresInDays = options.expiresInDays ?? 7;
  if (![1, 7, 30].includes(expiresInDays)) throw new Error("La vigencia seleccionada no es válida.");
  if (options.locationMode && options.locationMode !== "approximate") {
    throw new Error("La dirección completa no está habilitada para esta propiedad.");
  }
  if (options.template && options.template !== "commercial") throw new Error("La plantilla seleccionada no es válida.");
  return {
    includeAdvisorData: options.includeAdvisorData,
    output: options.output,
    expiresInDays,
    selectedImageIndexes: normalizeSelectedImageIndexes(options.selectedImageIndexes),
    includeQr: options.includeQr ?? true,
    locationMode: "approximate",
    template: "commercial",
  };
}

export function propertySheetMetadata(options: NormalizedDocumentOptions, resourceVersion: number, advisorId: string) {
  return {
    template: options.template,
    includeAdvisorData: options.includeAdvisorData,
    advisorId: options.includeAdvisorData ? advisorId : null,
    selectedImageIndexes: options.selectedImageIndexes,
    includeQr: options.includeQr,
    locationMode: options.locationMode,
    resourceVersion,
    generatorVersion: 2,
  } as const;
}

export function sanitizePropertySheetFilename(title: string): string {
  const slug = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `ficha-${slug || "propiedad"}.pdf`;
}

export function getShareLinkStatus(input: { expiresAt: string; revokedAt?: string | null }, now = Date.now()): ShareLinkStatus {
  if (input.revokedAt) return "revoked";
  return new Date(input.expiresAt).getTime() <= now ? "expired" : "valid";
}
