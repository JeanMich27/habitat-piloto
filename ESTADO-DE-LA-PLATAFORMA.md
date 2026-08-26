# Estado de la plataforma — 26/08/2026

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
| 1 | **Preguntar a los 14 usuarios desde qué dirección abren la app.** El que vea "HABITAT México RS" está en un sitio zombi | los 14 confirmados en `real-estate-plataforma.vercel.app` |
| 2 | Reinstalar la app a los que estén en una URL vieja: desinstalar y volver a agregar desde la dirección buena | ese asesor ve "HomeID" y el micrositio nuevo |
| 3 | Borrar los proyectos `habitat-piloto` y `habitat-piloto-ah3l` en Vercel — **sólo después del 2** | queda un único proyecto sirviendo la plataforma |
| 4 | En Supabase: secretos de función `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET` | el handshake GET de Meta responde 200 |
| 5 | Repuntar el webhook de Meta a producción | llega un mensaje real y crea el lead en producción |
| 6 | Apagar `HABITAT DEV` — **sólo después del 5** | queda un único proyecto Supabase en la cuenta |

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
- **Micrositio público por propiedad individual.** Sigue sin existir en la base
  y en el repo. El PDF con enlace temporal es otra cosa. Requiere decidir si será
  una página SEO por inmueble; no confundirlo con el perfil público del asesor.
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
