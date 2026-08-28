# WhatsApp y automatizaciones — diagnóstico y diseño operativo

Fecha de corte: 27/08/2026.

Este documento define el punto de partida para trabajar WhatsApp. No autoriza
un despliegue. Las reglas de `AGENTS.md` y `ESTADO-DE-LA-PLATAFORMA.md` tienen
precedencia si otro documento del repositorio las contradice.

## Estado del Corte 1 (árbol local, aún no publicado)

Implementado el 27/08:

- HMAC falla cerrado y el body tiene límite de 64 KiB;
- `registrar_mensaje_whatsapp_entrante` deduplica y usa
  `crear_o_relacionar_lead` dentro de una transacción;
- la asignación conserva únicamente responsables activos con `auth_id`; si no,
  cae a un broker con acceso;
- Gemini devuelve clasificación estructurada y el código aplica la regla;
- handoff crea/actualiza tarea y notificación de forma transaccional;
- RLS limita conversaciones al broker o responsable;
- campana persistida y vista “WhatsApp” con Tomar, Abrir chat y Cerrar;
- tipos no-texto se registran y escalan, en vez de desaparecer;
- el webhook responde a Meta después de persistir y deja IA/envío en
  `EdgeRuntime.waitUntil`.

Verificado localmente: typecheck, lint, 188 pruebas Vitest, build, presupuesto de
bundle y 14 E2E. No verificado todavía: migración/pgTAP local (falta
Docker/Podman), Deno check (Deno no está instalado) y smoke real de Meta. Nada
de este corte está aún en producción.

## 1. Veredicto

Producción tiene un piloto funcional de recepción y respuesta, pero todavía no
tiene el Corte 1 apto para operar con clientes reales. El código local ya cierra
la mayor parte de las brechas; no cuenta como disponible hasta publicar base,
función y frontend, y completar el smoke controlado.

No falta “conectar un chatbot”. Antes faltan cinco garantías:

1. autenticación cerrada del webhook;
2. alta y deduplicación por el caso de uso canónico;
3. asignación y handoff visibles para una persona responsable;
4. estados conversacionales recuperables;
5. pruebas y observabilidad del circuito completo.

Agregar n8n ahora duplicaría responsabilidades y otro punto de fallo. El flujo
principal debe permanecer en Supabase y utilizar los RPC, RLS, outbox y logs que
ya existen. n8n puede agregarse después como consumidor de eventos firmados,
nunca como escritor directo de tablas ni custodio de `service_role`.

## 2. Lo que existe hoy

### Plataforma

- React, Vite y TypeScript con UI → Application → Domain → Repositories →
  Supabase.
- Un solo proyecto Supabase de producción y una sola rama de entrega: `master`.
- Multi-tenant por `agencia_id`, con RLS/RPC como autoridad.
- Roles: broker, asesor independiente, asesor de equipo, propietario y cliente.
- CRM de propiedades y leads, embudo, BANT, agenda/ICS, tareas, reportes,
  importación, comisiones, portales, documentos PDF y micrositio público del
  asesor.
- Sincronización automática de propiedades, contactos y leads de EasyBroker.
- Frontera P3.1: credenciales M2M por tenant, comandos, eventos transaccionales,
  endpoints salientes firmados, reintentos y auditoría.

### Tres experiencias distintas llamadas “WhatsApp”

| Experiencia | Implementación actual | Entra al webhook |
|---|---|---|
| Asesor escribe desde el CRM | Abre `wa.me` con texto sugerido y registra el clic como interacción | No |
| Visitante del micrositio escribe al asesor | Abre `wa.me` con el teléfono personal del perfil | Solo si ese número está conectado a la Cloud API |
| Mensaje al número conectado con Meta | `whatsapp-webhook` crea conversación/lead, consulta Gemini y responde | Sí |

Hoy estos caminos no comparten bandeja, estado ni trazabilidad. La decisión de
usar un número central o los números de cada asesor cambia el producto y debe
resolverse antes de modificar los CTA del micrositio.

### Piloto `whatsapp-webhook`

Ya implementa:

- handshake GET de Meta;
- verificación HMAC del POST cuando existe `WHATSAPP_APP_SECRET`;
- resolución de oficina por `phone_number_id`;
- conversaciones y mensajes separados por agencia;
- deduplicación básica por `wa_message_id`;
- creación de un lead en el primer mensaje;
- respuesta breve generada con Gemini;
- silencio del bot después de detectar intención de precio/compra/visita;
- notificación a brokers activos;
- secretos de WhatsApp y Gemini en Vault por oficina.

La función está desplegada, pero el estado canónico del proyecto indica que
faltan `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` y repuntar Meta al endpoint
de producción. “Desplegada” no significa “operativa”.

## 3. Brechas que bloquean tráfico real

### P0 — seguridad e integridad

1. **La firma falla abierta.** Si `WHATSAPP_APP_SECRET` está vacío, el POST se
   acepta. Un tercero podría fabricar mensajes, crear leads, consumir Gemini y
   provocar envíos con el token real de la oficina. En producción debe fallar
   cerrado.
2. **El body no tiene límite ni esquema tipado.** Se procesa como `any` y se
   confía en estructuras anidadas de Meta sin validación exhaustiva.
3. **La creación del lead evita el caso de uso canónico.** Inserta directo en
   `leads` en lugar de usar `crear_o_relacionar_lead`/
   `process_integration_lead_command`. Pierde deduplicación por teléfono/correo,
   idempotencia de integración, asignación, `canal_entrada=whatsapp` y
   `mensaje_entrada`.
4. **La recepción no es atómica.** Conversación, mensaje y lead se escriben en
   operaciones independientes cuyos errores se ignoran en varios puntos. La
   función puede responder 200 después de una escritura parcial.
5. **El webhook llama a Gemini y a Meta antes de devolver 200.** El acuse queda
   expuesto a latencia externa y reintentos. Recepción y procesamiento deben
   separarse mediante una cola persistente.

### P0 — operación humana

1. **No existe bandeja de conversaciones.** Las tablas `wa_conversaciones` y
   `wa_mensajes` no tienen consumidor en `src/`.
2. **El handoff es invisible.** `whatsapp-webhook` escribe en
   `notificaciones`, pero la campana construye otra lista en memoria y nunca lee
   esa tabla.
3. **Las preferencias de notificación no gobiernan ninguna automatización.** La
   pantalla permite guardarlas, pero no filtran los avisos calculados ni los
   persistidos.
4. **No se asigna responsable.** El lead de WhatsApp nace sin asesor ni
   propiedad; por ello tampoco queda una tarea accionable para una persona.
5. **Once asesores siguen sin cuenta de acceso.** No deben recibir una asignación
   operativa hasta estar activos; en caso contrario el trabajo vuelve a quedar
   en una cartera inaccesible.

### P0 — estado conversacional

1. `bot → humano` puede ser permanente: no hay UI ni regla que permita tomar,
   cerrar y reabrir una conversación.
2. `cerrada` no tiene una transición explícita cuando llega un mensaje nuevo.
3. “Quiero hablar con una persona” no está modelado como intención obligatoria
   de handoff; el piloto solo escala precio, compra/renta inmediata o visita.
4. Un error de Gemini deja al cliente sin respuesta; no existe fallback
   determinista.
5. Los mensajes de audio, imagen, documento, ubicación e interactivos se
   ignoran y no quedan visibles para el equipo.
6. Los webhooks de estado (`sent`, `delivered`, `read`, `failed`) se ignoran; un
   ID devuelto por Meta solo confirma aceptación, no entrega.

### P1 — calidad del agente

- Solo ve el último texto; no conoce historial, lead, propiedad ni asesor.
- No consulta inventario ni disponibilidad real.
- El prompt mezcla respuesta y clasificación en una sola llamada.
- No hay detección explícita de baja/opt-out, urgencia, queja, fraude, datos
  sensibles o idioma.
- No hay horario, SLA, máximo de turnos automáticos ni límite de costo.
- La versión de Graph API ahora se configura con `WHATSAPP_GRAPH_VERSION` y usa
  `v26.0` por defecto; debe confirmarse otra vez al publicar futuros cortes.
- `gemini-3.6-flash` sí es un modelo estable vigente, pero el modelo debe ser
  configuración versionada y medirse antes de cambiarlo.

### Cobertura al iniciar el diagnóstico (26/08)

- TypeScript: verde.
- ESLint: verde.
- Vitest: 181 pruebas verdes.
- No hay pruebas de `whatsapp-webhook`.
- `npm run edge:check` no incluye `whatsapp-webhook` y en esta máquina no puede
  correr porque Deno no está instalado.
- No hay E2E de handoff, bandeja, envío humano ni cierre/reapertura.

## 4. Arquitectura objetivo

```text
Meta
  ↓ GET handshake / POST firmado
whatsapp-webhook (adaptador del proveedor)
  1. valida método, tamaño, firma, estructura y phone_number_id
  2. deduplica por wamid
  3. persiste recepción atómica y la deja pendiente
  4. responde 200 sin esperar IA ni envío
  ↓
cola persistente de mensajes WhatsApp
  ↓
procesador de conversación
  1. resuelve agencia y contexto confiable
  2. crea/relaciona lead mediante RPC canónico
  3. asigna asesor o cola del broker
  4. aplica reglas deterministas
  5. solicita clasificación/respuesta estructurada a IA cuando corresponda
  6. registra acción, respuesta, costo y correlation_id
  ↓
Meta Send API + estados de entrega
  ↓
bandeja y notificación persistente en la plataforma
```

El mensaje del contacto puede aportar intención, pero nunca autoridad. La
agencia se resuelve por `phone_number_id`; la propiedad y el asesor solo por un
contexto emitido por la plataforma o por una relación ya almacenada.

### Estados propuestos

```text
bot
 ├─ solicitud humana / riesgo / alta intención → pendiente_humano
 ├─ opt-out                               → bloqueada
 ├─ error no recuperable                  → requiere_revision
 └─ cierre automático permitido           → cerrada

pendiente_humano → humano_asignado → cerrada
cerrada + mensaje nuevo → bot o pendiente_humano, según política/contexto
```

No se debe reutilizar `humano` como “avisado”, “asignado” y “atendido”. Son
hechos distintos y requieren timestamps y responsable.

## 5. Flujos de trabajo

### F0. Activación técnica

1. Configurar verify token y App Secret en secretos de la Edge Function.
2. Confirmar el registro de WhatsApp por agencia en `agencia_integraciones`,
   con `phone_number_id`, WABA y token en Vault.
3. Repuntar Meta a la URL de producción y suscribir el campo `messages`.
4. Probar GET válido/inválido y POST firmado/inválido.
5. No habilitar tráfico real si falta cualquier validación P0.

### F1. Contacto nuevo

1. Meta entrega un texto con `wamid` y `phone_number_id`.
2. Se valida firma, tamaño y esquema; se resuelve la agencia.
3. Una transacción registra mensaje/conversación y ejecuta el alta canónica.
4. Deduplicación:
   - mismo `wamid`: replay, sin efectos;
   - mismo teléfono/correo: relacionar con el lead existente;
   - identidad ambigua: no fusionar, enviar a revisión humana.
5. Se intenta resolver contexto de propiedad/asesor.
6. Sin contexto confiable: asignar a cola del broker, nunca a un asesor
   inactivo.
7. Crear tarea con SLA y notificación persistente.
8. El agente se identifica como asistente automático y hace una sola pregunta
   útil para continuar.

### F2. Contacto desde micrositio o campaña

1. El CTA usa el número definido por el negocio.
2. Incluye un token opaco firmado o identificador estable de campaña; no confía
   en texto libre para decidir agencia, propiedad o asesor.
3. El backend resuelve el token y conserva atribución.
4. Si apunta a una propiedad, se asigna al responsable activo de esa propiedad;
   si no existe, al broker.
5. El agente puede reconocer la intención precalificada, pero solo comunica
   datos públicos consultados en ese momento.

### F3. Lead existente

1. Relacionar por teléfono normalizado dentro de la misma agencia.
2. Conservar el asesor vigente; no reasignar por un mensaje nuevo.
3. Agregar interacción al historial y actualizar último contacto.
4. Crear una nueva tarea solo si no hay una pendiente equivalente.
5. Si otro asesor intenta tomarlo, aplicar la regla de permisos/RPC, no una
   decisión del modelo.

### F4. Handoff humano

Disparadores obligatorios:

- el contacto pide explícitamente una persona;
- precio, oferta, negociación, visita o decisión inmediata;
- queja, amenaza, fraude, discriminación, emergencia o tema legal/financiero;
- el agente no tiene datos suficientes o falla dos veces;
- mensaje no soportado;
- máximo de turnos automáticos alcanzado.

Acciones atómicas:

1. pasar a `pendiente_humano`;
2. asignar responsable y vencimiento;
3. crear tarea y notificación visibles;
4. responder al contacto que una persona continuará, sin prometer un horario
   imposible;
5. detener respuestas automáticas posteriores;
6. registrar quién tomó, respondió y cerró.

### F5. Fuera de horario

1. Confirmar recepción.
2. Informar el horario real configurado para la oficina.
3. Capturar intención mínima.
4. Crear tarea para el siguiente periodo laboral.
5. Handoff inmediato solo si existe guardia configurada; no inventarla.

### F6. Ventana de 24 horas y mensajes proactivos

- Dentro de 24 horas desde el último mensaje del usuario se permiten respuestas
  libres.
- Fuera de la ventana solo se envían plantillas aprobadas y con la base de
  consentimiento correspondiente.
- Ninguna automatización reactiva debe convertirse en campaña masiva.
- La expiración se calcula desde el último mensaje del usuario, no desde el
  último mensaje del bot.

La política de WhatsApp permite automatización, pero exige una vía clara y
directa de escalamiento humano. Ver: <https://whatsappbusiness.com/policy/>.

### F7. Baja y privacidad

1. “No me escriban”, “baja”, “stop” o equivalente cambia el estado a
   `bloqueada` y registra la razón sin conservar texto innecesario.
2. Confirmar una sola vez la baja.
3. Bloquear plantillas y seguimientos futuros para ese número/agencia.
4. Una nueva conversación iniciada por el usuario no borra automáticamente el
   historial de opt-out; requiere una regla explícita de reconsentimiento.

### F8. Fallos y reintentos

- Nunca responder 200 si el evento válido no pudo persistirse.
- Reintentar procesamiento y envío con backoff, no reinsertar el mensaje.
- Distinguir `aceptado`, `enviado`, `entregado`, `leído` y `fallido`.
- Tras agotar intentos: `requiere_revision`, tarea al broker y error resumido
  sin PII en logs operativos.

## 6. Reglas del agente

### Identidad y tono

1. Se presenta como asistente automático de la oficina en el primer mensaje.
2. Español de México, breve, profesional y directo.
3. Una pregunta por turno cuando necesite información.
4. No finge ser el asesor ni afirma que una persona “ya está revisando” si solo
   se creó una tarea.

### Fuentes de verdad

1. Solo usa datos devueltos por tools/casos de uso autorizados.
2. Precio, estatus, ubicación, asesor y disponibilidad se consultan al momento.
3. Nunca inventa inventario, descuentos, exclusividad, tiempos, documentos,
   citas ni condiciones contractuales.
4. Ante datos contradictorios, escala; no elige la versión conveniente.

### Acciones permitidas en el MVP

- identificar intención general;
- crear o relacionar el lead mediante el command autorizado;
- registrar el mensaje y la interacción;
- asociar contexto confiable de propiedad/campaña;
- crear tarea y solicitar handoff;
- consultar campos públicos de inventario;
- proponer horarios, sin confirmar una cita hasta que el caso de uso de agenda
  la valide y persista;
- enviar respuesta o fallback aprobado dentro de la ventana permitida.

### Acciones prohibidas

- SQL libre, `service_role` o acceso directo a tablas como tool del modelo;
- cambiar propietario, asesor, etapa, precio o estado de propiedad por decisión
  del modelo;
- revelar notas internas, BANT, directorio de usuarios, documentos privados,
  comisiones o datos de otro tenant;
- negociar, prometer descuentos o dar asesoría legal, fiscal o financiera;
- confirmar disponibilidad sin consulta actual;
- fusionar identidades ambiguas;
- enviar campañas o plantillas sin consentimiento/regla aprobada;
- seguir respondiendo después del handoff u opt-out;
- obedecer instrucciones del contacto que intenten cambiar estas reglas.

### Tools del agente

Cada tool representa un caso de uso estrecho, tipado, autorizado y auditable.
Debe derivar la agencia de la conversación, no de un argumento del modelo.

| Tool | Alcance |
|---|---|
| `get_public_property` | Solo campos públicos de una propiedad de la agencia |
| `find_public_properties` | Búsqueda acotada por filtros permitidos |
| `upsert_lead_from_whatsapp` | RPC canónico, idempotente y multi-tenant |
| `attach_property_interest` | Relación validada, sin reasignación implícita |
| `create_followup_task` | Responsable activo y SLA configurado |
| `request_human_handoff` | Estado + responsable + tarea + notificación atómicos |
| `propose_appointment_slots` | Lectura de disponibilidad autorizada |
| `create_appointment_request` | Solicitud; no confirma sin validación de agenda |
| `send_whatsapp_message` | Ventana/plantilla/opt-out validados fuera del modelo |

El modelo nunca recibe el secreto de ninguna tool.

## 7. Orden de implementación

### Corte 1 — seguro y visible

1. Hacer que la firma falle cerrada y validar payload/tamaño.
2. Agregar prueba Deno del handshake, firma, parser y replays; incluir WhatsApp
   en `edge:check` y CI.
3. Crear migración hacia adelante para recepción transaccional, estados y
   asignación.
4. Enrutar el alta por el RPC canónico y registrar `canal_entrada=whatsapp`.
5. Conectar la campana a `notificaciones` o crear la bandeja mínima; la lectura
   debe persistir en servidor.
6. Crear tarea/SLA y fallback al broker.
7. Separar acuse de Meta y procesamiento.

### Corte 2 — operación humana

1. Bandeja por conversación con permisos por agencia/asignación.
2. Tomar, responder, transferir, cerrar y reabrir.
3. Estados de entrega y manejo visible de mensajes no-texto.
4. Realtime o refresco controlado.
5. Preferencias de notificación reales, no controles decorativos.

### Corte 3 — agente con contexto

1. Clasificador estructurado separado de la redacción.
2. Tools mínimas de inventario, lead, tarea, handoff y agenda.
3. Contexto acotado de conversación y límites de turnos/costo.
4. Métricas y evaluación con conversaciones ficticias.
5. Plantillas aprobadas solo después de resolver consentimiento y casos de uso.

Base de datos primero, Edge Functions después y frontend al final. Cada corte se
fusiona a `master` el mismo día y se publica en ese mismo orden.

## 8. Estrategia de pruebas

### Unitarias / Deno

- normalización MX y otros países sin mutilar números;
- firma válida, inválida y secreto ausente;
- tamaño máximo y payloads incompletos;
- texto, status y tipos no-texto;
- clasificación de handoff, opt-out y fallback;
- transición de estados;
- deduplicación por `wamid`;
- ventana de 24 horas y selección de plantilla;
- errores y timeouts de Gemini/Meta.

### pgTAP en Supabase local o branch

- aislamiento agencia A/B en conversaciones, mensajes, notificaciones y tareas;
- `phone_number_id` solo resuelve su agencia;
- misma identidad no crea dos leads;
- identidad ambigua falla cerrado;
- reintento no repite lead, tarea, notificación ni respuesta;
- asesor inactivo nunca recibe trabajo;
- handoff crea estado, responsable, tarea y notificación en una transacción;
- solo destinatario puede leer/marcar su notificación;
- ninguna sesión obtiene secretos o mensajes de otra oficina.

### Integración local

- GET de Meta válido e inválido;
- POST firmado con fixture real anonimizado;
- respuesta rápida tras persistencia;
- procesamiento asíncrono exitoso y con retry;
- Meta acepta el envío y luego reporta delivered/read/failed;
- Gemini caído usa fallback y genera alerta operativa.

### E2E de plataforma

1. Mensaje nuevo aparece en bandeja y campana.
2. El responsable abre el lead/conversación exactos.
3. Toma el handoff; el bot deja de responder.
4. Envía respuesta y ve su estado.
5. Cierra; un mensaje nuevo aplica la política de reapertura.
6. Un usuario de otra agencia no puede descubrir ni abrir la conversación.

### Smoke controlado de producción

Solo después de local/branch y del despliegue base → funciones → frontend:

1. usar un número de prueba autorizado;
2. enviar un texto neutro y verificar un solo lead/mensaje/respuesta;
3. repetir el mismo payload y comprobar cero efectos nuevos;
4. pedir una persona y comprobar notificación visible, tarea y silencio del bot;
5. tomar/cerrar desde la app;
6. probar firma inválida y confirmar 403;
7. documentar IDs y limpiar únicamente fixtures identificados, sin reset.

## 9. Métricas mínimas

- webhooks recibidos, rechazados y duplicados;
- tiempo de acuse y de primera respuesta;
- mensajes pendientes/fallidos por etapa;
- respuestas aceptadas, entregadas, leídas y fallidas;
- leads creados vs relacionados vs ambiguos;
- conversaciones sin asignar;
- handoffs, tiempo hasta toma y tiempo hasta primera respuesta humana;
- opt-outs;
- uso, latencia y error del modelo, sin guardar prompts con PII en logs.

## 10. Decisiones de negocio antes del Corte 2

1. **Número de entrada:** central con WhatsApp Coexistence o teléfonos de cada
   asesor. Recomendación para el piloto: central; los CTA llevan contexto del
   asesor/propiedad y la plataforma rutea.
2. **Alcance del agente:** recomendación inicial: recepción, contexto mínimo,
   clasificación y handoff. No negociación ni confirmación autónoma de citas.
3. **Regla de asignación:** recomendación: responsable activo de la propiedad;
   si no existe, broker/cola central con SLA. Nunca round-robin silencioso.
4. **Horario y SLA:** deben existir por oficina antes de prometer tiempos.
5. **Plantillas y opt-in:** definir casos permitidos antes de cualquier mensaje
   proactivo.

## 11. Deuda documental que puede inducir errores

`docs/cloud-development.md`, `DEPLOY.md`, `supabase/README.md` y comentarios del
webhook todavía describen `HABITAT DEV`, `supabase-dev.yml` y
`scripts/supabase-dev.sh`, aunque esos caminos ya no existen y contradicen las
reglas actuales. Ningún agente debe seguir esas instrucciones. Deben retirarse
o reescribirse en una tarea separada para que el repositorio vuelva a tener una
sola historia operativa.
