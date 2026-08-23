export const INTEGRATION_EVENT_TYPES = [
  "lead.created",
  "lead.updated",
  "lead.assigned",
  "lead.stage_changed",
  "property.created",
  "property.updated",
  "property.status_changed",
  "appointment.created",
  "appointment.updated",
  "appointment.cancelled",
  "user.created",
  "user.status_changed",
  "integration.sync.completed",
  "integration.sync.failed",
  "webhook.delivery.failed",
] as const;

export type IntegrationEventType = typeof INTEGRATION_EVENT_TYPES[number];

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  type: IntegrationEventType;
  version: number;
  occurredAt: string;
  agencyId: string;
  actorId?: string;
  entityType: "lead" | "property" | "appointment" | "user" | "integration" | "webhook";
  entityId: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
}

export interface CreateDomainEventInput<TPayload extends Record<string, unknown>> {
  id?: string;
  type: IntegrationEventType;
  version?: number;
  occurredAt?: string;
  agencyId: string;
  actorId?: string;
  entityType: DomainEvent["entityType"];
  entityId: string;
  correlationId?: string;
  causationId?: string;
  payload: TPayload;
}

export function createDomainEvent<TPayload extends Record<string, unknown>>(
  input: CreateDomainEventInput<TPayload>,
): DomainEvent<TPayload> {
  if (!input.agencyId.trim()) throw new Error("agencyId is required for integration events");
  if (!input.entityId.trim()) throw new Error("entityId is required for integration events");
  const id = input.id ?? crypto.randomUUID();
  return {
    id,
    type: input.type,
    version: input.version ?? 1,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    agencyId: input.agencyId,
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
    correlationId: input.correlationId ?? id,
    causationId: input.causationId,
    payload: input.payload,
  };
}

export function serializeDomainEvent(event: DomainEvent): string {
  return JSON.stringify(event);
}

