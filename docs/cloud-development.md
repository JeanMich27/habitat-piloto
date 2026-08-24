# Desarrollo cloud-first y separación de entornos

## Responsabilidades

| Componente | Responsabilidad | Datos permitidos |
|---|---|---|
| GitHub | Código, revisión y protección de ramas | Ningún secreto |
| GitHub Actions CI | Supabase efímero en el runner, pgTAP, Edge checks y suite de aplicación | Fixtures ficticios que terminan con el job |
| Codespaces | Entorno opcional de desarrollo; Docker vive en el Codespace | Demo local o Supabase efímero |
| HABITAT DEV | Auth, Storage, PDF y sharing integrales | Solo usuarios y propiedades ficticios |
| HABITAT PROD | Servicio real | Nunca reset, seed, pgTAP, cross-tenant tests ni experimentos |

La rama que actualmente publica el frontend en Vercel es `master`. Los
workflows aceptan `main` y `master` durante la transición, pero esto no mezcla
los proyectos Supabase.

## Desarrollo normal sin Docker local

Para trabajo de UI y dominio:

```bash
npm ci
npm run dev:demo
npm run typecheck
npm run lint
npm test
npm run build
npm run check:bundle
npm run e2e
```

Para usar HABITAT DEV, copia `.env.example` a `.env` y coloca únicamente su URL
y anon key. Las variables `VITE_*` llegan al navegador y nunca pueden contener
service role, passwords o access tokens.

Las validaciones completas de base no requieren Docker local: cada PR ejecuta
`.github/workflows/supabase-ci.yml` en un runner GitHub con Docker.

## Codespaces

1. GitHub → **Code** → **Codespaces** → **Create codespace**.
2. Espera a que `postCreateCommand` termine `npm ci`.
3. Para UI: `npm run dev:demo`.
4. Para la suite completa opcional dentro del Codespace:

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:test
npm run edge:check
npm run edge:test
```

Docker-in-Docker está confinado al Codespace. No se expone el stack Supabase
fuera de los puertos reenviados privados del Codespace.

## CI efímero sin secretos

`Supabase and P4.1 CI` se ejecuta en PR, push a `main`/`master` y manualmente.
Usa Node 24.18.0, Supabase CLI 2.115.0 y Deno 2.9.5. En orden ejecuta:

1. `npm ci`, typecheck, lint y la suite TypeScript vigente.
2. Build y presupuesto de bundle.
3. `supabase start` y `supabase db reset` únicamente en el runner efímero.
4. Todos los pgTAP, incluido P4.1, Storage y cinco roles cross-tenant.
5. `deno check` y pruebas Deno del token y motor PDF.

No usa GitHub Secrets ni se vincula con un proyecto Supabase Cloud.

Configura como checks requeridos en la protección de `master`/`main`:

- `quality`, `tests`, `build`, `e2e` del workflow `CI`.
- `App, database, RLS and Edge Functions` de `Supabase and P4.1 CI`.

## Crear HABITAT DEV

En Supabase Dashboard crea un proyecto nuevo. No clones la base, Auth, Storage
ni usuarios de producción. Conserva su project ref y password por separado.

En GitHub → **Settings → Environments**, crea `development`, limita el acceso a
las ramas autorizadas y agrega estos secrets:

| Secret | Uso |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | CLI no interactiva; nunca se imprime |
| `SUPABASE_PROJECT_REF_DEV` | Ref de HABITAT DEV |
| `SUPABASE_PROJECT_REF_PROD` | Deny-list: la guarda exige que sea distinto de DEV |
| `SUPABASE_DB_PASSWORD_DEV` | Aplicar migraciones a DEV |
| `SUPABASE_URL_DEV` | Smoke test server-side |
| `SUPABASE_ANON_KEY_DEV` | Auth del smoke test |
| `SUPABASE_SERVICE_ROLE_KEY_DEV` | Inspección/fixture exclusiva del smoke DEV |
| `P41_DEV_ADVISOR_EMAIL` | Cuenta ficticia de asesor autorizado |
| `P41_DEV_ADVISOR_PASSWORD` | Password ficticio exclusivo de DEV |
| `P41_DEV_OWNER_EMAIL` | Cuenta ficticia de propietario no autorizado |
| `P41_DEV_OWNER_PASSWORD` | Password ficticio exclusivo de DEV |
| `P41_DEV_PROPERTY_ID` | Propiedad ficticia asignada al asesor |

En Vercel Development/Preview usa `VITE_APP_MODE=cloud`,
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con valores DEV. No es necesario
crear secrets `VITE_*` en GitHub para los workflows actuales.

## Aplicar migraciones a DEV

Ejecuta manualmente **Supabase Cloud DEV → deploy**, escribe `HABITAT-DEV` y
aprueba el Environment si GitHub lo solicita. El workflow llama a
`scripts/supabase-dev.sh`, que exige:

- `HABITAT_ENV=development`;
- refs DEV y PROD válidos y distintos;
- link verificado contra DEV;
- únicamente `db push` de migraciones versionadas;
- únicamente las tres Edge Functions P4.1.

No existe una operación remota `db reset`, seed, pgTAP o cross-tenant en el
script. Para recrear HABITAT DEV se elimina/crea el proyecto desde Dashboard y
se vuelven a aplicar las migraciones verificadas.

## Dataset ficticio de HABITAT DEV

Los pgTAP crean y revierten automáticamente Agencia A/B, broker, independiente,
asesor de equipo, propietario, cliente y propiedades A/B. Para el smoke cloud:

1. En DEV desactiva temporalmente la confirmación de correo o usa correos de QA
   controlados; nunca correos de producción.
2. En SQL Editor de DEV genera dos códigos ficticios:
   `select public.generar_codigo_alta('P41 DEV A', 1, 30);` y otro para B.
3. Desde la app DEV registra dos brokers ficticios y sus oficinas usando esos
   códigos.
4. Con los códigos de invitación crea asesor A, propietario A, cliente A y
   asesor B; apruébalos desde la UI DEV.
5. Crea Propiedad A asignada al asesor A y Propiedad B en Agencia B.
6. Guarda las credenciales ficticias y el ID de Propiedad A en los secrets
   `P41_DEV_*` anteriores.
7. Elimina de DEV cualquier perfil legacy invitado que no tenga `auth_id`; no
   reutilices la cuenta histórica de producción incluida en el bootstrap viejo.

## Smoke real de documentos

Ejecuta **Supabase Cloud DEV → smoke**. El job verifica:

- login del asesor y del propietario ficticios;
- llamadas reales de generación como broker, independiente y asesor de equipo,
  y rechazo real como propietario y cliente;
- al menos cuatro fotografías reales, reordenadas para comprobar portada y galería;
- generación y estructura `%PDF` de las variantes con y sin asesor;
- QR de WhatsApp validable por hash o QR de publicación/omisión sin asesor;
- registro, los cinco eventos de auditoría requeridos y bucket privado sin URL pública;
- descarga autorizada y rechazo del propietario;
- enlace válido e inmutable después de otra configuración, revocación,
  expiración controlada y token inválido;
- respuestas públicas sin rutas, hashes ni errores internos.

Las variantes con y sin asesor quedan siete días en el artefacto
`p42-property-sheets-dev`, junto con un resumen sin PII para revisión visual y
validación del QR. El workflow no puede ejecutarse si la URL DEV no coincide exactamente
con `SUPABASE_PROJECT_REF_DEV` o si DEV coincide con PROD.

## Producción

Producción no comparte Environment ni secrets con `development`. Crea en
GitHub un Environment `production` con reviewers obligatorios, aunque todavía
no existe un workflow que despliegue automáticamente la base.

Antes de cualquier despliegue PROD sigue siendo obligatorio:

1. CI completo verde.
2. Smoke HABITAT DEV verde y PDF revisado.
3. Respaldo recuperable de PROD.
4. Reconciliación de migraciones y `db diff --linked` conforme a
   `supabase/README.md`.
5. Aprobación humana.
6. Aplicar solo migraciones y funciones ya verificadas.

Nunca ejecutes `scripts/supabase-dev.sh` con secretos PROD ni agregues una
opción production al script.
