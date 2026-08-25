#!/usr/bin/env bash
# Safe remote operations for HABITAT DEV. This script intentionally has no
# production mode and never exposes db reset, seed, pgTAP, or cross-tenant tests.
set -euo pipefail

cd "$(dirname "$0")/.."

operation="${1:-}"
dev_ref="${SUPABASE_PROJECT_REF_DEV:-}"
prod_ref="${SUPABASE_PROJECT_REF_PROD:-}"
db_password="${SUPABASE_DB_PASSWORD_DEV:-}"

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

[[ "${HABITAT_ENV:-}" == "development" ]] || fail "HABITAT_ENV must be exactly 'development'."
[[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] || fail "SUPABASE_ACCESS_TOKEN is required."
[[ "$dev_ref" =~ ^[a-z0-9]{20}$ ]] || fail "SUPABASE_PROJECT_REF_DEV is missing or invalid."
[[ "$prod_ref" =~ ^[a-z0-9]{20}$ ]] || fail "SUPABASE_PROJECT_REF_PROD is required as a production deny-list."
[[ "$dev_ref" != "$prod_ref" ]] || fail "DEV and PROD project refs must never match."
[[ -n "$db_password" ]] || fail "SUPABASE_DB_PASSWORD_DEV is required."

case "$operation" in
  verify|migrate|deploy-functions) ;;
  *) fail "Allowed operations: verify, migrate, deploy-functions." ;;
esac

link_and_verify_dev() {
  npx --no-install supabase link --project-ref "$dev_ref" --password "$db_password"
  local linked_ref
  linked_ref="$(tr -d '[:space:]' < supabase/.temp/project-ref 2>/dev/null || true)"
  [[ "$linked_ref" == "$dev_ref" ]] || fail "Supabase linked a project other than HABITAT DEV."
  [[ "$linked_ref" != "$prod_ref" ]] || fail "Refusing to operate on HABITAT PROD."
  echo "Verified HABITAT DEV project ref: ${dev_ref:0:4}…${dev_ref: -4}"
}

case "$operation" in
  verify)
    link_and_verify_dev
    npx --no-install supabase migration list
    ;;
  migrate)
    link_and_verify_dev
    # Remote reset is deliberately unavailable. Only versioned migrations are applied.
    npx --no-install supabase db push --password "$db_password"
    ;;
  deploy-functions)
    link_and_verify_dev
    for function_name in generate-document download-document share-document whatsapp-webhook; do
      npx --no-install supabase functions deploy "$function_name" --project-ref "$dev_ref"
    done
    ;;
esac
