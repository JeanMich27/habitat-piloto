#!/bin/bash
# Doble clic en este archivo para publicar los cambios en todos lados.
# Abre Terminal solo, hace todo el proceso y te dice cómo salió.
cd "$(dirname "$0")"

clear
echo ""
echo "  ============================================================"
echo "   ACTUALIZAR PLATAFORMA REAL ESTATE"
echo "  ============================================================"
echo ""
echo "   Esto publica los cambios en:"
echo "     - la página web (Vercel)"
echo "     - las apps instaladas en teléfono (tuya y de los asesores)"
echo "     - el paquete descargable de escritorio"
echo ""
echo "   Tarda entre 1 y 3 minutos. No cierres esta ventana."
echo ""
read -r -p "   Presiona ENTER para empezar (o cierra la ventana para cancelar): "
echo ""

if bash scripts/deploy.sh "$1"; then
  echo ""
  echo "  ============================================================"
  echo "   TERMINÓ BIEN"
  echo "  ============================================================"
  echo ""
  echo "   1. Espera 2 minutos a que Vercel termine de publicar."
  echo "   2. En tu teléfono: cierra la app POR COMPLETO"
  echo "      (deslizar hacia arriba, no solo minimizar) y ábrela"
  echo "      otra vez con internet."
  echo "   3. Avisa a los asesores que hagan lo mismo."
  echo ""
else
  echo ""
  echo "  ============================================================"
  echo "   ALGO FALLÓ"
  echo "  ============================================================"
  echo ""
  echo "   Copia TODO el texto rojo/de error de arriba y pásamelo."
  echo "   No se publicó nada, así que no rompiste nada."
  echo ""
fi

echo "   Puedes cerrar esta ventana."
echo ""
read -r -p "   Presiona ENTER para salir: "
