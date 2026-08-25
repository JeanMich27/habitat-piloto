#!/usr/bin/env bash
# ============================================================================
#  UNIFICAR: una sola rama, un solo proceso  —  se corre UNA vez
# ============================================================================
# Qué hace:
#   1. Quita candados de git atorados.
#   2. Fusiona feature/whatsapp-webhook-pilot en master.
#   3. Retira el pipeline viejo que apuntaba a HABITAT DEV.
#   4. Agrega el pipeline nuevo, las reglas y la migración de reconciliación.
#   5. Borra las ramas viejas (locales y remotas).
#   6. Publica master.
#
# Es conservador: pregunta antes de borrar ramas y antes de publicar.
set -euo pipefail
cd "$(dirname "$0")/.."
RAMA_UNICA="master"

echo "==> 1. Quitando candados de git"
rm -f .git/index.lock .git/ORIG_HEAD.lock .git/HEAD.lock .git/config.lock 2>/dev/null || true

echo "==> 2. Guardando trabajo suelto y pasando a $RAMA_UNICA"
git stash push -u -m "unificacion-$(date +%s)" >/dev/null 2>&1 || true
git checkout "$RAMA_UNICA"
git stash pop >/dev/null 2>&1 || true

echo "==> 3. Fusionando feature/whatsapp-webhook-pilot"
if git rev-parse --verify -q feature/whatsapp-webhook-pilot >/dev/null; then
  git add -A
  git diff --cached --quiet || git commit -m "chore: recoger cambios sueltos antes de unificar"
  git merge --no-ff feature/whatsapp-webhook-pilot -m "merge: whatsapp-webhook al tronco unico" || {
    echo "!! Conflicto. Resuélvelo, haz 'git commit' y vuelve a correr este script."; exit 1; }
fi

echo "==> 4. Retirando el pipeline que apuntaba a HABITAT DEV"
git rm -q --ignore-unmatch .github/workflows/supabase-dev.yml scripts/supabase-dev.sh

echo "==> 5. Agregando el proceso unificado"
git add -A \
  .github/workflows/supabase-deploy.yml \
  scripts/supabase-deploy.sh \
  scripts/unificar-un-solo-tronco.sh \
  supabase/migrations/20260825200000_reconciliacion_produccion.sql \
  AGENTS.md CLAUDE.md .env.example
git add -A
git commit -m "chore: un solo proyecto Supabase, una sola rama, un solo camino de despliegue

- supabase-deploy.{sh,yml} reemplazan a supabase-dev.{sh,yml}: ya existe un
  camino real para publicar la base de datos, que era lo que faltaba.
- Migracion de reconciliacion: 4 vistas de monitoreo, 3 restricciones unicas
  anti-duplicados del sync y 5 indices que vivian solo en produccion.
- AGENTS.md y CLAUDE.md: las seis reglas que no se negocian." || echo "(nada que commitear)"

echo "==> 6. Ramas viejas"
VIEJAS="codex/p1-domain-integrity codex/p2-5-architecture-closeout codex/p2-architecture codex/p3-1-integration-foundation codex/p4-2-cloud-close codex/security-p0-remediation security/audit-2026-08-21 ui/audit-2026-08-21 feature/whatsapp-webhook-pilot"
echo "Se borrarán (su contenido ya está en $RAMA_UNICA):"
for b in $VIEJAS; do git rev-parse --verify -q "$b" >/dev/null && echo "   - $b"; done
read -r -p "¿Borrar estas ramas, local y remoto? [s/N]: " R
case "$R" in
  s|S|si|Si|SI|y|Y)
    for b in $VIEJAS; do
      git branch -D "$b" 2>/dev/null && echo "   local borrada: $b" || true
      git push origin --delete "$b" 2>/dev/null && echo "   remota borrada: $b" || true
    done
    ;;
  *) echo "   (se dejaron las ramas)";;
esac

echo "==> 7. Publicar"
read -r -p "¿Publicar $RAMA_UNICA a GitHub ahora? [s/N]: " P
case "$P" in
  s|S|si|Si|SI|y|Y) git push origin "$RAMA_UNICA" ;;
  *) echo "   (no publicado; corre: git push origin $RAMA_UNICA)";;
esac

echo
echo "Listo. Estado:"
git log --oneline -3
git branch | cat
