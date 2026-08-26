# Inventario de legado y artefactos

Última revisión: 26/08/2026.

| Ruta | Clasificación | Estado |
|---|---|---|
| `src`, `tests`, `supabase/migrations` | ACTIVO | Fuente mantenida y validada. |
| `dist` | ARTEFACTO | Ignorado; lo regenera `npm run build`. |
| `public/descargas/habitat-piloto.zip` | ARTEFACTO ACTIVO | Se conserva: la web ofrece esta descarga deliberadamente. `scripts/deploy.sh` lo regenera. |
| `supabase/legacy` | LEGACY | Sólo referencia histórica; nunca fuente desplegable. |
| `.DS_Store`, `.fuse_hidden*` | ELIMINABLE | Ignorados; no deben entrar en commits nuevos. |

## Eliminado el 26/08/2026

Se borró con autorización explícita. Nada de esto participaba en build, lint,
tests ni despliegue.

| Ruta | Qué era | Recuperable |
|---|---|---|
| `_to_delete/` | 162 archivos, 15 MB: builds de verificación, candados de git muertos, tarballs temporales | No — nunca estuvo en git |
| `_respaldo-20260813-2341/` | Respaldo del 13/08 | Sí — estaba versionado, vive en el historial |
| `actualizar-paquete-descargable.patch`, `whatsapp-webhook-pilot.patch` | Parches ya aplicados | Sí — el historial contiene los commits |
| `scripts/cloud-dev-smoke.mjs` | Smoke contra HABITAT DEV | Sí — historial |
| `scripts/unificar-un-solo-tronco.sh` | Script de un solo uso, ya ejecutado | Sí — historial |
| `dist-standalone/`, `test-results/`, `output/` | Artefactos regenerables | Se regeneran |

Con ellos cayó una prueba: `tests/p42-architecture.test.ts` contenía un caso que
hacía grep de cadenas dentro de `cloud-dev-smoke.mjs`. No verificaba
comportamiento, sólo que ciertas frases existieran en un archivo. Al borrar el
script la prueba pasó a afirmar sobre algo inexistente, así que se retiró
dejando el motivo escrito en el propio archivo.
