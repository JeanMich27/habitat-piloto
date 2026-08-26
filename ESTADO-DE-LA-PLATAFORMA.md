# Estado de la plataforma — 25/08/2026

Documento de arranque. Cualquier agente (Claude, Codex) y cualquier persona que
retome el proyecto lee **esto** y **`AGENTS.md`** antes de tocar nada.

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
| Frontend | Vercel, publica desde `master` | `npm run deploy` |
| CI | GitHub Actions: `ci.yml`, `supabase-ci.yml` | reconstruye la base y corre pgTAP |
| Despliegue de base | `supabase-deploy.yml` / `scripts/supabase-deploy.sh` | manual y consciente |

## 3. Estado real hoy

**Datos en producción:** 1,330 leads · 96 propiedades · 14 usuarios · 1 agencia ·
2 integraciones activas (WhatsApp, Gemini). Todo real, sin registros de demo.

**Migraciones:** 38 en el repositorio. Las 34 anteriores quedaron selladas y
coincidían con producción al cierre del 25/08; las 4 del micrositio todavía deben
verificarse y publicarse en el orden base → funciones → frontend.

**Edge Functions — repositorio vs producción:**

| Función | En el repo | Desplegada | Nota |
|---|---|---|---|
| `sync-leads`, `sync-propiedades`, `sync-contactos` | sí | sí | crons activos |
| `agenda-ics` | sí | sí | feed de calendario, público por token |
| `generate-document`, `download-document` | sí | sí | fichas técnicas |
| `share-document` | sí | **NO** | falta desplegar: sin esto el enlace compartido no abre |
| `micrositio-publico` | sí | **NO** | el flujo oficial ya la incluye; Jean debe desplegarla después de migrar la base |
| `whatsapp-webhook` | sí | **NO** | falta desplegar + secretos + repuntar Meta |
| `integration-inbound`, `dispatch-webhooks`, `ingest-lead` | sí | **NO** | infraestructura P3.1, aún no en uso |
| `eb-probe` | **NO** | sí | **deriva**: vive sólo en producción |

**Crons activos:** `sync-leads-30min` (cada 30 min), `sync-contactos-diario`
(cada 3 h), `sync-propiedades-diario` (12:00 UTC).

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
| 1 | Secrets en GitHub: `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN` | el workflow corre sin error de variables |
| 2 | Correr *Desplegar base de datos y Edge Functions* → `functions` | `share-document` y `whatsapp-webhook` aparecen desplegadas |
| 3 | En Supabase: secretos de función `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET` | el handshake GET de Meta responde 200 |
| 4 | Repuntar el webhook de Meta a producción | llega un mensaje real y crea el lead en producción |
| 5 | Apagar `HABITAT DEV` — **sólo después del 4** | queda un único proyecto en la cuenta |

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
  agencia y elimina protocolos peligrosos en enlaces. Sigue pendiente publicar
  base y función antes del frontend. Fase 2 agregará QR, cinco CTAs de servicio,
  barra móvil, Web Share y descarga `.vcf`; no declarar esas piezas como listas.
- **Micrositio público por propiedad individual.** Sigue sin existir en la base
  y en el repo. El PDF con enlace temporal es otra cosa. Requiere decidir si será
  una página SEO por inmueble; no confundirlo con el perfil público del asesor.
- **Portal cliente:** cargar documentos y reagendar siguen deshabilitados a
  propósito (`P1-DECISIONES-Y-PENDIENTES.md`). No simular.

### Decisiones de negocio abiertas

- `comisionCompartidaPct`: sin interpretación contable aprobada. Se muestra pero
  no afecta ningún total. Detalle en `P1-DECISIONES-Y-PENDIENTES.md`.

### Deuda técnica conocida

| Qué | Riesgo |
|---|---|
| `eb-probe` en producción, no en el repo | viola la regla 5. Decidir: versionarla o retirarla |
| `scripts/cloud-dev-smoke.mjs` y `npm run cloud-dev:smoke` | apuntan a variables de HABITAT DEV; quedan muertos al apagarlo |
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
