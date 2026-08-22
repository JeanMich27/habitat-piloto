# Base de datos Supabase

## Fuente de verdad

La única fuente de verdad desplegable es `supabase/migrations/`, aplicada en
orden lexicográfico por Supabase CLI. No ejecutes archivos SQL sueltos desde la
raíz del repositorio ni desde `supabase/legacy/`.

Para reconstruir una instancia local limpia:

```bash
supabase start
supabase db reset
supabase test db
```

Para validar qué se aplicaría a un proyecto enlazado, sin modificarlo:

```bash
supabase migration list
supabase db diff --linked
```

`supabase db push` modifica la base remota. No debe ejecutarse hasta completar
la reconciliación de producción descrita abajo y contar con autorización.

## Reconciliación obligatoria antes de producción

El repositorio no demuestra el contenido ni el historial real del proyecto de
producción. Antes de cualquier `db push`:

1. Crear y verificar un respaldo recuperable.
2. Exportar `supabase_migrations.schema_migrations` del remoto.
3. Comparar `supabase migration list` y `supabase db diff --linked` contra este
   directorio.
4. Confirmar que las migraciones marcadas como “APLICADA” (08 y 14–18) existen
   realmente en el remoto y que su resultado coincide, no solo su nombre.
5. Revisar especialmente tablas, columnas, triggers, funciones, grants y todas
   las políticas RLS de `usuarios`, `leads`, `propiedades`, `citas` y
   `solicitudes_estado`.
6. Reparar el historial con `supabase migration repair` solo después de validar
   el esquema; marcar una versión como aplicada sin comprobarla puede ocultar
   una migración faltante.
7. Probar primero en una copia/restauración de producción y ejecutar
   `supabase test db` antes de programar la ventana productiva.

Las migraciones 14–16 contienen reconciliaciones de datos de la oficina
histórica. En una base limpia son operaciones sin filas coincidentes; en una
base existente deben revisarse contra un respaldo antes de aplicarlas.

## Cron y secretos por entorno

Las URLs del proyecto, anon keys y comandos de cron no se guardan en Git. La
migración 13 crea en Vault un secreto aleatorio `sync_edge_functions` y la RPC
que lo valida. Después del despliegue, un administrador debe:

1. Desplegar las Edge Functions del entorno.
2. Crear o actualizar los jobs de `pg_cron` con la URL de ese entorno.
3. Leer `sync_edge_functions` desde `vault.decrypted_secrets` dentro del comando
   del job y enviarlo como `X-Sync-Secret`.
4. Obtener la cabecera Authorization desde configuración segura del entorno;
   nunca pegar un JWT o una anon key en una migración.
5. Ejecutar cada job manualmente y comprobar `ingesta_log` y `sync_estado`.

## SQL legado

`supabase/legacy/03-verificacion-aislamiento.sql` es una verificación manual que
termina en `ROLLBACK`. `supabase/legacy/06-reversa.sql` es una reversa histórica
potencialmente destructiva. Ninguno forma parte del flujo de despliegue.

