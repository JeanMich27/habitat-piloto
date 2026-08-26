# Barrido de duplicados — 26/08/2026

Origen: el micrositio estuvo construido, migrado y desplegado durante días sin
ser alcanzable, porque había **dos menús** y `App.tsx` pintaba el que no tenía
"Mi Micrositio". Las 178 pruebas pasaban en verde probando el otro.

Este documento busca el mismo patrón en el resto de las capas. Método: 226
exports revisados, cruce de cada símbolo contra su uso real en `src/`, en
`tests/` y en `supabase/functions/`; contraste de las llamadas del frontend
contra los objetos que existen en producción, en ambos sentidos.

**El patrón, en una línea:** dos implementaciones de lo mismo, la app ejecuta
una, la otra acumula cobertura de pruebas o datos que nadie mira.

---

## Resumen

| # | Hallazgo | Impacto hoy | Riesgo si se ignora |
|---|---|---|---|
| 1 | Notificaciones: tabla que nadie lee | **3 avisos perdidos**, uno de WhatsApp | Alto — crece con cada mensaje |
| 2 | BANT con tres implementaciones que no coinciden | Ninguno (0 leads afectados) | Alto — se activa al calificar |
| 3 | 21 copias viejas de vistas dentro de `src/` | Búsquedas contaminadas | Medio — repite el bug original |
| 4 | `useAppNavigation` quedó muerta | Ninguno | Bajo |
| 5 | Capas envoltorio sin consumidor | Ninguno | Bajo |
| 6 | Componentes Kanban huérfanos | Ninguno | Bajo |

Lo verificado y **sano**: las 17 RPCs que llama el frontend existen en
producción; las 39 migraciones coinciden; las 13 Edge Functions están
desplegadas; ninguna vista de `src/views` quedó sin importar.

---

## 1. Notificaciones: se escriben en un lugar y se leen en otro

El más caro, y el único que ya está perdiendo información.

`src/lib/notificaciones.ts` abre con este comentario:

> *"No hay tabla de notificaciones ni proceso que las genere: se calculan al
> vuelo a partir de lo que ya está en la base."*

**El comentario es falso.** La tabla `notificaciones` existe en producción, tiene
**3 filas**, y hay tres productores escribiendo en ella:

| Productor | Qué avisa |
|---|---|
| `whatsapp-webhook` (edge) | un prospecto pidió hablar con una persona |
| `notificar_solicitud_estado` (trigger) | cambio de estado de una solicitud |
| `evaluar_notificaciones_micrositio` (trigger) | avisos del micrositio |

El frontend **nunca hace `from("notificaciones")`**. El badge que se ve en la
barra superior lo calcula `notificaciones.ts` al vuelo desde leads y propiedades:
un conjunto distinto, que no incluye nada de lo anterior.

Consecuencia concreta: cuando un prospecto escribe por WhatsApp pidiendo un
humano, se genera el aviso y **nadie lo ve nunca**. Es un lead caliente en una
bandeja invisible.

**Decisión pendiente, no técnica:** o el frontend lee la tabla y la fusiona con
los avisos calculados, o se retiran los tres productores. Lo que no puede
quedarse es el estado actual, que es el peor de los dos: cuesta escribir y no
sirve para nada. Recomiendo leer la tabla — el aviso de handoff de WhatsApp es
justo el tipo de señal que justifica la integración.

## 2. BANT: tres implementaciones, dos reglas distintas

| Dónde | Regla | ¿Corre? |
|---|---|---|
| `src/domain/leads/qualification.ts` → `evaluarBant` | los 4 campos presentes **y válidos contra el catálogo** | **Sí**, en el frontend |
| `public.bant_completo(jsonb)` en Postgres | los 4 campos presentes, sin validar valores | **Sí**, en el trigger `exigir_bant_para_avanzar` |
| `src/types.ts` → `bantCompleto` | los 4 presentes, sin validar | No, muerta |

Las dos que corren **no coinciden**. Un lead con `presupuesto` fuera del
catálogo —importado de EasyBroker, o sobreviviente de un cambio de catálogo— es:

- **inválido** para el frontend: `calificado: false`, y `puedeAvanzarAEtapa`
  impide moverlo;
- **válido** para la base: el trigger lo deja pasar.

La base es la más permisiva, así que la regla estricta no se burla. Pero
cualquier escritura que no pase por la interfaz (el sync de EasyBroker,
`crear_o_relacionar_lead`, una integración) puede dejar un lead en Visitado,
Negociación o Cierre con BANT inválido; y al asesor la app le va a decir que no
está calificado **sin explicarle por qué** ni dejarlo avanzar.

**Impacto medido hoy: cero.** De 1,331 leads, sólo 4 tienen BANT y **ninguno**
está en etapa avanzada. Por eso esto es una bomba de tiempo y no un incendio: se
activa en cuanto los asesores empiecen a calificar de verdad — es decir, en
cuanto entren.

Arreglo correcto: que Postgres valide contra el catálogo igual que el frontend,
en una migración nueva, y que `types.ts:bantCompleto` desaparezca. No al revés:
relajar el frontend perdería la validación.

Nota aparte: `ETAPAS_QUE_EXIGEN_BANT` en `types.ts` está muerta, mientras
`puedeAvanzarAEtapa` **repite la lista a mano** (`["Visitado","Negociacion","Cierre"]`).
Editar la constante no cambia nada. Mismo trampa que el menú, en miniatura.

## 3. Veintiuna copias viejas de vistas dentro de `src/`

Archivos `.fuse_hidden*` — restos de archivos borrados mientras estaban abiertos
en el montaje remoto. No los rastrea git y están ignorados, pero **viven dentro
de `src/`** y contienen copias completas de vistas reales.

No es teórico: durante este mismo barrido, un grep de `"notificaciones"` devolvió
`src/views/.fuse_hidden0000002800000013` junto a `Configuracion.tsx`, y el grep
inicial del menú tropezó con `src/.fuse_hidden0000000a00000001`.

Es exactamente la condición que produjo el bug original: dos copias del mismo
archivo, y ninguna señal de cuál es la viva. Cualquier agente que trabaje en este
repo puede leer la equivocada.

## 4. `useAppNavigation` quedó muerta

Al conectar `App.tsx` con `buildNavItems` y `allowedViews` quedó pendiente la
tercera función de `navigation.tsx`: `useAppNavigation`, que maneja historial y
botón Atrás. **No la usa nadie** — `App.tsx` tiene su propia lógica de `vista` y
`popstate`.

Es la mitad no terminada de la misma extracción. Mientras siga ahí, alguien puede
"arreglar" la navegación editando el hook muerto.

## 5. Capas envoltorio sin consumidor

| Símbolo | Archivo | Situación |
|---|---|---|
| `crearLead` | `src/lib/leadService.ts` | envuelve `crearOEnlazarLead`; nadie lo llama. El archivo entero es un único export muerto |
| `revokeSharedLink` | `src/repositories/documentsRepository.ts` | la RPC existe y la tabla también, pero **la interfaz no ofrece revocar un enlace** |
| `aFormatoICS`, `icsDeUnaCita`, `claveDia`, `fmtDiaLargo` | `src/lib/agenda.ts` | generación de ICS en el cliente; la hace la Edge Function `agenda-ics` |
| `appConfig`, `factorySnapshot`, `INTEGRATION_EVENT_TYPES`, `IconoWhatsApp` | varios | sin consumidor |

`revokeSharedLink` no es código muerto sino **una capacidad sin interfaz**:
se puede revocar un enlace compartido por SQL, pero un asesor no. Decidir si se
expone o se retira.

## 6. Componentes Kanban huérfanos

`src/components/KanbanCard.tsx` y `KanbanColumn.tsx` no los importa nadie. Los
comentarios de `BrokerDashboard.tsx` y `data/etapasLead.ts` todavía hablan de "el
Kanban del asesor", que hoy es el embudo de `Clientes.tsx`. Código y documentación
apuntando a una pantalla que ya no existe.

---

## Lo que este barrido dice del proceso

Los seis hallazgos, más los dos proyectos Vercel zombis y el `HABITAT DEV`,
comparten causa: **se construye la versión nueva al lado de la vieja y no se
retira la vieja el mismo día.** El código no queda roto, queda ambiguo — y la
ambigüedad se cobra después, cuando alguien edita la copia equivocada y la suite
de pruebas confirma que todo está bien.

Regla que se desprende: *cuando extraigas o reemplaces algo, borra el original en
el mismo commit.* Si no se puede borrar todavía, que el original falle ruidoso, no
que siga funcionando en silencio.
