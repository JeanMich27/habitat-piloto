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
#   5. Hace commit y push a master.
#   6. VERIFICA que el sitio en vivo sirva la versión nueva. Si no,
#      lo dice claro y sale con error en vez de mentir.
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
echo "==> 1/6  Limpiando candados de git…"
rm -f .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock

echo "==> 2/6  Subiendo la versión del service worker…"
ACTUAL=$(grep -o 'CACHE_VERSION = "v[0-9]*"' public/sw.js | grep -o '[0-9]*')
NUEVA=$((ACTUAL + 1))
# -i '' es la sintaxis de macOS; en Linux sería solo -i.
sed -i '' "s/CACHE_VERSION = \"v$ACTUAL\"/CACHE_VERSION = \"v$NUEVA\"/" public/sw.js
echo "    v$ACTUAL -> v$NUEVA"

echo "==> 3/6  Compilando…"
npm run build

echo "==> 4/6  Regenerando el paquete descargable…"
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

echo "==> 5/6  Publicando (commit + push a '$RAMA')…"
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

# ------------------------------------------------------------------
# 6/6  VERIFICAR QUE DE VERDAD SE PUBLICÓ
#
# Hasta el 26/08/2026 este script terminaba diciendo "LISTO, Vercel está
# redeployando" pase lo que pase — sin mirar el sitio ni una vez. Ya había
# costado 12 commits en agosto (ver el comentario de RAMA_PRODUCCION).
#
# Un push a GitHub no es una publicación. La única prueba es preguntarle
# al sitio en vivo qué versión está sirviendo. Barato de comprobar,
# carísimo de suponer.
#
# Ojo con el caché al verificar a mano: una petición sin romper caché
# puede devolver una versión vieja y hacerte creer que el deploy falló
# cuando no falló. Por eso aquí va el parámetro ?t= y el no-cache.
# ------------------------------------------------------------------
SITIO="https://real-estate-plataforma.vercel.app"

echo ""
echo "==> 6/6  Verificando que el sitio sirva la versión nueva…"
echo "    (hasta 3 minutos; Vercel tarda en compilar)"

version_en_vivo() {
  curl -fsSL -H 'Cache-Control: no-cache' "$SITIO/sw.js?t=$(date +%s)" 2>/dev/null \
    | grep -o 'CACHE_VERSION = "v[0-9]*"' | grep -o '[0-9]*'
}

PUBLICADO=0
for _ in $(seq 1 18); do
  sleep 10
  EN_VIVO=$(version_en_vivo || true)
  if [ -n "$EN_VIVO" ]; then
    printf '    sitio en v%s (esperando v%s)\n' "$EN_VIVO" "$NUEVA"
    if [ "$EN_VIVO" = "$NUEVA" ]; then
      PUBLICADO=1
      break
    fi
  else
    echo "    no se pudo leer el sitio todavía…"
  fi
done

echo ""
echo "============================================================"
if [ "$PUBLICADO" = "1" ]; then
  echo " PUBLICADO DE VERDAD — el sitio está sirviendo v$NUEVA"
  echo ""
  echo " Web:        $SITIO"
  echo " Teléfono:   cierra la app POR COMPLETO y vuelve a abrirla"
  echo "             con internet. Se actualiza sola."
  echo " Escritorio: descarga de nuevo el .zip desde el sitio."
else
  echo " SE SUBIÓ A GITHUB, PERO EL SITIO NO SE ACTUALIZÓ"
  echo ""
  echo " Tu código está a salvo en GitHub, rama '$RAMA_PRODUCCION',"
  echo " en v$NUEVA. Lo que falló es la publicación en Vercel:"
  echo " el sitio sigue sirviendo v${EN_VIVO:-desconocida}."
  echo ""
  echo " NO se lo anuncies a los asesores: van a seguir viendo lo"
  echo " viejo por más que cierren la app. El problema no es de"
  echo " ellos ni de su teléfono."
  echo ""
  echo " Qué revisar, en este orden:"
  echo "   1. vercel.com -> ¿aparece el proyecto en tu cuenta?"
  echo "   2. Settings -> Git: ¿sigue conectado a JeanMich27/habitat-piloto"
  echo "      y con 'master' como Production Branch?"
  echo "   3. Deployments: ¿hay uno fallido o ninguno reciente?"
  echo ""
  echo " Puede ser que Vercel siga compilando y tarde más de 3 minutos."
  echo " Vuelve a comprobarlo tú mismo con:"
  echo "   curl -s $SITIO/sw.js | grep CACHE_VERSION"
  exit 1
fi
echo "============================================================"
echo ""
