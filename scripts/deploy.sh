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

# ------------------------------------------------------------------
# Vercel publica el sitio de producción SOLO desde esta rama. Cualquier
# otra rama genera un "preview" que nadie mira, así que publicar desde
# ella no cambia nada de lo que ve el equipo — y hasta hoy el script
# decía "LISTO, Vercel está redeployando" igual, que es mentira.
#
# Pasó de verdad: 12 commits (auditoría de seguridad, auditoría de UI,
# arreglos del sync, cuentas del CRM, alta de oficinas) se quedaron en
# la rama ui/audit-2026-08-21 mientras el sitio seguía sirviendo la
# versión del 20 de agosto. Un proceso que dice que publicó y no
# publicó es peor que uno que falla.
# ------------------------------------------------------------------
RAMA_PRODUCCION="master"

RAMA=$(git branch --show-current)
MENSAJE=${1:-"Actualización de la plataforma $(date '+%d/%m/%Y %H:%M')"}

if [ "$RAMA" != "$RAMA_PRODUCCION" ]; then
  echo ""
  echo "  ------------------------------------------------------------"
  echo "   OJO: estás en la rama '$RAMA'."
  echo "   El sitio se publica desde '$RAMA_PRODUCCION'. Si publico"
  echo "   solo '$RAMA', nadie va a ver los cambios."
  echo "  ------------------------------------------------------------"
  echo ""
  read -r -p "   ¿Fusiono '$RAMA' en '$RAMA_PRODUCCION' y publico? [s/N]: " RESP
  case "$RESP" in
    s|S|si|Si|SI|y|Y) FUSIONAR=1 ;;
    *)
      echo ""
      echo "   No se publicó nada. Cámbiate a '$RAMA_PRODUCCION' o vuelve"
      echo "   a correr esto y responde 's'."
      exit 1
      ;;
  esac
fi

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

# Si veníamos de una rama de trabajo, la producción se actualiza aquí. El
# merge es --ff-only a propósito: si no puede avanzar en línea recta es que
# alguien tocó producción por otro lado, y eso hay que verlo a mano, no
# resolverlo a ciegas dentro de un script de publicación.
if [ "${FUSIONAR:-0}" = "1" ]; then
  echo ""
  echo "==> Fusionando '$RAMA' en '$RAMA_PRODUCCION'…"
  git checkout "$RAMA_PRODUCCION"
  if ! git merge --ff-only "$RAMA"; then
    git checkout "$RAMA"
    echo ""
    echo "   NO se pudo fusionar en línea recta: '$RAMA_PRODUCCION' tiene"
    echo "   cambios que '$RAMA' no tiene. El sitio NO se actualizó."
    echo "   Pásame este mensaje y lo resolvemos."
    exit 1
  fi
  git push origin "$RAMA_PRODUCCION"
  git checkout "$RAMA"
  echo "    Producción actualizada."
fi

echo ""
echo "============================================================"
echo " LISTO — service worker en v$NUEVA"
echo ""
echo " Publicado en: $RAMA${FUSIONAR:+ y $RAMA_PRODUCCION}"
echo " Web:      Vercel está redeployando (1-2 min)."
echo "           https://real-estate-plataforma.vercel.app"
echo " Teléfono: cierra la app POR COMPLETO y vuelve a abrirla"
echo "           con internet. Se actualiza sola."
echo " Escritorio: descarga de nuevo el .zip desde el sitio."
echo "============================================================"
echo ""
