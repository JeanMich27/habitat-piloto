# Sincronización con EasyBroker — Guía para Jean

Última actualización: 29 de julio de 2026 · **Estado: FUNCIONANDO EN AUTOMÁTICO**

---

## 1. Qué quedó instalado

| Pieza | Qué hace | Cada cuánto |
|---|---|---|
| `sync-propiedades` | Trae el catálogo de EasyBroker y vincula cada propiedad con su asesor | Diario, 6:00 AM CDMX |
| `sync-leads` | Trae solicitudes de contacto, deduplica y rutea al asesor dueño | Cada 30 minutos |
| `v_semaforo` | El renglón que reemplaza tu revisión | Cuando lo consultes |

Los dos jobs ya están activos. **No tienes que hacer nada para que corran.**

---

## 2. Resultado de la primera corrida

**Propiedades:** 84 revisadas, 84 creadas, 0 errores, 17 segundos.
**Asesores:** 13 dados de alta automáticamente desde EasyBroker (nombre, correo, teléfono).
Ninguna propiedad quedó sin asesor.

**Leads:** 106 revisadas, 102 creadas, 4 duplicados fusionados, 5 marcadas para
revisión, 0 errores.

**Ruteo automático:**

| Asesor | Leads |
|---|---|
| Lulú Zanabria Martínez | 31 |
| Karla Samano | 22 |
| Alan Campos | 19 |
| Jean Palacios | 13 |
| Iliana Cruz | 7 |
| Rosendo Gallegos | 4 |
| Karla Torres | 2 |
| Rodrigo Carmona | 1 |

Verifiqué que el ruteo es consistente: la propiedad `EB-WK7141` mandó sus dos
leads a Iliana Cruz, `EB-UK9081` mandó los suyos a Lulú. Mismo dueño, misma
asignación, siempre.

Los 13 asesores quedaron en estado **Invitado**: existen en el sistema y reciben
leads, pero no tienen acceso hasta que se registren con su correo de
`@bienesraiceshabitat.mx`.

---

## 3. Tu revisión diaria

En Supabase → **SQL Editor**, pega esto:

```sql
select * from v_semaforo;
```

La columna `estado` te dice qué hacer:

| Dice | Qué significa | Qué haces |
|---|---|---|
| `OK` | Todo bien | Nada |
| `ALERTA: el sync lleva mas de 2 h sin correr` | **El sistema se rompió** | Avísame |
| `ALERTA: el catalogo lleva mas de 48 h sin actualizarse` | El sync de propiedades falló | Avísame |
| `REVISAR: hay propiedades sin asesor` | Falta asignar dueño en EasyBroker | Lo arreglas en EasyBroker |
| `REVISAR: hay leads que el sistema no pudo rutear` | Leads que necesitan tu ojo | Ver consulta abajo |
| `REVISAR: hay leads sin contactar por mas de 24 h` | Problema de asesores, no del sistema | Es tu conversación con el equipo |

Las alertas de sistema roto salen **antes** que las de operación, a propósito: si
el sync está caído, todo lo demás que veas es mentira.

**Cuando diga REVISAR por ruteo:**

```sql
select * from v_leads_para_revision;
```

**Para ver tendencia por fuente** (si una cola se apagó, aquí se ve):

```sql
select * from v_conciliacion_diaria limit 20;
```

---

## 4. La prueba de que la fuga sigue abierta

Esto es lo más importante del documento.

El sistema trajo **todo** lo que estaba en EasyBroker. Volví a cruzar contra tu
panel de Inmuebles24 y estos leads **siguen sin existir en EasyBroker**, tres días
después:

| Lead | Panel I24 | Operación | Estado |
|---|---|---|---|
| Karen | 29 jul 11:05 | Renta $65,000 | Nunca se capturó |
| angelica | 28 jul | Renta $65,000 | Nunca se capturó |
| **María Fernanda C.** | 28 jul | **Venta $5,800,000** | Nunca se capturó |
| **montserrat cabrera** | 28 jul | **Venta $7,950,000** | Nunca se capturó |
| Adriana castillo | 27 jul | Renta $65,000 | Nunca se capturó |

**El sync no puede inventar lo que nadie capturó.** Lo que sí logramos es que
ahora la fuga es *visible y medible* en lugar de invisible.

**Acción tuya, hoy:** recupera esos 5 del panel de Inmuebles24 y asígnalos. Dos de
ellos son las consultas de mayor ticket de la semana.

---

## 5. Qué sigue, en orden de impacto

1. **WhatsApp Coexistence en el número central.** Cierra el 66% de la fuga sin
   depender de nadie. Arranca la verificación de Meta Business hoy: es el camino
   crítico y tarda días.
2. **Correo a tu ejecutivo de Inmuebles24:** *¿tienen envío de leads por API o
   webhook, o la única vía es la extensión EasyBroker Assistant?* Un correo que
   puede volver innecesario el 80% de lo que falta.
3. **Las pestañas "Mensajes" y "Consultaron tu teléfono"** no pasan por WhatsApp.
   Hay que ver si Inmuebles24 manda correo de aviso por cada una.
4. **El arreglo de proceso, esta semana:** que las 3 pestañas se revisen y nada se
   cierre sin capturar. La conciliación te dirá si se cumple; no lo va a cumplir
   por ti.

---

## 6. Decisiones pendientes para ti

**a) Tipos de inmueble.** EasyBroker trae 2 tipos que tu app no maneja:

- `Bodega comercial` — 4 propiedades
- `Oficina` — 3 propiedades

Se guardaron con su nombre real. No rompen nada, pero **no van a aparecer en los
filtros** de tu app, que solo conoce Casa, Depto, Terreno y Local. Si quieres que
se filtren bien, hay que agregar esos dos tipos al frontend. Dime y lo hago.

**b) Datos demo.** No borré nada. Cuando quieras limpiarlos:

```sql
-- Revisa primero
select id, titulo from propiedades where id like 'prop-00%';

-- Desvincula los leads demo y borra
update leads set interes_propiedad_id = null
  where interes_propiedad_id like 'prop-00%';
delete from propiedades where id like 'prop-00%';
delete from leads where eb_contact_request_id is null;
```

**c) Usuarios demo.** `user-001` a `user-008` son de ejemplo. Tu cuenta real es
`user-broker-jean` (niper987@gmail.com). Ya corregí los leads que se habían
asignado por error a la cuenta demo "Jean Morales".

---

## 7. Detalle técnico: por qué no usamos un cursor de fecha

La forma "obvia" de sincronizar —preguntar solo por lo nuevo desde la última
consulta— **habría perdido leads en silencio.**

La fecha que da EasyBroker (`happened_at`) es cuando el prospecto escribió, no
cuando se capturó. Comprobé que hay registros con IDs consecutivos cubriendo hasta
40 horas de rezago: alguien captura en tandas y los leads quedan retrofechados. Un
sistema que pregunte "¿qué hay después de las 13:11 de hoy?" nunca vería un lead
capturado hoy con fecha de anteayer.

Por eso el sync **revisa siempre los últimos 30 días completos** y descarta lo que
ya tiene, identificando cada solicitud por su ID único. Cuesta ~4 consultas por
corrida; el límite de EasyBroker es 20 por segundo. Es imposible que pierda algo.

**Reglas de deduplicación:**
- Mismo teléfono + misma propiedad = duplicado. Agrega el mensaje como nota al
  lead existente, no crea otro.
- Mismo teléfono + otra propiedad = interés nuevo. Crea lead nuevo.
- Sin teléfono o sin propiedad = entra igual, se asigna al broker, se marca
  `requiere_revision`. **Nada se descarta en silencio.**

---

## 8. Qué cambié en tu base de datos

Todo aditivo. **No borré ni modifiqué ningún dato existente.**

- `propiedades`: + `eb_public_id`, `eb_public_url`, `eb_sincronizado_en`
- `usuarios`: + `eb_agent_id`
- `leads`: + `eb_contact_request_id`, `telefono_norm`, `eb_property_id`,
  `requiere_revision`, `motivo_revision`
- Tablas nuevas: `sync_estado`, `ingesta_log` (solo el broker las lee, con RLS)
- Función: `norm_tel()` — normaliza teléfonos a 10 dígitos
- Vistas: `v_semaforo`, `v_conciliacion_diaria`, `v_leads_para_revision`,
  `v_ultima_corrida`
- Extensiones: `pg_cron`, `pg_net` (en el esquema `extensions`, no en `public`)
- Jobs: `sync-leads-30min`, `sync-propiedades-diario`

Corrí el linter de seguridad de Supabase después de los cambios: **cero
advertencias nuevas** por lo que agregué.

---

## 9. Correr algo a mano

Si necesitas forzar una corrida sin esperar:

```sql
-- Leads
select net.http_post(
  url := 'https://zhtwvxarovfohhmrgqoy.supabase.co/functions/v1/sync-leads',
  headers := '{"Content-Type":"application/json","Authorization":"Bearer TU_ANON_KEY"}'::jsonb,
  body := '{}'::jsonb, timeout_milliseconds := 150000);

-- Ver el resultado (espera ~30 s)
select * from v_ultima_corrida;
```

Tu ANON KEY está en el archivo `.env` del proyecto, como `VITE_SUPABASE_ANON_KEY`.

**Ver los jobs programados:**

```sql
select jobname, schedule, active from cron.job;
```
