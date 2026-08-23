# Catálogo de eventos de integración

Todos los eventos son versión 1, incluyen `id`, `type`, `version`, `occurredAt`,
`agencyId`, `entityType`, `entityId`, `correlationId`, `payload` y, cuando aplica,
`actorId`/`causationId`. Los payloads evitan PII, notas internas, BANT y
documentos. Un cambio incompatible crea versión 2; la versión 1 no se muta.

| Evento | Entidad | Cuándo se emite | Payload v1 | Consumidor previsto |
|---|---|---|---|---|
| `lead.created` | lead | Alta no-directorio | IDs, asignación, origen técnico, fecha | CRM/automatización futura |
| `lead.updated` | lead | Actualización persistida | ID y fecha | CRM futuro |
| `lead.assigned` | lead | Cambia asesor | ID, asesor previo/nuevo | Notificación futura |
| `lead.stage_changed` | lead | Cambia etapa | ID, etapa previa/nueva | Pipeline futuro |
| `property.created` | property | Alta | ID y estado | CRM futuro |
| `property.updated` | property | Actualización | ID y estado | CRM futuro |
| `property.status_changed` | property | Cambia estado | ID, estado previo/nuevo | Portales futuros |
| `appointment.created` | appointment | Alta | IDs, asesor, estado, inicio | Calendario futuro |
| `appointment.updated` | appointment | Cambio no cancelado | IDs, asesor, estado, inicio | Calendario futuro |
| `appointment.cancelled` | appointment | Estado Cancelada o delete | IDs, asesor, estado, inicio | Calendario futuro |
| `user.created` | user | Alta | ID, rol, estado | Aprovisionamiento futuro |
| `user.status_changed` | user | Cambia estado de cuenta | ID, rol, estado | Revocación futura |
| `integration.sync.completed` | integration | Sync futuro exitoso | Resumen no sensible | Operación futura |
| `integration.sync.failed` | integration | Sync futuro fallido | Código/resumen | Alertas futuras |
| `webhook.delivery.failed` | webhook | Agota retries | IDs, intentos, HTTP status | Operación interna |

`task.created`, `task.completed` y otros nombres históricos pueden existir en
filas previas del outbox, pero no forman parte del catálogo público P3.1.
`comisionCompartidaPct` no participa en cálculos ni eventos contables.

