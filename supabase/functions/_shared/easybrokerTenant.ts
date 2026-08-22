export interface EasyBrokerContexto {
  agenciaId: string;
  proveedor: "easybroker";
  apiKey: string;
}

/**
 * Frontera server-side de credenciales por tenant.
 *
 * P1 admite EASYBROKER_CREDENTIALS_JSON como secreto del runtime con forma
 * { "agencia-id": "api-key" }. El fallback de una sola agencia mantiene los
 * despliegues actuales mientras migran; nunca existe fallback a "default".
 */
export function resolverEasyBrokerTenant(request: Request): EasyBrokerContexto {
  const agenciaId = (request.headers.get("x-agencia-id") ?? Deno.env.get("AGENCIA_ID") ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(agenciaId)) {
    throw new Error("La agencia de sincronización no es válida.");
  }

  let credenciales: Record<string, string> = {};
  const serializadas = Deno.env.get("EASYBROKER_CREDENTIALS_JSON");
  if (serializadas) {
    try {
      credenciales = JSON.parse(serializadas);
    } catch {
      throw new Error("EASYBROKER_CREDENTIALS_JSON no contiene JSON válido.");
    }
  }

  const legacyAgencia = Deno.env.get("AGENCIA_ID") ?? "";
  const apiKey = credenciales[agenciaId]
    ?? (agenciaId === legacyAgencia ? Deno.env.get("EASYBROKER_API_KEY") : undefined)
    ?? "";
  if (!apiKey) throw new Error(`EasyBroker no está configurado para la agencia ${agenciaId}.`);
  return { agenciaId, proveedor: "easybroker", apiKey };
}
