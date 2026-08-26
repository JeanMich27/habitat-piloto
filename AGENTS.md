# Guía para agentes

Lee primero `ESTADO-DE-LA-PLATAFORMA.md`.

> Si sólo vas a leer una sección, lee **Reglas que no se negocian**.

## Reglas que no se negocian

Estas seis reglas existen porque cada una ya falló en producción con clientes
usando la plataforma. No son preferencias de estilo.

### 1. Una sola base de datos

Hay **un único proyecto Supabase** y es el de producción. No hay DEV, no hay
staging, no hay "un proyecto para probar".

- Prohibido crear proyectos Supabase nuevos, por cualquier motivo.
- Para probar contra una base real usa `supabase start` (base local efímera)
  o una *branch* de Supabase, nunca un proyecto aparte.
- `.env`, `.env.local` y los secrets de GitHub apuntan todos al mismo ref.

**Qué pasó el 25/08/2026:** existían `habitat-piloto` (con 1,326 leads reales)
y `HABITAT DEV`. Todo el trabajo del 22 al 25 de agosto se aplicó sólo a DEV.
El frontend se publicó apuntando a producción y pidió funciones que ahí no
existían. Resultado: fichas técnicas rotas, enlaces sin generar y la pantalla
"no se pudo cargar la información" durante días, con el equipo trabajando.

### 2. Una sola rama: `master`

- Vercel publica desde `master`. Una rama que no llega a `master` no existe
  para nadie.
- Ramas de trabajo: como máximo un día, un tema, y se fusionan a `master`.
  Prohibidas las ramas largas por fase (`codex/p1-*`, `codex/p2-*`, …).
- Nada de trabajo paralelo en dos ramas sobre los mismos archivos.

**Qué pasó:** 12 commits de auditoría de seguridad y de UI se quedaron en
`ui/audit-2026-08-21` mientras el sitio servía la versión del 20 de agosto.

### 3. Las migraciones sólo van hacia adelante

- Una migración aplicada **nunca** se edita ni se renombra. Se corrige con una
  migración nueva.
- Todas idempotentes: `if not exists`, `create or replace`, `drop … if exists`.
- Nunca `supabase db reset` contra el proyecto real. Sólo contra la base local.
- El nombre del archivo es el contrato: `AAAAMMDDHHMMSS_descripcion.sql`. El
  historial de la base debe coincidir archivo por archivo con esta carpeta.

### 4. Base primero, código después

El orden de publicación es siempre:

1. `scripts/supabase-deploy.sh migrate`
2. `scripts/supabase-deploy.sh functions`
3. `npm run deploy` (frontend)

Nunca al revés. Si un cambio de frontend necesita una tabla, columna, RPC o
Edge Function nueva, **no se fusiona a `master`** hasta que la base ya la
tenga. Un frontend que llama a un RPC inexistente no da un error entendible:
da una pantalla en blanco.

### 5. Todo lo que existe en la base, existe en el repo

Si tocas la base desde el panel de Supabase, desde un MCP o desde un script
suelto, esa misma noche escribes la migración equivalente. El repositorio es
la única fuente de verdad.

**Qué pasó:** producción tenía 4 vistas de monitoreo y 3 restricciones únicas
anti-duplicados que ninguna migración creaba. Una reconstrucción desde el repo
las habría perdido en silencio y el sync habría empezado a duplicar contactos.

### 6. Un agente a la vez sobre los mismos archivos

Claude y Codex no trabajan simultáneamente sobre el mismo módulo. Antes de
empezar: `git status` limpio y `git pull`. Al terminar: fusionar a `master`.
El que llega segundo lee lo que hizo el primero; no lo reescribe "a su manera".

---

## Comandos obligatorios antes de fusionar

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run check:bundle
npm run e2e
```

Para cambios de base de datos:

```bash
supabase start
supabase db reset      # SOLO local
supabase test db
```

## Convenciones

- TypeScript estricto; evita `any` especialmente en entradas Supabase e integraciones.
- UI → Application → Domain → Repositories → Supabase.
- Las mutaciones se agregan al servicio de aplicación de su dominio; `App.tsx` sólo las compone y los repositories contienen las consultas Supabase.
- Reglas puras no dependen de React. Mappers viven únicamente en `src/lib/rowMappers.ts`.
- Nuevas vistas de uso ocasional se cargan con `React.lazy` y tienen loading/error/empty diferenciados.
- Selectores E2E por role, label o texto accesible; `data-testid` sólo si no existe una semántica adecuada.
- Commits pequeños por responsabilidad. Preserva cambios previos del usuario y no incluyas builds o reportes.
- Los títulos de la interfaz son nombres de negocio, no de componente: "Embudo de ventas", no "Tarjetas de pipeline".
- Antes de agregar una tarjeta o un dato nuevo a una pantalla, pregúntale a Jean y explica por qué.

## Seguridad y multi-tenant

- Toda fila de negocio conserva `agencia_id`.
- RLS/RPC son la autoridad para roles, tenant, atomicidad y campos privados.
- Las vistas llevan siempre `security_invoker = on`. Sin eso corren con permisos del dueño y se convierten en una fuga entre oficinas.
- Nunca uses `service_role`, secretos de n8n, credenciales CRM o claves EasyBroker en `src/`.
- Cada tabla/RPC nueva requiere migración canónica y prueba de aislamiento entre agencia A y B.
- Cliente y propietario no reciben notas internas, BANT ni directorios de usuarios.

## Decisiones pendientes

- `comisionCompartidaPct` no tiene interpretación contable aprobada.
- El micrositio / tarjeta digital de propiedad no está construido. Lo que existe es "PDF con enlace temporal", que es otra cosa. No lo des por hecho.
- La relación histórica cliente/propietario por correo aún requiere backfill a UUID.
- El reagendado sigue deshabilitado: requiere alcance de MVP, modelo y permisos. No simular.

## Configuración de autenticación en Supabase

Vive en el panel, no en el repositorio, y por eso es fácil que se pudra sin que
nadie lo note. Estado correcto (fijado el 26/08/2026):

- **Site URL:** `https://real-estate-plataforma.vercel.app`
- **Redirect URLs:** `https://real-estate-plataforma.vercel.app/**` y
  `http://localhost:5173/**`

Estuvo un mes en `http://localhost:3000` con la lista de redirects vacía — el
valor por omisión que trae todo proyecto nuevo. Consecuencia: `resetPasswordForEmail`
pasa `redirectTo: window.location.origin`, Supabase lo rechaza por no estar en la
lista, cae al Site URL y manda a la gente a su propia computadora. El correo
llega, el enlace consume el token y el usuario acaba en una pantalla de error sin
haber podido cambiar nada. Le pasó a Jean el 26/08 y habría bloqueado el alta de
los 11 asesores.

**Si cambia el dominio de la app, estos dos campos se cambian el mismo día.**
La prueba de que está bien no es leer el panel: es pedir una recuperación de
contraseña y llegar a la pantalla donde se escribe la nueva.

## Artefactos

- `dist`, `dist-standalone`, reportes Playwright y cualquier `_respaldo-*` no se versionan.
- El 26/08/2026 se borraron `_to_delete/`, `_respaldo-20260813-2341/`, los `.patch`
  sueltos y los scripts muertos. El detalle está en `docs/LEGACY-INVENTORY.md`.
  No los recrees: si necesitas un scratch temporal, usa `/tmp`, no la raíz del repo.
- `public/descargas/habitat-piloto.zip` es un artefacto distribuible versionado deliberadamente.
