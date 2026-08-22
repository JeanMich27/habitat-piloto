# LEGACY — NO USAR PARA PRODUCCIÓN

Este directorio conserva scripts históricos que deliberadamente no pertenecen
al historial canónico de migraciones:

- `03-verificacion-aislamiento.sql`: prueba manual transaccional con `ROLLBACK`.
- `06-reversa.sql`: reversa histórica que quita el modelo multi-tenant y puede
  mezclar o dejar inaccesibles datos de oficinas.

No ejecutes estos archivos como migraciones ni en una base remota. La fuente de
verdad está en `supabase/migrations/`; consulta `supabase/README.md`.

