# Documentos seguros y ficha comercial P4.2

## Flujo

La UI solicita un caso de uso en `documentActions`; el repository invoca una
Edge Function autenticada. `generate-document` consulta la propiedad con el JWT
del usuario (por lo que aplica la RLS canónica), genera el PDF en servidor,
registra `generated_documents` y lo guarda en el bucket privado
`generated-documents`. La ruta interna nunca regresa al navegador.

Para descarga autenticada, `download-document` vuelve a comprobar el acceso al
documento mediante RLS y transmite el archivo. Para compartir, se genera un
token aleatorio de 256 bits, se persiste solamente su SHA-256 y se devuelve el
token una única vez. `/share/:token` llama a `share-document`, que valida hash,
expiración, revocación y documento antes de transmitir el PDF.

## Ficha comercial

`document_type`, `resource_type` y `metadata` permiten agregar plantillas sin
crear buckets ni mecanismos de sharing nuevos. P4.2 implementa el preset
`commercial` en A4 vertical con portada, datos principales, descripción
paginada, amenidades sin duplicados, galería, contacto y QR.

Opciones versionadas en `generated_documents.metadata`:

```json
{
  "template": "commercial",
  "includeAdvisorData": true,
  "advisorId": "id-interno-o-null",
  "selectedImageIndexes": [0, 3, 1],
  "includeQr": true,
  "locationMode": "approximate",
  "resourceVersion": 4,
  "generatorVersion": 2
}
```

No se guardan URLs de imágenes, teléfono, correo ni tokens en metadata. El
orden usa índices de la versión de la propiedad y cada configuración distinta
produce otro documento; los enlaces existentes nunca cambian de PDF.

### Fotografías y peso

- Máximo 10 fotografías seleccionadas; la primera es portada.
- La UI permite incluir/excluir y mover arriba/abajo sin dependencia drag/drop.
- Descarga remota HTTPS con timeout, redirects revalidados y bloqueo de redes
  privadas; formatos admitidos: JPEG y PNG.
- Cada imagen se limita a 2.5 MiB y el presupuesto remoto total a 8 MiB.
- El PDF final se rechaza si supera 10 MiB. Una imagen inválida se omite sin
  impedir una ficha textual válida.
- Las imágenes se contienen conservando proporción; no se deforman.

### Privacidad de ubicación

El modelo vigente no tiene un permiso explícito para publicar dirección exacta.
Por eso sólo existe `locationMode=approximate`: colonia/zona, municipio y estado.
`calle` y código postal nunca se imprimen. La opción completa deberá esperar un
campo de privacidad y autorización de dominio; no basta con que la columna
contenga un dato.

### Branding, asesor y QR

El encabezado usa el nombre y logo reales de `agencias`; si no hay logo, queda
el nombre sin bloque vacío. No existen colores de marca persistidos, así que la
paleta editorial es neutral y no se hardcodea una agencia.

Con datos del asesor se muestran únicamente nombre, puesto, teléfono y correo
existentes. El QR apunta a `wa.me` sólo si el teléfono real tiene al menos diez
dígitos y precarga el título de la propiedad. Sin asesor, sólo se genera QR si
existe `eb_public_url` HTTPS; de lo contrario se omite. No se inventan URLs.

La moneda actual del dominio es MXN: `Propiedad` no persiste otra moneda y el
alta bloquea explícitamente multi-moneda. Renta agrega `/ mes`; valores cero se
muestran como “Precio a consultar”. Añadir otras monedas requiere primero una
columna canónica y su migración, no una opción visual.

`comparative_report` queda reservado para P4.3 y no se genera en esta fase.

## Operación

Desplegar las tres funciones tras aplicar la migración:

```bash
supabase functions deploy generate-document --no-verify-jwt
supabase functions deploy download-document --no-verify-jwt
supabase functions deploy share-document --no-verify-jwt
```

`verify_jwt=false` evita depender de la compuerta legacy de Functions, pero no
vuelve públicos los endpoints autenticados: las dos primeras funciones validan
el JWT con Auth y usan consultas RLS antes de cualquier operación privilegiada.
La tercera aplica autorización por token opaco, hash, vencimiento y revocación.

## Validación

`propertySheetPdf.test.ts` comprueba firma, A4 multipágina, título, precio,
presencia/ausencia del asesor, QR deshabilitable y cadencia de renta. El smoke
HABITAT DEV exige una propiedad con fotos reales, genera variantes con y sin
asesor, prueba los cinco roles mediante llamadas reales, valida
metadata/orden/peso/QR/inmutabilidad y publica ambos PDFs como artefacto
`p42-property-sheets-dev` para inspección visual.
