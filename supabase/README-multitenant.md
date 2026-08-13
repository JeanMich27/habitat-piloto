# Multi-tenant: qué se encontró y qué se hizo

## Fugas que tenía el esquema actual

Estas no son riesgos teóricos: son consultas que hoy devuelven datos ajenos en
cuanto exista una segunda oficina.

| # | Fuga | Consecuencia |
|---|---|---|
| 1 | `usuarios_select` con `using (true)` | Cualquier sesión de cualquier oficina leía el directorio completo: nombres, correos y teléfonos de todos los asesores del sistema |
| 2 | `agencia_select` y `configuracion_select` con `using (true)` | Datos de la agencia y su configuración visibles para todos |
| 3 | `es_broker()` sin alcance de oficina | El broker de la oficina B veía las 96 propiedades y los 164 leads de Hábitat |
| 4 | `puedo_ver_todas()` leía `configuracion where id='default'` | La política de una sola oficina gobernaba a todas |
| 5 | Rol `propietario` / `cliente` emparejado por correo global | Un correo repetido entre oficinas cruzaba información |
| 6 | `sync_estado` con PK en `proceso` | Una sola fila de control para todas las oficinas: la sincronización de una pisa a la otra |
| 7 | Sin `agencia_id` en ninguna tabla | Colisión de ids y asignaciones cruzadas sin ninguna barrera |
| 8 | Trigger de alta vinculaba por correo a nivel global | Un registro nuevo podía caer en la agencia equivocada |

## Qué entrega la migración

1. **`agencias`** como tabla de tenants, con `estado` (activa/suspendida/prueba)
   y `codigo_invitacion`. Suspender una oficina corta el acceso al instante sin
   borrar un solo dato — sirve para impago y para fin de contrato.
2. **`agencia_id` en todas las tablas de negocio**, con FK, índices y unicidad
   compuesta (`agencia_id + correo`, `agencia_id + eb_public_id`).
3. **Trigger de coherencia**: imposible asignar un lead a un asesor de otra
   oficina, o ligarlo a una propiedad ajena. Las FK solas no lo impedían.
4. **`agencia_integraciones`** con credenciales cifradas en Supabase Vault. Sin
   políticas para `authenticated`: ni la sesión del broker puede leer su propia
   llave de EasyBroker desde el navegador. Solo las Edge Functions la descifran.
5. **Tablas de WhatsApp** (`wa_conversaciones`, `wa_mensajes`) ya multi-tenant,
   con `estado` para el handoff bot → humano y la ventana de 24 h.
6. **Alta por invitación**: sin código válido de una oficina activa, el registro
   se rechaza. Antes cualquiera podía crearse cuenta.
7. **Sin rol que cruce oficinas vía RLS.** El soporte se hace con `service_role`
   desde el servidor, nunca desde el navegador. Eso permite afirmarle al broker
   algo verificable: *ninguna sesión de la aplicación puede ver otra oficina,
   incluida la mía.*

## Verificación

`03-verificacion-aislamiento.sql` simula sesiones reales de dos oficinas y
comprueba 6 escenarios. Corre dentro de una transacción con `rollback`: no deja
datos de prueba.

Ya se ejecutó contra una réplica local del esquema actual (PostgreSQL 16 con
stubs de `auth` y `vault`). Resultado:

```
OK 1   — La oficina B está aislada.
OK 1.6 — Las credenciales no son legibles ni descifrables desde la app.
OK 1.7 — Escritura cruzada bloqueada por RLS.
OK 2   — Hábitat no ve la oficina B.
OK 3   — La suspensión corta el acceso sin borrar datos.
OK 4   — Trigger de coherencia bloqueó la asignación cruzada.
OK 5   — Una cuenta sin agencia no ve absolutamente nada.
OK 6   — El rol anónimo no tiene acceso a ninguna tabla.
```

Dos defectos reales aparecieron en esa prueba y ya están corregidos: el trigger
de coherencia fallaba al insertar propiedades, y las políticas viejas
`agencia_select using(true)` sobrevivían al renombrar la tabla y anulaban todo
el aislamiento por OR. Ninguno de los dos se veía leyendo el SQL.

## Cómo aplicar

```bash
# 1. Respaldo primero. No es opcional: la migración altera PKs y agrega NOT NULL.
#    Supabase → Database → Backups

# 2. En el SQL Editor, en este orden:
#    01-multitenant-modelo-datos.sql
#    02-multitenant-rls.sql
#    03-verificacion-aislamiento.sql   (debe terminar sin ERROR)
```

Ambas migraciones son idempotentes: re-ejecutarlas no rompe nada.

## Qué falta después de esto

1. **El frontend debe enviar `agencia_id` en cada inserción.** Las políticas lo
   exigen; hoy la app no lo manda y los `insert` van a fallar. Es el siguiente
   cambio obligatorio.
2. Reemplazar los literales `'default'` que la app consulta por el `agencia_id`
   de la sesión.
3. Cargar las credenciales por oficina con `guardar_secreto_integracion()` y
   sacar la llave de EasyBroker del `.env` del frontend.
4. Panel de soporte con `service_role` del lado servidor, registrando en
   `auditoria_admin`.

## Limitación consciente

Una cuenta pertenece a **una** oficina. Si una persona trabaja en dos, necesita
dos cuentas con correos distintos. Soportar membresía múltiple exige una tabla
de membresías y un selector de oficina en la sesión: es una decisión de producto,
no un olvido. Para vender a oficinas independientes, 1:1 es lo correcto.
