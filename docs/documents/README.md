# Infraestructura de documentos P4.1

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

## Extensión

`document_type`, `resource_type` y `metadata` permiten agregar plantillas sin
crear buckets ni mecanismos de sharing nuevos. El contrato de opciones ya
separa salida, datos del asesor y vigencia; branding, idioma, QR y template se
pueden añadir a `metadata` y a un generador específico. `comparative_report`
está reservado en el esquema, pero P4.1 no lo genera todavía.

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
