#!/usr/bin/env bash
# ============================================================================
#  DESPLIEGUE DE BASE DE DATOS Y EDGE FUNCTIONS — UN SOLO PROYECTO SUPABASE
# ============================================================================
#
# Este script reemplaza a supabase-dev.sh. Aquel apuntaba a un proyecto DEV
# separado y tenía a producción en lista negra, de modo que NUNCA existió un
# camino para desplegar la base de datos de producción. El 25/08/2026 eso
# costó tres funciones rotas en la app en vivo durante días: el frontend se
# publicaba en Vercel mientras la base se quedaba 13 migraciones atrás.
#
# Regla del proyecto: una sola base de datos, un solo repositorio, una sola
# rama. Ver AGENTS.md.
#
#   scripts/supabase-deploy.sh verify     ver qué migraciones faltan
#   scripts/supabase-deploy.sh migrate    aplicar migraciones pendientes
#   scripts/supabase-deploy.sh functions  desplegar Edge Functions
#   scripts/supabase-deploy.sh all        migrate + functions
#
# Variables requeridas:
#   SUPABASE_ACCESS_TOKEN   token personal de Supabase
#   SUPABASE_PROJECT_REF    ref del único proyecto
#   SUPABASE_DB_PASSWORD    contraseña de la base
set -euo pipefail
cd "$(dirname "$0")/.."

operation="${1:-verify}"
ref="${SUPABASE_PROJECT_REF:-}"
password="${SUPABASE_DB_PASSWORD:-}"

fail() { echo "ERROR: $1" >&2; exit 1; }

[[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] || fail "Falta SUPABASE_ACCESS_TOKEN."
[[ "$ref" =~ ^[a-z0-9]{20}$ ]] || fail "SUPABASE_PROJECT_REF ausente o inválido."
[[ -n "$password" ]] || fail "Falta SUPABASE_DB_PASSWORD."

case "$operation" in
  verify|migrate|functions|all) ;;
  *) fail "Operaciones: verify | migrate | functions | all" ;;
esac

link() {
  npx --no-install supabase link --project-ref "$ref" --password "$password"
  local linked
  linked="$(tr -d '[:space:]' < supabase/.temp/project-ref 2>/dev/null || true)"
  [[ "$linked" == "$ref" ]] || fail "Supabase enlazó un proyecto distinto al esperado."
  echo "Proyecto enlazado: ${ref:0:4}…${ref: -4}"
}

# Toda función nueva se agrega aquí. Si no está en la lista, no se despliega.
FUNCIONES=(
  agenda-ics
  sync-leads
  sync-propiedades
  sync-contactos
  integration-inbound
  dispatch-webhooks
  ingest-lead
  generate-document
  download-document
  share-document
  whatsapp-webhook
)

link

case "$operation" in
  verify)
    npx --no-install supabase migration list
    ;;
  migrate|all)
    # Nunca hay `db reset` contra el proyecto real: solo migraciones versionadas.
    npx --no-install supabase db push --password "$password"
    ;;&
  functions|all)
    for fn in "${FUNCIONES[@]}"; do
      [[ -d "supabase/functions/$fn" ]] || { echo "omitida (no existe): $fn"; continue; }
      echo "--> desplegando $fn"
      npx --no-install supabase functions deploy "$fn" --project-ref "$ref"
    done
    ;;
esac

echo "Listo: $operation"
