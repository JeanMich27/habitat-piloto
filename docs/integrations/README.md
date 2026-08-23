# Fundación de integraciones P3.1

Esta capa es infraestructura; no activa automatizaciones ni conecta proveedores
productivos. La frontera canónica es:

```text
Proveedor → integration-inbound → adapter/command → RPC de aplicación
          → dominio/repositorio → Postgres + integration_events

integration_events → webhook_deliveries → dispatch-webhooks
                   → endpoint externo firmado
```

## Responsabilidades

- `src/integrations/contracts`: contratos internos sin React ni secretos.
- `integration-inbound`: limita/valida el payload, autentica con `HabitatKey` y
  transforma el envelope externo a un command controlado.
- `process_integration_lead_command`: deriva la agencia de la credencial, aplica
  idempotencia y llama al caso de uso existente dentro de una transacción.
- triggers PostgreSQL: escriben el cambio y el evento en la misma transacción.
- `dispatch-webhooks`: reclama entregas con `SKIP LOCKED`, firma el body raw,
  aplica timeout/retry y registra el resultado.

No se admite que un adapter escriba tablas de negocio directamente ni que un
payload externo llegue al dominio sin normalizarse.

## Secretos y despliegue

Variables server-side requeridas (solo nombres, nunca valores):

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
INTEGRATION_DISPATCH_SECRET
```

Las API keys inbound se generan con `provision_integration_credential`, se
devuelven una vez y solo queda su SHA-256. Los secretos HMAC outbound se generan
con `provision_webhook_endpoint`, se devuelven una vez al administrador y el
valor recuperable queda en Supabase Vault. Ninguno usa prefijo `VITE_`.

La API key resuelve `credencial → agencia → permisos`; un `agencyId` del payload
nunca concede autoridad. Revocar una credencial marca `enabled=false` y
`revoked_at`; para rotarla se crea una nueva y se revoca la anterior después de
la ventana de transición.

## Observabilidad

`integration_logs` conserva dirección, proveedor, resultado, duración,
correlation ID y un error resumido. No guarda body, API key, secreto, email,
teléfono, BANT, notas ni documentos. El mismo correlation ID se propaga de la
entrada al command, outbox y entrega.

## Operación

El dispatcher requiere `X-Dispatch-Secret` y debe invocarse con un job interno.
No se configura aquí un cron productivo. Los eventos sin endpoint suscrito se
marcan procesados; cada endpoint suscrito tiene una entrega independiente. Los
fallos terminales permanecen en `webhook_deliveries.status=failed` y producen
`webhook.delivery.failed` para diagnóstico, sin reencolarse recursivamente.

## Flujos futuros (no implementados)

### n8n

```text
lead.created → webhook HABITAT → n8n Webhook Trigger
             → verificar timestamp + HMAC → workflow
```

Una llamada de vuelta usaría `Authorization: HabitatKey <key>` con permiso
mínimo y un `externalEventId` estable. n8n nunca recibe `service_role` ni escribe
tablas internas.

### WhatsApp

```text
Meta webhook → Edge Function → WhatsApp adapter → command
             → application service → Lead/Conversation
```

El futuro adapter resolverá la agencia desde una credencial o identificador
server-side confiable, no desde contenido enviado por el contacto.

### IA

```text
Mensaje → application service → AI orchestrator → tools permitidas
        → application services
```

Un agente no tendrá `service_role`, SQL libre ni acceso directo a tablas; cada
tool corresponderá a un command autorizado y auditable.

