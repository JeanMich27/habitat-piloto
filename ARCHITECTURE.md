# Arquitectura de la aplicación

La evolución es incremental. No se introdujo un framework de estado ni un router porque React, hooks y el historial actual siguen cubriendo el producto.

```text
UI (views/components)
  ↓ solicita acciones
Application (src/app/application, navegación)
  ↓ coordina casos de uso
Domain (src/domain y funciones puras en src/lib)
  ↓ usa contratos
Repositories (src/repositories)
  ↓ mappers tipados
Supabase / local demo (src/lib/dataStore, Supabase RLS/RPC)
```

## Responsabilidades

- `src/views` y `src/components`: presentación y estado visual local. No deben consultar Supabase directamente.
- `src/app/application`: ciclo de datos y casos de uso por dominio (`leadActions`, `propertyActions`, `appointmentActions`, `teamSettingsActions`). Coordina estado y persistencia sin llevar consultas Supabase a `App.tsx`.
- `src/app/navigation`: destinos, permisos de navegación e historial tipado.
- `src/domain`: reglas puras sin React; BANT y futuras reglas de negocio viven aquí.
- `src/repositories`: implementación de persistencia agrupada por dominio. Cada repositorio usa mappers y contratos de resultado compartidos; no es un proxy de `dataStore`.
- `src/lib/dataStore.ts`: infraestructura transversal mínima: snapshot local, carga/bootstrap, paginación y Realtime. Sus reexportaciones existen sólo como fachada de compatibilidad.
- `src/types/database.ts`: contrato de filas del esquema canónico en formato compatible con tipos Supabase.
- `src/lib/rowMappers.ts`: única frontera snake_case → modelo de dominio.
- `supabase/migrations`: fuente de verdad de esquema, RLS, triggers y RPC.

## Dónde agregar

- Vista nueva: `src/views`, cargada con `lazy()` si no forma parte del arranque.
- Regla nueva: `src/domain/<dominio>` con test unitario sin renderizar React.
- Mutación/consulta: repository del dominio; la vista pide un caso de uso, no llama `.from()`.
- Tabla o RPC: migración canónica, política RLS, pgTAP y actualización/regeneración del contrato TypeScript.
- Integración: Edge Function o adaptador server-side por tenant; nunca secretos `service_role` en frontend.
- Test: dominio en `tests`, seguridad en `supabase/tests`, usuario en `e2e`.

## Tipos Supabase

Después de modificar migraciones, levanta la base local y genera el esquema con la CLI oficial:

```bash
supabase start
supabase db reset
supabase gen types typescript --local > /tmp/database.generated.ts
```

Compara el resultado con `src/types/database.ts`, integra la diferencia y ejecuta tests de mappers. No reemplaces modelos de dominio por filas SQL cuando exista una transformación real.

## Frontera de integraciones P3

Las entradas externas se implementan del lado servidor en `supabase/functions` o en futuros adaptadores bajo `src/integrations` cuando no manejen secretos. El flujo esperado es adaptador/webhook → caso de uso → dominio → repository/RPC. Ninguna integración debe escribir mediante componentes React ni ampliar `dataStore` con lógica de proveedor.

## Prohibiciones prácticas

- No llamar Supabase directamente desde una vista nueva si existe repository/service.
- No duplicar BANT, comisiones, proyecciones ni filtros críticos dentro de componentes.
- No confiar en permisos frontend: `agencia_id`, roles y operaciones sensibles se protegen con RLS/RPC.
- No interpretar `comisionCompartidaPct` hasta resolver la decisión registrada en `P1-DECISIONES-Y-PENDIENTES.md`.
- No habilitar documentos sensibles con bucket público ni simular reagendados.
