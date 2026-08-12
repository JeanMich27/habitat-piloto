/*
 * Service worker de la plataforma.
 *
 * Estrategia (deliberadamente simple, sin build step extra):
 *  - Peticiones a Supabase / cualquier API  -> SOLO red. Nunca se cachean:
 *    los datos de propiedades y prospectos deben ser siempre frescos y
 *    además llevan tokens de sesión.
 *  - Assets con hash (/assets/*.js, *.css) -> cache-first. Vite les pone un
 *    hash en el nombre, así que si cambian el nombre cambia; nunca sirven
 *    contenido viejo.
 *  - Navegaciones (abrir la app)           -> network-first con fallback al
 *    index.html cacheado. Así, sin internet, la app abre y muestra su propia
 *    pantalla de "sin conexión" en vez del dinosaurio del navegador.
 *
 * Para forzar que todos los dispositivos actualicen el cache, sube CACHE_VERSION.
 */

const CACHE_VERSION = "v10";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const ASSET_CACHE = `assets-${CACHE_VERSION}`;

const SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll falla entero si un recurso falla; el catch evita que un 404
      // tumbe la instalación completa del service worker.
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Distinto origen (Supabase, CDNs, analítica): siempre a la red.
  if (url.origin !== self.location.origin) return;

  // Navegación: red primero, cache como red de seguridad.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() =>
          caches
            .match("/index.html")
            .then((cached) => cached ?? caches.match("/")),
        ),
    );
    return;
  }

  // Assets con hash e íconos: cache primero.
  const esAssetEstatico =
    url.pathname.startsWith("/assets/") ||
    /\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ico)$/i.test(url.pathname);

  if (esAssetEstatico) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
