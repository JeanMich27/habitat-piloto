@echo off
REM Doble clic para abrir Habitat (piloto) en tu navegador.
cd /d "%~dp0"
set PORT=5173

where npx >nul 2>nul
if %errorlevel% neq 0 (
  echo Esta app necesita Node.js instalado para correr localmente.
  echo Descargalo de https://nodejs.org ^(version LTS^) e intentalo de nuevo.
  pause
  exit /b 1
)

echo Iniciando Habitat ^(piloto^) en http://localhost:%PORT% ...
start "" http://localhost:%PORT%
npx --yes serve -l %PORT% .
