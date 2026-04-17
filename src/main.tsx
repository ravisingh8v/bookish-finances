import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { emitPWAUpdateReady } from "./lib/pwa";

const BUILD_ID_STORAGE_KEY = "expenseflow-build-id";
const CACHE_RESET_STORAGE_KEY = "expenseflow-cache-reset-build-id";
const SW_CONTROL_RELOAD_KEY = "expenseflow-sw-control-reload";

// Cache names that should be cleared on update
const CLEARABLE_CACHES = ["app-pages", "app-shell", "app-images", "api-cache"];

async function clearLegacyCachesIfNeeded() {
  const previousBuildId = localStorage.getItem(BUILD_ID_STORAGE_KEY);
  const alreadyResetForBuild = localStorage.getItem(CACHE_RESET_STORAGE_KEY);
  localStorage.setItem(BUILD_ID_STORAGE_KEY, __APP_BUILD_ID__);

  if (
    !previousBuildId ||
    previousBuildId === __APP_BUILD_ID__ ||
    alreadyResetForBuild === __APP_BUILD_ID__
  ) {
    return;
  }

  // Only clear specific app caches, not all caches
  // This preserves any important data in custom caches
  if ("caches" in window) {
    try {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((name) => CLEARABLE_CACHES.includes(name))
          .map((cacheKey) => caches.delete(cacheKey)),
      );
    } catch (error) {
      console.error("Error clearing caches:", error);
    }
  }

  localStorage.setItem(CACHE_RESET_STORAGE_KEY, __APP_BUILD_ID__);
}

async function ensureServiceWorkerControlsPage() {
  if (!("serviceWorker" in navigator) || navigator.serviceWorker.controller) {
    return;
  }

  const reloadKey = `${SW_CONTROL_RELOAD_KEY}:${__APP_BUILD_ID__}`;
  const alreadyReloaded = sessionStorage.getItem(reloadKey) === "1";

  const isControlled = await new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      resolve(value);
    };

    const handleControllerChange = () => {
      finish(Boolean(navigator.serviceWorker.controller));
    };

    const timeoutId = window.setTimeout(() => {
      finish(Boolean(navigator.serviceWorker.controller));
    }, 1500);

    navigator.serviceWorker.ready
      .then((registration) => {
        if (navigator.serviceWorker.controller) {
          finish(true);
          return;
        }

        if (!registration.active) {
          finish(false);
          return;
        }

        navigator.serviceWorker.addEventListener(
          "controllerchange",
          handleControllerChange,
        );
      })
      .catch(() => finish(false));
  });

  if (isControlled) {
    sessionStorage.removeItem(reloadKey);
    return;
  }

  if (!alreadyReloaded) {
    sessionStorage.setItem(reloadKey, "1");
    window.location.reload();
  }
}

async function bootstrap() {
  await clearLegacyCachesIfNeeded();

  let registration: ServiceWorkerRegistration | null = null;
  let updateCheckInterval: number | null = null;

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, reg) {
      registration = reg;
      reg?.update();
      void ensureServiceWorkerControlsPage();

      // Periodically check for updates (every 30 seconds)
      if (updateCheckInterval === null) {
        updateCheckInterval = window.setInterval(() => {
          reg?.update().catch(() => {
            // Silently ignore errors during background checks
          });
        }, 30000);
      }

      // Listen for state changes in waiting worker
      reg?.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // There's a new service worker and we're controlled
              // This means there's an update ready
              if (registration) {
                emitPWAUpdateReady(registration);
              }
            }
          });
        }
      });
    },
    onNeedRefresh() {
      // Emit update ready event to show notification
      if (registration) {
        emitPWAUpdateReady(registration);
      }
    },
    onOfflineReady() {
      void ensureServiceWorkerControlsPage();
    },
  });

  createRoot(document.getElementById("root")!).render(<App />);
  void ensureServiceWorkerControlsPage();

  // Cleanup on unload
  window.addEventListener("beforeunload", () => {
    if (updateCheckInterval !== null) {
      clearInterval(updateCheckInterval);
    }
  });
}

void bootstrap();
