import { normalizeDocumentOptions, type DocumentOptions } from "../../domain/documents/documentPolicy";
import { downloadGeneratedDocument, generatePropertySheet } from "../../repositories/documentsRepository";

export interface GeneratedDocumentOutcome {
  documentId: string;
  download?: Blob;
  shareUrl?: string;
  linkId?: string;
  expiresAt?: string;
  reused: boolean;
}

export function createDocumentActions(input: { currentUserId: string; publicOrigin: string }) {
  return {
    generatePropertySheet: async (propertyId: string, options: DocumentOptions): Promise<GeneratedDocumentOutcome> => {
      const normalized = normalizeDocumentOptions(options);
      const generated = await generatePropertySheet({ propertyId, advisorId: input.currentUserId, options: normalized });
      if (normalized.output === "pdf") {
        return { ...generated, download: await downloadGeneratedDocument(generated.documentId) };
      }
      if (!generated.shareToken || !generated.expiresAt) throw new Error("El servicio no devolvió un enlace válido.");
      return {
        ...generated,
        shareUrl: `${input.publicOrigin}/share/${generated.shareToken}`,
      };
    },
  };
}
