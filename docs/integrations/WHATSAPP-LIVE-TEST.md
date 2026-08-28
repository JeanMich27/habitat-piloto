# Prueba controlada de WhatsApp Coexistence

Fecha: 27/08/2026. Este checklist no autoriza crear otro proyecto Supabase ni
probar migraciones directamente sobre datos reales.

## 1. Antes de publicar

- Ejecutar la base y pgTAP en `supabase start`, o en una branch de Supabase.
- Confirmar `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run check:bundle` y `npm run e2e`.
- Confirmar que el broker que recibirá el fallback tiene
  `estado_cuenta='Activo'` y `auth_id` no nulo.
- Usar un número controlado y teléfonos de prueba autorizados en Meta.

## 2. Publicación — orden obligatorio

La publicación la ejecuta Jean:

```bash
scripts/supabase-deploy.sh migrate
scripts/supabase-deploy.sh functions
npm run deploy
```

Después, en Supabase Edge Function Secrets deben existir:

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- opcional: `WHATSAPP_GRAPH_VERSION=v26.0`
- opcional: `GEMINI_MODEL=gemini-3.6-flash`

El token de WhatsApp y la API key de Gemini siguen en Vault por oficina; no se
copian al frontend ni a este documento.

## 3. Meta

1. Callback URL:
   `https://zhtwvxarovfohhmrgqoy.supabase.co/functions/v1/whatsapp-webhook`.
2. Usar el mismo verify token configurado en Supabase.
3. Suscribir el campo `messages`.
4. Verificar que `agencia_integraciones.config.phone_number_id` coincide con el
   número que Meta entrega en el webhook.

## 4. Guion de prueba

Usar una conversación nueva o cerrar la anterior antes de cada caso.

| Caso | Mensaje | Resultado esperado |
|---|---|---|
| Saludo | “Hola, ¿qué hacen?” | una respuesta; conversación en `bot`; sin handoff |
| Precio | “¿Cuál es el precio y sigue disponible?” | respuesta breve + `pendiente_humano` + tarea + campana |
| Visita | “Quiero visitar mañana” | acuse + handoff inmediato |
| Persona | “Quiero hablar con una persona” | acuse + handoff inmediato |
| Baja | “No me contacten, stop” | un acuse y estado `bloqueada` |
| No texto | enviar una imagen | mensaje auditado + handoff por tipo no soportado |

En la plataforma:

1. abrir la campana y entrar a “WhatsApp”;
2. comprobar nombre, último mensaje, clasificación y responsable;
3. tocar **Tomar** y verificar estado “En atención”;
4. tocar **Abrir chat** y confirmar que abre el teléfono del contacto;
5. responder desde WhatsApp Business;
6. tocar **Cerrar**, escribir resultado y comprobar que la tarea queda completa.

## 5. Evidencia SQL de solo lectura

Sustituir el número por el del tester. No ejecutar borrados ni resets.

```sql
select id, telefono_whatsapp, lead_id, asignado_a, estado,
       handoff_reason, solicitado_humano_en, asignado_en, cerrada_en
from wa_conversaciones
where telefono_norm = '5512345678';

select direccion, autor, cuerpo, intent, confidence, reason_code, recibido_en
from wa_mensajes
where conversacion_id = <ID_CONVERSACION>
order by recibido_en;

select titulo, estado, asesor_id, vence_en, metadata
from tareas
where metadata ->> 'conversacion_id' = '<ID_CONVERSACION>';

select titulo, destinatario_id, leida, datos, creada_en
from notificaciones
where tipo = 'whatsapp_handoff'
  and datos ->> 'conversacion_id' = '<ID_CONVERSACION>';
```

## 6. Criterio de cierre

El piloto queda habilitado solo si cada mensaje genera como máximo una entrada,
el handoff aparece en menos de 30 segundos, una persona puede tomarlo y abrir el
chat correcto, el cierre completa la tarea y una firma inválida recibe 403.

Si falla cualquier punto: retirar temporalmente la suscripción `messages` en
Meta. No borrar conversaciones ni leads reales para “reiniciar” la prueba.
