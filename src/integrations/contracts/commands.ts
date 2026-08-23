export type IntegrationCommand =
  | {
      type: "CreateLead";
      payload: {
        name: string;
        phone?: string;
        email?: string;
        source: string;
        origin?: "Portal" | "Referido" | "Redes" | "Directo";
        propertyId?: string;
        message?: string;
        assignedAgentId?: string;
        occupation?: string;
      };
    };

export interface InboundIntegrationEnvelope {
  provider: string;
  externalEventId: string;
  correlationId: string;
  command: IntegrationCommand;
}

export function parseInboundEnvelope(value: unknown): InboundIntegrationEnvelope {
  if (!value || typeof value !== "object") throw new Error("Envelope must be an object");
  const input = value as Record<string, unknown>;
  if (typeof input.provider !== "string" || !/^[a-z0-9_-]{1,40}$/.test(input.provider)) {
    throw new Error("Invalid provider");
  }
  if (typeof input.externalEventId !== "string" || input.externalEventId.length < 1 || input.externalEventId.length > 200) {
    throw new Error("Invalid externalEventId");
  }
  const command = input.command as Record<string, unknown> | undefined;
  if (!command || command.type !== "CreateLead" || !command.payload || typeof command.payload !== "object") {
    throw new Error("Unsupported command");
  }
  const payload = command.payload as Record<string, unknown>;
  if (typeof payload.name !== "string" || !payload.name.trim()) throw new Error("Lead name is required");
  if (typeof payload.source !== "string" || !payload.source.trim()) throw new Error("Lead source is required");
  const validOrigins = ["Portal", "Referido", "Redes", "Directo"] as const;
  const origin = typeof payload.origin === "string" && validOrigins.some((value) => value === payload.origin)
    ? payload.origin as typeof validOrigins[number]
    : undefined;
  return {
    provider: input.provider,
    externalEventId: input.externalEventId,
    correlationId: typeof input.correlationId === "string" && input.correlationId
      ? input.correlationId
      : crypto.randomUUID(),
    command: {
      type: "CreateLead",
      payload: {
        name: payload.name,
        source: payload.source,
        ...(typeof payload.phone === "string" ? { phone: payload.phone } : {}),
        ...(typeof payload.email === "string" ? { email: payload.email } : {}),
        ...(origin ? { origin } : {}),
        ...(typeof payload.propertyId === "string" ? { propertyId: payload.propertyId } : {}),
        ...(typeof payload.message === "string" ? { message: payload.message } : {}),
        ...(typeof payload.assignedAgentId === "string" ? { assignedAgentId: payload.assignedAgentId } : {}),
        ...(typeof payload.occupation === "string" ? { occupation: payload.occupation } : {}),
      },
    },
  };
}
