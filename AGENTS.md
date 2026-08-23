# Guía para agentes

Lee primero `ARCHITECTURE.md`, `P1-DECISIONES-Y-PENDIENTES.md` y `supabase/README.md`.

## Comandos obligatorios

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run check:bundle
npm run e2e
```

Para seguridad de base de datos:

```bash
supabase start
supabase db reset
supabase test db
```

No ejecutes `supabase db push` ni modifiques producción sin respaldo, reconciliación y autorización explícita.

## Convenciones

- TypeScript estricto; evita `any` especialmente en entradas Supabase e integraciones.
- UI → Application → Domain → Repositories → Supabase.
- Las mutaciones se agregan al servicio de aplicación de su dominio; `App.tsx` sólo las compone y los repositories contienen las consultas Supabase.
- Reglas puras no dependen de React. Mappers viven únicamente en `src/lib/rowMappers.ts`.
- Nuevas vistas de uso ocasional se cargan con `React.lazy` y tienen loading/error/empty diferenciados.
- Selectores E2E por role, label o texto accesible; `data-testid` sólo si no existe una semántica adecuada.
- Commits pequeños por responsabilidad. Preserva cambios previos del usuario y no incluyas builds o reportes.

## Seguridad y multi-tenant

- Toda fila de negocio conserva `agencia_id`.
- RLS/RPC son la autoridad para roles, tenant, atomicidad y campos privados.
- Nunca uses `service_role`, secretos de n8n, credenciales CRM o claves EasyBroker en `src/`.
- Cada tabla/RPC nueva requiere migración canónica y prueba de aislamiento entre agencia A y B.
- Cliente y propietario no reciben notas internas, BANT ni directorios de usuarios.

## Decisiones pendientes

- `comisionCompartidaPct` no tiene interpretación contable aprobada.
- Documentos y reagendado siguen deshabilitados: requieren alcance de MVP, modelo, permisos y almacenamiento/flujo real. No simular.
- La relación histórica cliente/propietario por correo aún requiere backfill a UUID.

## Artefactos

- `dist`, `dist-standalone`, `_to_delete`, reportes Playwright y futuros `_respaldo-*` no se versionan.
- `_respaldo-20260813-2341` es un respaldo histórico ya versionado; no lo uses como fuente activa.
- `public/descargas/habitat-piloto.zip` es un artefacto distribuible versionado deliberadamente.
