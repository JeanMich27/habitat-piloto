# Estado de la plataforma — 26/08/2026

Documento de arranque. Cualquier agente (Claude, Codex) y cualquier persona que
retome el proyecto lee **esto** y **`AGENTS.md`** antes de tocar nada.

> **01/09/2026 — Reasignación individual de clientes, local sin publicar.**
> El broker puede distinguir al asesor de origen del responsable actual y
> reasignar un cliente a otro asesor activo de su oficina. La operación exige
> motivo, conserva una bitácora interna, transfiere seguimientos pendientes y
> citas futuras, y preserva la actividad pasada. La RPC valida rol, tenant y
> versión de concurrencia en una sola transacción. Los eventos con ids de
> asignación producidos por esta operación se conservan para auditoría, pero no
> generan entregas a webhooks externos. Incluye migración canónica y pgTAP de
> aislamiento entre oficinas. Typecheck, lint, 226 pruebas, build, bundle y 14
> E2E en verde. El pgTAP de reasignación pasó 14/14 contra producción dentro de
> una transacción revertida al final; se confirmó que no quedaron cambios
> permanentes. Sin migración aplicada ni despliegue.

> **29/08/2026 — Rediseño de Clientes, local sin publicar.**
> En `codex/clientes-bandeja-simple`, la pantalla deja de mezclar ubicación,
> desenlace y etapa. La navegación principal ahora es `Por atender`,
> `En seguimiento` y `Cerrados`; `Contactos` y `Archivo` quedan como áreas
> secundarias. `tareas.vence_en` es la fuente canónica de seguimientos
> programados/vencidos y una sola función de dominio produce clasificación,
> orden y conteos para evitar discrepancias entre encabezado y lista. Se agregó
> programación de seguimiento sobre la tabla `tareas` existente, sin migración.
> Verificado en escritorio y móvil. `npm ci`, typecheck, lint, 220 pruebas,
> build, presupuesto de bundle y 14 E2E en verde. Sin despliegue ni cambios de
> base de datos.

> **28/08/2026 — Revisión del Centro de control del Broker (Claude), local sin publicar.**
> Verificado contra las decisiones previas del proyecto: la cohorte usa
> `leadsOperativos`/`esLeadOperativo`, así que el embudo y la conversión NO
> heredan la etapa `Contactado` constante del directorio importado
> (`diagnostico-reparto-asesor-y-pipeline-eb.md`). `tsc -b` y `eslint` en
> verde. De la suite completa se corrieron sin fallos, contra este árbol,
> `broker-metrics.test.ts` + `BrokerDashboard.test.tsx` (16) y, tras el
> ajuste de abajo, `SaludInmobiliaria.test.tsx` + `salud-logica.test.ts`
> (31); una corrida de `npx vitest run` completa alcanzó a mostrar ~30
> archivos en verde sin ningún fallo antes de que el límite de tiempo de
> esta sesión cortara el proceso — no hay confirmación independiente del
> total (Codex reportó 211/39). Se reinstaló el binario
> `@rollup/rollup-linux-arm64-gnu` con `--no-save`, mismo síntoma cosmético
> ya documentado.
>
> **Bug encontrado y corregido:** al separar `etapa = Cierre` de `estado =
> Ganado`, `SaludInmobiliaria.tsx` quedó con `cierres` calculado por estado
> real pero el texto bajo el embudo ("De cada 100 clientes que entran, X
> llegan a cierre") seguía describiéndolo como si fuera la barra "Cierre"
> del embudo — que ahora es un número distinto (leads en negociación/firma,
> no ganados). Dos cifras distintas en la misma tarjeta bajo el mismo
> nombre. Se corrigió el texto para distinguir explícitamente la etapa
> "Cierre" (documentación en proceso) del resultado ganado. Sin cambios de
> cálculo. `tsc -b` y 31 pruebas (`SaludInmobiliaria.test.tsx` +
> `salud-logica.test.ts`) en verde tras el ajuste.
>
> Sin más hallazgos bloqueantes. No se corrió `npm run e2e` ni se hizo
> commit ni push — queda igual que el resto del árbol, pendiente de que
> Jean lo revise y publique.

> **28/08/2026 — Centro de control del Broker, local sin publicar.**
> El Dashboard ya separa la etapa `Cierre` del desenlace real `Ganado`, usa
> `cerradoEn` para operaciones del periodo, calcula conversión por cohorte y
> muestra respuesta mediana. Agrega inventario por estado/exclusiva/documentos,
> demanda trazable por inmueble, próximas citas, desempeño por asesor e ingreso
> confirmado. La ficha de Cliente incorpora la acción explícita **Marcar
> operación ganada**; antes existía el estado en el esquema, pero ninguna ruta
> de interfaz lo escribía, por lo que cualquier KPI correcto habría quedado en
> cero. Contrato: `docs/METRICAS-BROKER.md`. No hubo cambio de base ni despliegue.

> **28/08/2026 — Ajuste morado y ficha pública por inmueble.**
> Elimina "Mi Micrositio" del menú, concentra su edición en "Mi perfil",
> mueve el logo a "Información de la inmobiliaria" para broker, elimina CTAs
> duplicados y crea `/inmueble/:slug` con un contrato público que excluye
> propietario, comisión, dirección exacta e ids internos. También corrige el
> fallo de foto de Jean: el perfil propio hacía `upsert`, que exige INSERT y
> RLS se lo niega a un asesor; ahora usa UPDATE por id y los errores de
> guardado permanecen dentro del formulario en vez de tumbar la app.
>
> **Estado del despliegue:** migración `20260828045255_propiedades_publicas_plataforma`
> aplicada y verificada. Edge Function `propiedad-publica` desplegada (nueva,
> sin tráfico previo). **Pendiente:** `micrositio-publico` sigue sirviendo su
> versión anterior (caché de 60s en vez de `no-store`) — el redeploy lo
> bloqueó el clasificador de modo automático de Claude Code por tratarse de
> una función ya viva en producción; no es un error técnico, es una decisión
> que le tocaba a Jean. No rompe nada: el micrositio del asesor sigue
> funcionando, solo con hasta 60s de caché en vez de reflejo inmediato.

> **28/08/2026 — Rediseño del micrositio publicado (ver historial de commits para el hash).**
> Nuevo estilo blanco/naranja, edición directa de perfil/foto/bio/redes desde
> "Mi Micrositio", foto de perfil con guardado automático, y logo de agencia
> subido a Storage (bucket `logos-publicos`, migración
> `20260828034050_micrositio_bucket_logos` ya aplicada en producción).
>
> **Separado a propósito de este release — sigue local, sin publicar: el
> Corte 1 de WhatsApp Coexistence.** Mezclaba en el mismo árbol de trabajo con
> el micrositio; se separó por la regla "tareas cerradas, no fases" de
> `AGENTS.md`. Queda así, intacto, para retomarlo aparte:
> - Migración `supabase/migrations/20260827090000_whatsapp_handoff_mvp.sql.wip`
>   — renombrada con `.wip` a propósito para que `supabase db push` no la
>   aplique por accidente. Quitar el sufijo cuando se retome.
> - `supabase/functions/whatsapp-webhook/index.ts` tiene cambios sin commitear
>   (553 líneas) que tampoco se desplegaron.
> - Archivos nuevos sin commitear: `src/repositories/whatsappRepository.ts`,
>   `src/views/WhatsAppHandoffs.tsx`,
>   `supabase/functions/_shared/whatsapp-automation.ts`, sus pruebas y
>   `docs/integrations/WHATSAPP-*.md`.
> - Nada de esto se probó en Postgres local (esta máquina no tiene
> Docker/Podman); existe pgTAP en `supabase/tests/whatsapp_handoff_mvp.sql`.

- Reglas de trabajo → `AGENTS.md`
- Arquitectura del código → `ARCHITECTURE.md`
- Publicación → `DEPLOY.md`
- Sincronización con EasyBroker → `GUIA-SYNC-EASYBROKER.md`
- Integraciones y webhooks → `docs/integrations/`

---

## 1. Qué es

CRM inmobiliario multi-tenant, propio, que Jean vende a oficinas inmobiliarias.
Cada oficina (`agencias`) conecta su propio CRM y sólo ve sus datos; todo vive en
una sola base con aislamiento por `agencia_id` aplicado por RLS.

Hoy hay **una oficina en producción real**: Hábitat Bienes Raíces (`agencia_id = 'default'`),
con 14 usuarios trabajando en ella. **No es una demo.** Cualquier cambio que se
publique lo sienten asesores reales el mismo día.

Stack: React + Vite + TypeScript → Supabase (Postgres 17, RLS, RPC, Edge Functions,
Storage) → Vercel para el frontend. Sincronización con EasyBroker por cron.

## 2. Dónde vive cada cosa

| Pieza | Dónde | Detalle |
|---|---|---|
| Repositorio | `github.com/JeanMich27/habitat-piloto` | rama única: `master` |
| Local | `~/Downloads/Carpetas_Proyectos/Plataforma multinivel/UXUI/app descargable` | |
| Base de datos | Supabase, proyecto **`zhtwvxarovfohhmrgqoy`** | el ÚNICO. No hay DEV |
| Cuentas de acceso | Supabase → Authentication → Users | fuente de verdad de quién puede entrar |
| Altas y solicitudes | vista **"Equipo"** en la app | **sólo rol `broker`**. Con una cuenta de asesor no aparece en el menú |
| Frontend | Vercel, publica desde `master` | `npm run deploy` |
| CI | GitHub Actions: `ci.yml`, `supabase-ci.yml` | reconstruye la base y corre pgTAP |
| Despliegue de base | `supabase-deploy.yml` / `scripts/supabase-deploy.sh` | manual y consciente |

## 3. Estado real hoy

**Datos en producción:** 1,330 leads · 96 propiedades · 14 fichas de usuario ·
1 agencia · 2 integraciones activas (WhatsApp, Gemini). Todo real, sin demo.

**Pero sólo 3 personas pueden entrar.** Corregido el 26/08: este documento decía
"14 usuarios trabajando en ella" y era falso. En `auth.users` hay 3 cuentas —
el broker, Lulú Zanabria y Jean. Las otras 11 fichas están en estado `Invitado`
con `auth_id` nulo: existen en la tabla `usuarios`, tienen propiedades y leads
asignados, y **nadie puede iniciar sesión con ellas.**

No es un error del sistema. El alta de asesores dice, en su propia pantalla:
*"Crea la ficha en estado 'Invitado'. No se enviará correo: comparte manualmente
las instrucciones de registro."* Nunca se compartieron. El trigger
`manejar_nuevo_registro` enlaza `auth_id` y pasa la ficha a `Activo` en cuanto
la persona se registra con el mismo correo — el mecanismo funciona, sólo hay que
disparar el registro.

Trabajo bloqueado por esto: **883 leads** (dos tercios de la base) y 55
propiedades asignados a gente que no puede abrir la app. Ver la lista con:

```sql
select nombre, correo from usuarios where auth_id is null order by nombre;
```

Riesgo al ejecutarlo: si alguien se registra con un correo distinto al de su
ficha, el trigger no encuentra coincidencia y **crea un perfil nuevo y vacío**.
Ese asesor pierde de vista su cartera y queda un duplicado que hay que fusionar
a mano. Los correos se copian y pegan, no se dictan.

**Migraciones: sincronizadas.** 39 en el repositorio, 39 aplicadas en producción,
misma lista y mismo orden. Verificado contra el proyecto `zhtwvxarovfohhmrgqoy`
el 26/08. Incluye las 5 del micrositio. No hay deriva de base.

**Edge Functions: todas desplegadas.** Verificado el 26/08 contra producción.
Las que este documento daba por pendientes ya están activas.

| Función | En el repo | Desplegada | Nota |
|---|---|---|---|
| `sync-leads`, `sync-propiedades`, `sync-contactos` | sí | sí | crons activos |
| `agenda-ics` | sí | sí | feed de calendario, público por token |
| `generate-document`, `download-document` | sí | sí | fichas técnicas |
| `share-document` | sí | sí | desplegada el 26/08 |
| `micrositio-publico` | sí | sí | desplegada el 26/08 |
| `whatsapp-webhook` | sí | sí | desplegada; **faltan los secretos y repuntar Meta** |
| `integration-inbound`, `dispatch-webhooks`, `ingest-lead` | sí | sí | infraestructura P3.1, aún no en uso |
| `eb-probe` | **NO** | sí | **deriva**: vive sólo en producción |

**Crons activos:** `sync-leads-30min` (cada 30 min), `sync-contactos-diario`
(cada 3 h), `sync-propiedades-diario` (12:00 UTC).

**Frontend: el sitio oficial está al día. El problema son dos sitios zombis.**

`real-estate-plataforma.vercel.app` publica correctamente desde `master`.
Verificado el 26/08: sirve v32, y los tres commits del día aparecen
`Ready / Production` en Vercel. Este camino funciona.

El problema es que en la cuenta de Vercel **`jeanmich27`** (ojo: no
`niper987@gmail.com`, que es otra cuenta y no tiene proyectos) conviven **tres**
proyectos apuntando al mismo repositorio:

| Proyecto | URL pública | Qué sirve | Rama de producción |
|---|---|---|---|
| `real-estate-plataforma` | `real-estate-plataforma.vercel.app` | **el sitio real, al día** | `master` ✅ |
| `habitat-piloto` | `habitat-piloto.vercel.app` | build del **25 de julio** (`7000483`) | sin conectar — `master` sólo genera *Preview* |
| `habitat-piloto-ah3l` | `habitat-piloto-ah3l.vercel.app` | build del **25 de julio** (`7000483`) | sin conectar — `master` sólo genera *Preview* |

Los dos últimos están **vivos y accesibles**, congelados hace un mes. Reciben los
push a `master` como *Preview*, así que sus URLs públicas nunca avanzan. Quien
tenga la app instalada desde una de esas direcciones no verá jamás un cambio,
por más veces que se publique.

**Cómo distinguirlo en 2 segundos:** los sitios zombis se titulan
`HABITAT México RS · Plataforma Inmobiliaria`. El sitio bueno se titula
`HomeID · Plataforma Inmobiliaria`. Si un asesor ve "HABITAT México RS" en la
pestaña o en el nombre de la app instalada, está en un sitio muerto.

Acción pendiente: confirmar desde qué URL instaló la app cada uno de los 14
usuarios, y sólo entonces borrar los dos proyectos duplicados. Borrarlos antes
deja a esos asesores con una app que da error en vez de una que los reencamine.

## 4. Qué se rompió el 25/08/2026 y por qué

Contexto obligatorio: explica casi todas las reglas de `AGENTS.md`.

Existían dos proyectos Supabase, `habitat-piloto` (con los datos reales) y
`HABITAT DEV`. El pipeline sólo sabía desplegar a DEV — **nunca existió un camino
para publicar la base de producción**. El frontend, en cambio, se publicaba solo
a Vercel desde `master`.

Resultado: 13 migraciones (todo el trabajo del 22 al 25 de agosto) quedaron sólo
en DEV. El frontend en vivo pedía `directorio_visible`, `mis_citas_cliente`,
`metricas_propietario` y la columna `leads.version`, que en producción no
existían. Los síntomas que reportó Jean:

- las fichas técnicas no se descargaban ni generaban enlace,
- al guardar o consultar salía "no se pudo cargar la información",
- el micrositio / tarjeta digital no aparecía.

Los dos primeros eran esta desincronización. **El tercero no: en ese momento el
micrositio del asesor todavía no se había construido.** Ya existe en el repo;
su estado actual y la distinción frente al micrositio por propiedad están abajo.

Al comparar ambos esquemas objeto por objeto apareció un segundo problema:
producción tenía 12 objetos que ninguna migración creaba — 4 vistas de monitoreo,
5 índices y **3 restricciones únicas que impiden que el sync de EasyBroker
duplique contactos, propiedades y asesores**. Reconstruir desde el repo los habría
perdido en silencio. Quedaron versionados en
`20260825200000_reconciliacion_produccion.sql`.

## 5. Pendientes

### Bloqueantes — la funcionalidad ya prometida no funciona sin esto

| # | Qué | Listo cuando |
|---|---|---|
| 1 | **Dar de alta a los 11 asesores "Invitado".** Nunca se les avisó que debían registrarse: el alta no manda correo, por diseño | los 11 aparecen en Authentication → Users y su ficha pasa a "Activo" sola |
| 2 | En Supabase: secretos de función `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET` | el handshake GET de Meta responde 200 |
| 3 | Repuntar el webhook de Meta a producción | llega un mensaje real y crea el lead en producción |
| 4 | Apagar `HABITAT DEV` — **sólo después del 3** | queda un único proyecto Supabase en la cuenta |

Ya resuelto (26/08): los sitios zombis de Vercel se borraron y queda un solo
proyecto, `real-estate-plataforma`, publicando desde `master`.

Ya resuelto (26/08): los secrets de GitHub, el despliegue de base y funciones, y
la publicación del frontend. Las 39 migraciones, las 13 Edge Functions y el
sitio oficial están al día.

**Regla que sale de esto:** un proyecto de Vercel por plataforma. Si aparece un
duplicado (Vercel los crea solo cuando se importa el mismo repo dos veces),
bórralo el mismo día. Dos sitios sirviendo versiones distintas de la misma app
es indistinguible de un bug para quien lo usa — y para quien lo depura.

Verificación de cierre: generar una ficha técnica desde la app, descargarla y
abrir el enlace compartido desde otro navegador sin sesión.

### Operativos

| Qué | Detalle |
|---|---|
| ~76 leads sin rutear | apuntan a 4 propiedades fuera del catálogo (`EB-WE8523`, `EB-UX3045`, `EB-UY1232`, `EB-VK1452`), probablemente vendidas o retiradas en EasyBroker. Son prospectos reales sin dueño. Ver `v_leads_para_revision` |
| 8 leads sin teléfono | no se pueden contactar; decidir si se descartan o se enriquecen |

### Producto — micrositios distintos

- **Micrositio público del asesor (`/m/:slug`).** Está construido en el repo:
  perfil público, propiedades publicadas, experiencia, oficina, WhatsApp y
  estados vacíos honestos. La Fase 1 corrige su despliegue, aísla inventario por
  agencia y elimina protocolos peligrosos en enlaces. La Fase 2 agrega navegación,
  QR, filtro real Venta/Renta, cinco CTAs de servicio, barra móvil, Web Share y
  descarga `.vcf`.
  **Decisión de Jean, 25/08/2026:** se aprobaron los cinco accesos directos a
  WhatsApp porque pre-califican la intención de compra, venta, renta, valuación o
  inversión sin agregar datos ficticios al perfil.
  **Estado al 26/08: publicado y funcionando.** Fase 1 y Fase 2 están fusionadas
  en `master` — las ramas `codex/micrositio-fase1` y `codex/micrositio-fase2` ya
  no aportan nada, su diff contra `master` está vacío. La base, la función
  `micrositio-publico` y el frontend están desplegados en el sitio oficial.
  Si un asesor no lo ve, es porque abre la app desde un sitio zombi (sección 3),
  no porque falte publicar.
- **Micrositio público por propiedad individual.** Implementado localmente en
  `/inmueble/:slug`, todavía no publicado. Es una ficha comercial propia y no el
  PDF con enlace temporal. El contrato evita propietario, comisión, dirección
  exacta e ids internos y sólo muestra inventario con estado `Publicada`.
- **Portal cliente:** cargar documentos y reagendar siguen deshabilitados a
  propósito (`P1-DECISIONES-Y-PENDIENTES.md`). No simular.

### Decisiones de negocio abiertas

- `comisionCompartidaPct`: sin interpretación contable aprobada. Se muestra pero
  no afecta ningún total. Detalle en `P1-DECISIONES-Y-PENDIENTES.md`.
- Micrositio del asesor: la referencia visual propone cuatro pilares fijos
  (Transparencia, Acompañamiento, Negociación y Resultados). Falta decidir si
  serán copy global de HomeID para todas las oficinas. No existe marcado vacío ni
  contenido simulado mientras esa decisión siga abierta.

### Deuda técnica conocida

| Qué | Riesgo |
|---|---|
| `eb-probe` en producción, no en el repo | viola la regla 5. Decidir: versionarla o retirarla |
| El alta de asesores no manda correo | Es una decisión consciente para el piloto, pero es exactamente donde se cayó el proceso: 11 asesores quedaron sin acceso durante un mes y nadie lo notó, porque la ficha se ve creada en la app. Se va a repetir con cada oficina que se venda. Mínimo: un botón "copiar instrucciones de registro" junto a cada ficha en `Invitado` |
| Pruebas que corren sobre código muerto | El 26/08 se descubrió que `App.tsx` mantenía un `navItems` propio a mano mientras `navigation.tsx` tenía otro con "Mi Micrositio". Se pintaba el de `App.tsx`; `tests/navigation.test.ts` probaba el otro. 181 pruebas en verde y la función invisible durante días. Corregido: `App.tsx` ahora delega, y hay pruebas que verifican que lo siga haciendo. **Vale la pena buscar el mismo patrón en otras capas** — una prueba que no toca el camino real no protege nada |
| El registro del service worker no recarga al actualizar | `registrarServiceWorker.ts` sólo llama a `register()`. El SW nuevo hace `skipWaiting` + `clients.claim`, pero **`claim()` no recarga la pestaña**: el JS viejo sigue corriendo. En iOS deslizar la app hacia arriba normalmente no mata el proceso, así que "ciérrala por completo" no es instrucción confiable. Falta escuchar `updatefound`/`controllerchange` y recargar |
| Sin verificación automatizada de extremo a extremo de documentos | `cloud-dev-smoke.mjs` se borró el 26/08 (apuntaba a HABITAT DEV) y con él la prueba que lo leía. Storage privado, eventos de auditoría e inmutabilidad del enlace hoy se comprueban a mano con el checklist de cierre |
| Cliente y propietario se relacionan por correo, no por UUID | requiere backfill; frágil si alguien cambia su correo |
| Credenciales EasyBroker vía `EASYBROKER_CREDENTIALS_JSON` | falta rotación por tenant |
| `respaldo_ledger_20260825` en `supabase_migrations` | respaldo del historial anterior; borrable cuando el CI pase verde |
| Foto pública revela `auth.uid()` en la ruta de Storage | Migración futura: agregar `usuarios.foto_publico_id uuid not null default gen_random_uuid()` y reemplazar `auth.uid()` como primer segmento. Deben sustituirse las políticas `avatares_publicos_lectura_publica`, `avatares_publicos_escritura_propia`, `avatares_publicos_actualizacion_propia` y `avatares_publicos_borrado_propio`. El 26/08 no pudo obtenerse un conteo local porque el equipo no tenía Docker/Podman; producción no fue consultada. Antes de migrar objetos, contar allí las filas con `foto_url is not null` y decidir entre copia controlada o pedir una nueva carga a esos asesores. |

## 6. Cómo trabajar con Codex sin volver a chocar

Codex construyó buena parte de esto y lo hizo bien: la arquitectura por capas, el
outbox transaccional, las pruebas pgTAP y las políticas RLS son sólidas. El
choque no fue de calidad — fue de **proceso**: construyó una separación DEV/PROD
para un equipo de cinco cuando el equipo es uno, y nadie cerró el camino a
producción.

Para que siga la misma línea:

1. **Dale contexto antes de la tarea.** Usa el prompt de `docs/arranque-codex.md`.
   Sin eso, Codex no sabe que hay una sola base y va a proponer un entorno de
   pruebas separado — es lo razonable si no le dices lo contrario.
2. **Un agente a la vez sobre los mismos archivos.** Si Codex está trabajando en
   `src/views/Clientes.tsx`, Claude no lo toca hasta que se fusione.
3. **Tareas cerradas, no fases.** "Agrega el filtro por asesor en Clientes" en vez
   de "P5: mejoras de clientes". Las fases largas generan ramas largas, y las
   ramas largas fueron el problema.
4. **Se fusiona el mismo día.** Rama de trabajo → `master` antes de cerrar la
   sesión. Lo que no llega a `master` no existe.
5. **Al terminar, pregúntale explícitamente:** "¿tocaste la base de datos? Si sí,
   ¿está la migración en `supabase/migrations`?" Es la regla que más se olvida.
6. **Tú publicas, no el agente.** El orden es `migrate` → `functions` →
   `npm run deploy`. Nunca al revés.
