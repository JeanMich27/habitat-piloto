# Piloto WhatsApp multicanal

Fecha: 05/09/2026. Estado: local, sin migración aplicada ni despliegue.

## Qué quedó preparado

- Un canal por número y por asesor, con `phone_number_id`, WABA, modo y estado.
- Token por canal cifrado en Vault; el navegador no puede leerlo ni guardarlo.
- Bandeja de texto con conversación por cliente y estados pendiente, enviado,
  entregado, leído y fallido.
- Envío del asesor desde HomeID dentro de la ventana de servicio de 24 horas.
- Broker con lectura de todas las conversaciones laborales de su oficina y sin
  permiso de envío, incluso llamando directamente al backend.
- Acciones de cliente desde el chat: calificar, agendar cita, programar
  seguimiento y abrir la ficha.
- Protección para números personales: remitentes desconocidos solo aparecen al
  asesor como “Por identificar”. Si los marca personales, HomeID elimina el
  contenido y deja de persistir mensajes posteriores de ese contacto.
- Idempotencia por `wamid` entrante y por identificador de solicitud saliente.
- Aislamiento por oficina, canal y asesor mediante RLS/RPC.

## Qué no está listo todavía

- No hay botón de autoservicio para conectar el número. El Embedded Signup de
  Meta necesita la configuración/aprobación de la app y su intercambio seguro
  de token.
- No se importan conversaciones anteriores del teléfono.
- No se procesan todavía `history` ni `smb_message_echoes`; por tanto, un texto
  enviado desde la app de WhatsApp Business aún no se refleja en HomeID.
- No hay plantillas para responder fuera de la ventana de 24 horas.
- No hay soporte visible de imágenes, audios o documentos en este corte.

Estos límites impiden afirmar que HomeID y la app de WhatsApp Business ya están
sincronizados en ambos sentidos. El piloto actual cubre recepción estándar y
respuesta desde HomeID.

## Validación ya ejecutada

| Validación | Resultado |
|---|---|
| TypeScript | correcto |
| ESLint | correcto |
| Vitest | 229/229 |
| Build | correcto |
| Bundle inicial | 485.6 KiB de 500 KiB |
| Playwright | 14/14 |
| Migración + pgTAP | bloqueado: no hay Docker/Podman |
| Deno check | bloqueado: Deno no está instalado |

## Orden obligatorio para habilitar una prueba real

1. Ejecutar `supabase start`, `supabase db reset` y `supabase test db` en una
   computadora con Docker, o usar una branch de Supabase. No usar producción
   para descubrir errores de la migración.
2. Revisar y aprobar las migraciones pendientes de WhatsApp.
3. Publicar en este orden: migraciones, Edge Functions y frontend.
4. Confirmar en Meta que el número de prueba es elegible para Coexistence y que
   la WABA está suscrita al webhook.
5. Registrar el canal con el asesor correcto y su token por canal; nunca pegar
   el token en el frontend ni guardarlo en `wa_canales`.
6. Hacer el smoke con un asesor y dos teléfonos controlados antes de invitar al
   resto de la oficina.

## Guion del smoke controlado

1. Cliente conocido escribe al número piloto: debe aparecer como laboral solo
   para su asesor y para el broker.
2. El asesor responde desde HomeID: debe llegar un solo mensaje y avanzar por
   enviado/entregado/leído.
3. El broker abre la misma conversación: ve el texto, pero no tiene editor ni
   acciones de modificación.
4. Desde el chat, el asesor guarda una calificación, agenda una cita y programa
   seguimiento; verificar cada dato en su pantalla canónica.
5. Un número desconocido escribe: aparece únicamente al asesor como pendiente.
6. Marcarlo personal: desaparece de HomeID para el asesor, nunca aparece al
   broker y su contenido queda eliminado.
7. Repetir el mismo webhook y la misma solicitud de envío: debe existir una sola
   fila por identificador.
8. Entrar como otro asesor y como otra oficina: ninguno debe descubrir el canal,
   la conversación ni sus mensajes.

## Criterio de decisión

El piloto no se habilita para más asesores hasta que pasen las pruebas pgTAP y
el smoke real. Para prometer uso indistinto entre HomeID y WhatsApp Business,
además deben implementarse y probarse Embedded Signup, `history` y
`smb_message_echoes` con un payload real anonimizado de Meta.
