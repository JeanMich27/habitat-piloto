# Prompt de arranque para Codex

Pega esto **al inicio de cada sesión de Codex**, antes de pedirle la tarea.
Sin este contexto va a proponer un entorno de pruebas separado, que es
exactamente lo que rompió la plataforma en agosto de 2026.

---

```
Antes de proponer o escribir cualquier cosa, lee estos archivos del repositorio
y confirma en una línea que los leíste:

  AGENTS.md                    (reglas que no se negocian)
  ESTADO-DE-LA-PLATAFORMA.md   (dónde estamos hoy y qué está pendiente)
  ARCHITECTURE.md              (capas y dónde va cada cosa)

Contexto que no puedes deducir del código:

- Esta plataforma está EN USO REAL. Una oficina inmobiliaria con 14 asesores
  trabaja en ella todos los días, con 1,330 leads y 96 propiedades reales.
  No es un prototipo. Lo que se publica lo sienten personas el mismo día.

- Hay UN SOLO proyecto Supabase (zhtwvxarovfohhmrgqoy) y es el de producción.
  No existe DEV, no existe staging. No propongas crear un proyecto nuevo:
  para probar contra base real se usa `supabase start` (base local efímera)
  o una branch de Supabase.

- Hay UNA SOLA rama: master. Vercel publica desde ahí. No crees ramas por
  fase (codex/p1-*, codex/p2-*). Rama de trabajo: un día, un tema, se
  fusiona a master antes de cerrar.

- Las migraciones sólo van hacia adelante. Una migración ya aplicada NUNCA se
  edita ni se renombra: se corrige con una migración nueva. Todas idempotentes.
  Nunca `supabase db reset` contra el proyecto real.

- El orden de publicación es: migraciones -> Edge Functions -> frontend.
  Si tu cambio de frontend necesita una tabla, columna, RPC o función nueva,
  NO se fusiona a master hasta que la base ya la tenga.

- Todo lo que exista en la base tiene que existir como migración en el repo.
  Si tocas la base por fuera, escribes la migración equivalente en la misma
  sesión.

Reglas de seguridad que no se relajan:

- Toda fila de negocio lleva agencia_id. RLS y RPC son la autoridad para
  roles, tenant, atomicidad y campos privados; el frontend nunca decide
  permisos.
- Las vistas llevan siempre `security_invoker = on`.
- Nada de service_role, llaves de EasyBroker, Meta o Gemini en src/.
- Cada tabla o RPC nueva requiere migración canónica y prueba pgTAP de
  aislamiento entre agencia A y agencia B.
- Cliente y propietario no reciben notas internas, BANT ni directorios.

Cómo quiero que trabajes:

1. Antes de escribir: dime qué archivos vas a tocar y por qué. Si tocas la
   base de datos, dilo explícitamente.
2. Cambios pequeños y cerrados. Si la tarea no cabe en un día, propón cómo
   partirla y empieza por la primera parte, no por la infraestructura.
3. No reescribas a tu manera lo que ya funciona. Si algo te parece mal,
   dímelo y explica por qué, pero no lo cambies sin acordarlo.
4. Antes de terminar corre: npm run typecheck, npm run lint, npm test,
   npm run build, npm run check:bundle. Si tocaste la base:
   supabase start && supabase db reset && supabase test db (todo local).
5. Al cerrar, respóndeme estas tres:
   - ¿Tocaste la base de datos? ¿Está la migración en supabase/migrations?
   - ¿Quedó todo fusionado en master?
   - ¿Algo de lo que hiciste necesita desplegarse antes que el frontend?

Cuando termines de leer, dime qué entendiste del estado actual y espera mi
tarea. No empieces todavía.
```

---

## Después de la sesión de Codex

Antes de publicar, revisa tú mismo:

```bash
git status                        # limpio
git log --oneline -5              # entiendes cada commit
ls supabase/migrations | tail -3  # ¿hay migración nueva?
```

Si hay migración nueva, el orden es:

```bash
# 1. base
#    workflow "Desplegar base de datos y Edge Functions" -> migrate
# 2. funciones (si cambiaron)
#    mismo workflow -> functions
# 3. frontend
npm run deploy
```
