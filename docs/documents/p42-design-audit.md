# Auditoría de diseño de la ficha previa a P4.2

## Hallazgos de P4.1

- La primera página tenía jerarquía básica, pero el hero dejaba poco espacio a
  precio, operación y características.
- Sólo se tomaban las primeras cuatro fotografías, sin selección ni orden del
  usuario; la galería se comprimía en una sola fila.
- El texto se partía por cantidad aproximada de caracteres, no por ancho real
  de la tipografía, lo que hacía frágiles los textos largos.
- Descripción, amenidades, ubicación y asesor competían por el espacio restante
  de la primera página y podían producir páginas desequilibradas.
- La dirección completa se componía desde calle/colonia/código postal sin una
  decisión de privacidad del dominio.
- El branding utilizaba nombre/logo, pero no teléfono, correo o sitio de la
  agencia; el modelo no dispone de colores de marca.
- No existía QR, presupuesto final de PDF ni mensaje específico de exceso.
- El nombre descargado por la UI ya usaba el título, pero su sanitización no
  normalizaba acentos.

## Decisiones P4.2

- Separar portada, contenido y contacto; agregar páginas de galería 2x2.
- Calcular saltos con métricas reales de Helvetica y mantener A4 imprimible.
- Usar fotos seleccionadas con proporción contenida, máximo 10 y presupuesto
  remoto acumulado.
- Mantener ubicación aproximada hasta que exista autorización canónica para
  dirección completa.
- Mantener branding multi-tenant sólo con datos realmente persistidos.
- Generar QR con WhatsApp real del asesor o publicación HTTPS existente; omitir
  el bloque cuando no existe un destino correcto.
