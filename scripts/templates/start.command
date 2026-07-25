#!/bin/bash
# Doble clic para abrir Hábitat (piloto) en tu navegador.
cd "$(dirname "$0")"
PORT=5173

if ! command -v npx >/dev/null 2>&1; then
  echo "Esta app necesita Node.js instalado para correr localmente."
  echo "Descárgalo de https://nodejs.org (versión LTS) e inténtalo de nuevo."
  read -p "Presiona Enter para salir..."
  exit 1
fi

echo "Iniciando Hábitat (piloto) en http://localhost:$PORT ..."
(sleep 2 && open "http://localhost:$PORT") &
npx --yes serve -l "$PORT" .
