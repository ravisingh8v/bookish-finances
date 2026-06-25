/**
 * Hard refresh: clears all cached assets (Cache Storage), unregisters service
 * workers, and reloads the app from the server. Works on desktop and mobile.
 */
export async function hardRefresh() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.map((r) => r.unregister()));
    }
  } catch {
    // ignore
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // ignore
  }

  // Bust any HTTP cache by appending a cache-busting param before reloading.
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.replace(url.toString());
}
