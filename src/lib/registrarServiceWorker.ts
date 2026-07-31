/**
 * Registro del service worker que hace la app instalable en el teléfono.
 *
 * Solo se registra en producción: en `npm run dev` un service worker cachea
 * módulos y rompe el hot reload de Vite.
 */
export function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      // Falla silenciosa a propósito: sin service worker la app sigue
      // funcionando normal, solo pierde el modo offline.
      console.warn("No se pudo registrar el service worker:", error);
    });
  });
}
