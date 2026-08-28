# Contrato de métricas del Broker

Estado: implementado localmente el 28/08/2026. No requiere migración.

El Dashboard del Broker es un centro de control operativo. No administra
campañas, secuencias comerciales ni embudos configurables.

## Periodos

`Hoy`, `Semana` y `Mes` son ventanas móviles de 24 horas, 7 días y 31 días.

- Leads y conversión usan la fecha `creado`: forman una cohorte de entradas.
- Operaciones ganadas e ingreso confirmado usan `cerradoEn`.
- Citas usa `inicio` hacia el futuro y excluye canceladas, realizadas y no
  asistidas.
- Inventario, exclusiva y documentación son una fotografía del estado actual;
  no cambian con el selector de periodo.

## Definiciones

### Conversión de la cohorte

`leads con estado Ganado / leads operativos ingresados en la ventana`.

El denominador conserva los descartados. Quitarlos inflaría el porcentaje. Los
contactos de directorio, históricos y fuera del CRM se excluyen antes de llegar
al Dashboard mediante `esLeadOperativo`.

### Operación ganada

Requiere simultáneamente:

- `estado = Ganado`;
- `cerradoEn` dentro del periodo.

`etapa = Cierre` no basta: esa etapa todavía contiene documentación, póliza,
firma y entrega. El usuario registra el desenlace con **Marcar operación
ganada** desde la ficha del cliente; la acción fija `cerradoEn`, `cerradoPor` y
un evento de historial.

### Tiempo de respuesta

Se muestra la mediana de `primerContactoEn - creado`. La mediana evita que un
caso extremo distorsione la lectura de todo el equipo. Los registros sin primer
contacto no entran al tiempo, pero aparecen como alerta después de 24 horas.

### Demanda por propiedad

`señales = leads vinculados + visitas realizadas + ofertas registradas`.

Los tres componentes aparecen separados. No se cuentan vistas, clics ni veces
que se compartió una ficha porque esos eventos todavía no se registran. Las
ofertas tampoco se filtran por periodo: el modelo actual no guarda su fecha de
captura.

### Documentación completa

Una propiedad está completa cuando tiene al menos un documento registrado y
todos están aprobados. Un arreglo vacío es documentación pendiente, no éxito.

### Ingreso confirmado

Suma la comisión calculada únicamente para operaciones ganadas y fechadas en el
periodo. Usa la tarifa pactada de la propiedad cuando existe y los defaults del
dominio en caso contrario. No aplica `comisionCompartidaPct`: su interpretación
contable sigue pendiente de aprobación.

## Límite conocido: colaboración en cierres

La aplicación todavía no registra asesor captador, asesor colocador ni oficina
contraparte por operación. Por ello no clasifica cierres como individuales,
internos o externos y no intenta inferirlos. Esa clasificación requiere un
modelo canónico nuevo antes de mostrarse al Broker.
