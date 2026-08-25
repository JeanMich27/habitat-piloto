# Contexto para Claude Code

Las reglas de este proyecto viven en **`AGENTS.md`**. Léelo completo antes de
tocar nada — en especial la sección "Reglas que no se negocian".

Resumen de lo que más se rompe si se olvida:

1. **Un solo proyecto Supabase**, el de producción. Nunca crees otro.
2. **Una sola rama: `master`.** Vercel publica desde ahí.
3. **Migraciones sólo hacia adelante**, idempotentes, nunca se editan.
4. **Base primero, código después:** migrate → functions → `npm run deploy`.
5. **Lo que toques en la base se escribe como migración** el mismo día.
6. **Un agente a la vez** sobre los mismos archivos (Claude o Codex, no ambos).

Antes de empezar: `git status` limpio y `git pull`.
Antes de terminar: los comandos obligatorios de `AGENTS.md` y fusionar a `master`.
