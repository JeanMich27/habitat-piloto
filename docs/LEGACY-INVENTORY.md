# Inventario de legado y artefactos

| Ruta | Clasificación | Acción P2 |
|---|---|---|
| `src`, `tests`, `supabase/migrations` | ACTIVO | Fuente mantenida y validada. |
| `_respaldo-20260813-2341` | RESPALDO | Se conserva por trazabilidad; nuevos respaldos quedan ignorados. |
| `_to_delete` | ELIMINABLE | Ya ignorado; no participa en build, lint ni tests. Puede borrarse manualmente. |
| `dist`, `dist-standalone`, `dist-verificacion-*`, `dist-vmt2` | ARTEFACTO | Ignorados; se regeneran desde scripts. |
| `public/descargas/habitat-piloto.zip` | ARTEFACTO ACTIVO | Se conserva: la web ofrece esta descarga deliberadamente. |
| `supabase/legacy` | LEGACY | Sólo referencia/reversa histórica; nunca fuente desplegable. |
| `.DS_Store`, `.fuse_hidden*` | ELIMINABLE | Ignorados; no deben entrar en commits nuevos. |

No se realizó borrado masivo: Git ya aporta historial, pero el respaldo y el ZIP pueden formar parte de procesos externos que este repositorio no demuestra.
