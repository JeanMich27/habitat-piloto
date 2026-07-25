#!/bin/bash
# Genera el paquete descargable (.zip) para los 10 testers Y lo deja
# publicado dentro del propio sitio (public/descargas/) para que el botón
# "Descargar app" del sitio web funcione. Requiere que exista un archivo
# .env con las credenciales de Supabase (si no existe, la app queda
# empaquetada en modo local).
set -e
cd "$(dirname "$0")/.."

echo "1/5 Instalando dependencias…"
npm install

echo "2/5 Compilando build de producción…"
npm run build

echo "3/5 Empaquetando…"
rm -rf dist-standalone
mkdir -p dist-standalone/habitat-piloto
cp -r dist/* dist-standalone/habitat-piloto/
cp scripts/templates/start.command dist-standalone/habitat-piloto/
cp scripts/templates/start.bat dist-standalone/habitat-piloto/
cp scripts/templates/LEEME.txt dist-standalone/habitat-piloto/
chmod +x dist-standalone/habitat-piloto/start.command
(cd dist-standalone && rm -f habitat-piloto.zip && zip -rq habitat-piloto.zip habitat-piloto)

echo "4/5 Publicando el zip dentro del sitio (public/descargas/)…"
mkdir -p public/descargas
cp dist-standalone/habitat-piloto.zip public/descargas/habitat-piloto.zip

echo "5/5 Recompilando para que el sitio incluya el zip actualizado…"
npm run build

echo ""
echo "Listo:"
echo " - dist/                                 -> esto es lo que subes a Vercel"
echo " - dist-standalone/habitat-piloto.zip     -> copia local del paquete descargable"
echo " - public/descargas/habitat-piloto.zip    -> versión que sirve el sitio en /descargas/habitat-piloto.zip"
echo ""
echo "Recuerda: si actualizas la app, vuelve a correr este script y sube"
echo "(git add/commit/push) public/descargas/habitat-piloto.zip para que el"
echo "botón 'Descargar app' del sitio ofrezca la versión más reciente."
