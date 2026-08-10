#!/bin/bash
# ============================================================
#  ACTUALIZAR LA PLATAFORMA EN TODOS LADOS — un solo comando
# ============================================================
#
#   npm run deploy                 (usa un mensaje automático)
#   npm run deploy "lo que cambió" (mensaje propio)
#
# Qué hace, en orden:
#   1. Limpia candados de git que quedan si un proceso se cortó.
#   2. Sube CACHE_VERSION del service worker (v3 -> v4 -> v5...).
#      Esto es lo que obliga a los teléfonos que YA tienen la app
#      instalada a bajar la versión nueva en vez de servir caché vieja.
#   3. Compila la app de producción.
#   4. Regenera el paquete descargable (.zip) para escritorio.
#   5. Hace commit y push -> Vercel redeploya solo.
#
# Al terminar: la web, las apps instaladas en teléfono y el zip
# de descarga quedan todos en la misma versión.
set -e
cd "$(dirname "$0")/.."

RAMA=$(git branch --show-current)
MENSAJE=${1:-"Actualización de la plataforma $(date '+%d/%m/%Y %H:%M')"}

echo ""
echo "==> 1/5  Limpiando candados de git…"
rm -f .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock

echo "==> 2/5  Subiendo la versión del service worker…"
ACTUAL=$(grep -o 'CACHE_VERSION = "v[0-9]*"' public/sw.js | grep -o '[0-9]*')
NUEVA=$((ACTUAL + 1))
# -i '' es la sintaxis de macOS; en Linux sería solo -i.
sed -i '' "s/CACHE_VERSION = \"v$ACTUAL\"/CACHE_VERSION = \"v$NUEVA\"/" public/sw.js
echo "    v$ACTUAL -> v$NUEVA"

echo "==> 3/5  Compilando…"
npm run build

echo "==> 4/5  Regenerando el paquete descargable…"
rm -rf dist-standalone
mkdir -p dist-standalone/habitat-piloto
cp -r dist/* dist-standalone/habitat-piloto/
# El zip anterior no se mete dentro del zip nuevo (evita que crezca solo).
rm -rf dist-standalone/habitat-piloto/descargas
cp scripts/templates/start.command dist-standalone/habitat-piloto/
cp scripts/templates/start.bat dist-standalone/habitat-piloto/
cp scripts/templates/LEEME.txt dist-standalone/habitat-piloto/
chmod +x dist-standalone/habitat-piloto/start.command
(cd dist-standalone && rm -f habitat-piloto.zip && zip -rq habitat-piloto.zip habitat-piloto)
mkdir -p public/descargas
cp dist-standalone/habitat-piloto.zip public/descargas/habitat-piloto.zip

echo "==> 5/5  Publicando (commit + push a '$RAMA')…"
git add -A
if git diff --cached --quiet; then
  echo "    No hay cambios que publicar."
else
  git commit -q -m "$MENSAJE"
fi
git push origin "$RAMA"

echo ""
echo "============================================================"
echo " LISTO — service worker en v$NUEVA"
echo ""
echo " Web:      Vercel está redeployando (1-2 min)."
echo "           https://real-estate-plataforma.vercel.app"
echo " Teléfono: cierra la app POR COMPLETO y vuelve a abrirla"
echo "           con internet. Se actualiza sola."
echo " Escritorio: descarga de nuevo el .zip desde el sitio."
echo "============================================================"
echo ""
