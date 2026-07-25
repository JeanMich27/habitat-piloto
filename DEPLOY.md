# Poner el piloto en línea para los 10 testers

El código ya está listo (backend compartido con Supabase, importador de
CSV/Excel, paquete descargable). Conectaste Supabase y Vercel en esta sesión,
pero esta sesión de Cowork no tiene control directo sobre esas cuentas para
crear el proyecto y desplegar por ti — son ~10 minutos de pasos manuales,
detallados abajo. Cuando tengas la URL de Supabase y el sitio en Vercel,
pégamelos y valido que todo quede conectado.

## 1. Crear el backend (Supabase) — 3 min

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Cuando esté listo: **SQL Editor** → **New query** → pega todo el contenido
   de `supabase/schema.sql` (en esta carpeta) → **Run**.
3. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public` key

## 2. Configurar la app con esas credenciales — 2 min

1. En esta carpeta, copia `.env.example` a `.env`.
2. Pega ahí los dos valores del paso anterior:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu_anon_key
   ```
3. Prueba en local: `npm run dev` — deberías ver el badge verde "● Piloto en
   vivo" arriba a la izquierda (si sale "Modo local", revisa el `.env`).

## 3. Subir el código a GitHub — 2 min

El repo ya está inicializado localmente (`git log` ya tiene un commit). Solo
falta conectarlo a un remoto:

```bash
git remote add origin https://github.com/TU-USUARIO/habitat-piloto.git
git branch -M main
git push -u origin main
```

(Si no tienes el repo creado en GitHub todavía, créalo vacío primero desde
github.com/new — sin README, para no chocar con el commit local.)

## 4. Desplegar en Vercel — 3 min

1. En [vercel.com/new](https://vercel.com/new), importa el repositorio que
   acabas de subir.
2. En **Environment Variables**, agrega los mismos dos valores del paso 2
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Deploy. Vercel detecta Vite automáticamente (build `npm run build`,
   output `dist`).
4. Esa URL (`tu-proyecto.vercel.app`) es lo que compartes con las 10
   personas — ahí pueden usar la app en el navegador y también descargarla
   (botón "Descargar app" en la barra superior, que sirve el zip generado
   por `public/descargas/habitat-piloto.zip`).

## 5. Generar / actualizar el paquete descargable

Cada vez que cambies algo en la app y quieras que el botón "Descargar app"
del sitio ofrezca la versión más reciente:

```bash
npm run package:standalone
git add public/descargas/habitat-piloto.zip
git commit -m "Actualiza paquete descargable"
git push
```

Esto reconstruye `dist/`, arma el `.zip` con `start.command`/`start.bat` y
lo deja publicado en `/descargas/habitat-piloto.zip` del sitio.

## Después de desplegar

Pásame la URL de Vercel y, si quieres, la del proyecto de Supabase — reviso
que la conexión en vivo funcione (usuarios viendo los mismos datos) y hago
una pasada final de QA antes de mandarla a los 10 testers.
