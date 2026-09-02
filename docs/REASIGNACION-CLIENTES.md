# Reasignación de clientes

## Contrato de negocio

- `captado_por_id` conserva el asesor de origen registrado. Es un dato neutral:
  no concede por sí solo crédito, comisión ni propiedad comercial.
- `asesor_id` es el responsable actual del seguimiento y puede cambiar.
- Un cliente nunca se reasigna sin destino: el destino debe ser un asesor
  activo de la misma inmobiliaria.
- Sólo un broker puede ejecutar la reasignación individual.
- El motivo es obligatorio y queda en `lead_asignaciones`, una bitácora
  append-only visible únicamente para brokers de la oficina.

## Efectos de una reasignación

La RPC `reasignar_lead` ejecuta en una sola transacción:

1. valida sesión, rol, inmobiliaria y versión del cliente;
2. cambia el responsable actual;
3. transfiere todas las tareas pendientes de ese cliente;
4. transfiere sus citas futuras con estado `Agendada` o `Confirmada`;
5. conserva tareas completadas, citas pasadas y autores de actividad;
6. registra responsable anterior, nuevo responsable, broker, motivo y fecha.

Los datos de esta reasignación son internos. Los eventos técnicos se conservan
para auditoría, pero la operación marca `lead.assigned` y los cambios de citas
como procesados sin crear entregas hacia endpoints externos.

## Evolución multi-inmobiliaria

La primera versión es deliberadamente manual. Una política automática futura
debe configurarse por `agencia_id` y resolver sólo el destino; siempre debe
invocar la misma operación de reasignación para conservar permisos, auditoría y
efectos laterales. Posibles estrategias: rotación, menor carga, zona,
especialidad o ponderación por desempeño. Ninguna se deduce de
`captado_por_id` ni se codifica como regla global de comisiones.
