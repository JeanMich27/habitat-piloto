# P1 — decisiones y pendientes explícitos

## Reglas consolidadas

- BANT parcial se conserva, pero no recibe puntaje/clase y no permite pasar a Visitado, Negociación o Cierre.
- La tarifa pactada en la propiedad manda; sin ella se conserva la configuración existente: venta 5% y renta un mes, ambos editables.
- `Cierre` es un proceso; el ingreso solo se confirma con el desenlace `Ganado`.
- La cita canónica es `public.citas`. El arreglo legacy `lead.cierre.citas` deja de alimentar el portal.

## Portal cliente

| Funcionalidad | Estado P1 | Comportamiento |
|---|---|---|
| Consultar proceso y documentos | FUNCIONAL | Solo lectura de datos reales. |
| Consultar citas | FUNCIONAL | RPC limitada sobre `public.citas`, sin notas internas. |
| Confirmar cita | FUNCIONAL | RPC idempotente sobre la cita canónica. |
| Cargar documentos | NO IMPLEMENTADA | Botón deshabilitado; nunca simula una carga. |
| Reagendar/solicitar cambio | NO IMPLEMENTADA | Botón deshabilitado; requiere solicitud, resolución y notificación. |

## DECISIÓN DE NEGOCIO REQUERIDA — comisión compartida

- **Pregunta:** ¿`comisionCompartidaPct` representa el porcentaje que recibe esta agencia, el ofrecido a la contraparte o solo que la operación acepta colaboración?
- **Comportamiento actual:** EasyBroker lo sincroniza y la ficha lo muestra, pero ningún total lo descuenta ni lo suma.
- **Opciones:** (1) porcentaje de la agencia; (2) porcentaje ofrecido al colaborador; (3) dato informativo y reparto manual.
- **Impacto técnico:** determina si `ingresoEsperado` debe multiplicarse por ese porcentaje o si la calculadora debe crear automáticamente dos participantes. P1 no inventa esa interpretación.

## Deuda estructural documentada

- Cliente y propietario todavía se relacionan con leads/propiedades mediante correo. Auth y perfil ya se sincronizan tras confirmación, pero migrar esas relaciones a `user_id`/UUID requiere backfill, llaves foráneas y conciliación de registros históricos.
- Las credenciales EasyBroker se resuelven server-side por agencia mediante `EASYBROKER_CREDENTIALS_JSON`; el despliegue legacy de una sola agencia sigue disponible durante la transición. Una fase posterior debe llevarlas a un almacén de secretos administrado y rotación por tenant.
- No se añadió Playwright: el repositorio no tiene servidor/test data aislados ni infraestructura E2E. P2 debe cubrir los cuatro flujos de rol contra un proyecto Supabase efímero. P1 amplía tests de dominio, componentes, arquitectura y SQL/RLS.
