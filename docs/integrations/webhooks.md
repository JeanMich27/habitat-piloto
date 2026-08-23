# Webhooks HABITAT

## Salida

Cada endpoint HTTPS recibe un `POST` con `Content-Type: application/json` y:

```text
X-Habitat-Signature: v1=<hex hmac sha256>
X-Habitat-Timestamp: <unix seconds>
X-Habitat-Event: lead.created.v1
X-Habitat-Delivery: <uuid>
X-Correlation-ID: <uuid>
```

El body es el contrato de evento serializado. La firma se calcula sobre la
cadena exacta `<timestamp>.<raw body>`. El receptor debe rechazar timestamps con
más de 300 segundos de diferencia, calcular HMAC-SHA256 con su secreto y
comparar en tiempo constante. Debe deduplicar por `X-Habitat-Delivery`.

Ejemplo conceptual de body:

```json
{
  "id": "event-uuid",
  "type": "lead.created",
  "version": 1,
  "occurredAt": "2026-08-23T12:00:00Z",
  "agencyId": "agency-id",
  "entityType": "lead",
  "entityId": "lead-id",
  "correlationId": "correlation-uuid",
  "payload": { "lead_id": "lead-id", "source": "manual" }
}
```

Respuestas `2xx` confirman entrega. Timeout, `408`, `425`, `429` y `5xx` se
reintentan a 1, 5, 15 y 60 minutos. Otros `4xx` fallan sin retry. Hay como
máximo cinco intentos totales; después la entrega queda en dead letter
(`failed`) con intentos, status y error resumido.

## Entrada genérica

`POST /functions/v1/integration-inbound` usa:

```text
Authorization: HabitatKey <prefix.secret>
X-Correlation-ID: <uuid opcional>
Content-Type: application/json
```

```json
{
  "provider": "mock",
  "externalEventId": "estable-en-el-proveedor",
  "command": {
    "type": "CreateLead",
    "payload": {
      "name": "Nombre",
      "phone": "+52 55 0000 0000",
      "source": "mock"
    }
  }
}
```

El límite es 16 KiB. La API key es por agencia, revocable, expirable y con
permisos; `CreateLead` requiere `leads.write`. El resultado de la primera
ejecución se conserva por `(agencia, provider, externalEventId)` y un replay
devuelve el mismo resultado con `idempotent_replay=true`, sin repetir efectos.

Estados esperados: `200` aceptado/replay, `400` envelope inválido, `401`
credencial inválida, `413` body grande, `422` command rechazado y `5xx` fallo de
infraestructura. No se registran credenciales ni el body en logs.

