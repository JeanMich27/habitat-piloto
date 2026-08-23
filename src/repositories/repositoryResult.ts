import { hayAgencia } from "../lib/agenciaActual";

export type DomainErrorCode = "VALIDATION_ERROR" | "AUTH_ERROR" | "PERMISSION_ERROR" | "CONFLICT" | "NOT_FOUND" | "NETWORK_ERROR" | "SERVER_ERROR";
export type OperationResult<T = undefined> = { ok: true; data: T } | { ok: false; error: { code: DomainErrorCode; message: string; cause?: unknown } };
export const ok = <T = undefined>(data?: T): OperationResult<T> => ({ ok: true, data: data as T });
export const clasificarErrorDominio = (cause?: unknown): DomainErrorCode => {
  const code = typeof cause === "object" && cause && "code" in cause ? String(cause.code) : "";
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (code === "42501") return "PERMISSION_ERROR";
  if (code === "28000" || code === "PGRST301") return "AUTH_ERROR";
  if (code === "23505" || code === "40001") return "CONFLICT";
  if (code === "P0002" || code === "PGRST116") return "NOT_FOUND";
  if (code.startsWith("22") || code === "23502" || code === "23503") return "VALIDATION_ERROR";
  if (cause instanceof TypeError || message.includes("fetch") || message.includes("network")) return "NETWORK_ERROR";
  return "SERVER_ERROR";
};
export const fail = (operation: string, message: string, cause?: unknown, code = clasificarErrorDominio(cause)): OperationResult<never> => {
  console.error(`[Supabase] ${operation}`, cause);
  return { ok: false, error: { code, message, cause } };
};
export const missingAgency = (operation: string): boolean => {
  if (hayAgencia()) return false;
  console.error(`[Supabase] ${operation}: la sesión no tiene oficina asignada.`);
  return true;
};
