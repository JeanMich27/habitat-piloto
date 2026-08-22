# Preparación de integración con n8n

## Estado actual

La aplicación no llama a n8n. Supabase sigue siendo la fuente de verdad y la
automatización queda separada en dos piezas:

```text
Frontend o n8n
      ↓
crear_o_relacionar_lead (transacción Supabase)
      ↓
leads + tareas + integration_events
      ↓
despachador futuro
      ↓
n8n / notificaciones / otros sistemas
```

La migración `20260822000200_eventos_tareas_ingesta_leads.sql` es aditiva y:

- agrega `canal_entrada` y `mensaje_entrada` a `leads`;
- crea `tareas` con RLS por broker/asesor;
- crea el outbox `integration_events`, visible al broker pero modificable solo
  por `service_role`;
- crea `crear_o_relacionar_lead(jsonb, text)` para validar, normalizar,
  deduplicar, asignar y persistir en una sola transacción;
- emite eventos de lead/tarea desde triggers, no desde componentes React.

No hay backfill de tareas o eventos para leads existentes: generar trabajo
retroactivo sin revisión humana sería riesgoso para el piloto.

## Contrato de entrada preparado

`ingest-lead` acepta `POST` con un máximo de 16 KiB:

```json
{
  "name": "Nombre del contacto",
  "phone": "+52 55 0000 0000",
  "email": "contacto@example.com",
  "source": "whatsapp",
  "origin": "Directo",
  "property_id": "propiedad-opcional",
  "message": "Mensaje inicial opcional",
  "assigned_agent_id": "asesor-opcional",
  "occupation": "ocupación opcional"
}
```

En la entrada externa se requiere nombre y al menos teléfono o correo. El alta
manual autenticada conserva la captura rápida de solo nombre; esas fichas no se
fusionan por nombre y deberán completarse después. `source` es el canal técnico;
`origin` conserva el catálogo comercial actual (`Portal`, `Referido`, `Redes`,
`Directo`). Si no llega asesor, se usa el responsable de la propiedad; si no
hay ninguno, el lead queda visible sin asignar y la tarea se crea al asignarlo.

La deduplicación usa teléfono normalizado y correo en minúsculas. Si ambos
datos apuntan a filas distintas, la operación se rechaza para revisión manual.
Nunca fusiona únicamente por nombre.

## Despliegue futuro (no ejecutado)

Aplicar primero en una copia de producción y seguir la reconciliación indicada
en `README.md`. El orden de despliegue debe ser:

1. Respaldo recuperable y comparación del esquema remoto.
2. Aplicar y probar la migración.
3. Configurar secretos de la Edge Function, nunca variables `VITE_*`:
   - `N8N_INGEST_SECRET`: valor aleatorio compartido solo entre n8n y la función.
   - `N8N_AGENCIA_ID`: oficina del piloto.
4. Desplegar `ingest-lead`; `verify_jwt = false` es intencional porque la
   autenticación servidor-a-servidor usa `X-Webhook-Secret`.
5. En n8n, enviar el secreto como credencial protegida y no incluirlo en nodos,
   logs o URLs.
6. Ejecutar pruebas con: lead nuevo, teléfono repetido, correo repetido,
   identidad ambigua, propiedad ajena, asesor inactivo y reintento.

`SUPABASE_SERVICE_ROLE_KEY` vive únicamente dentro del entorno administrado de
Supabase Edge Functions. n8n no necesita ni debe recibir esa llave.

## Paso todavía pendiente: salida del outbox

No se implementó un despachador para evitar elegir prematuramente reintentos,
destinos y credenciales. El primer flujo real debe reclamar eventos `pending`
de forma atómica, entregarlos a un webhook autenticado de n8n y marcar cada
evento `processed` o `failed`, incrementando `attempts`, `available_at` y
`last_error`. Esa operación debe vivir en backend/Edge Function y nunca en el
frontend.
