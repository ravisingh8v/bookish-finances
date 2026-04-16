import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

const BUILD_ID_STORAGE_KEY = "expenseflow-build-id";
const CACHE_RESET_STORAGE_KEY = "expenseflow-cache-reset-build-id";
const SW_CONTROL_RELOAD_KEY = "expenseflow-sw-control-reload";

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

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
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
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registration?.update();
      void ensureServiceWorkerControlsPage();
    },
    onNeedRefresh() {
      void updateSW(true);
    },
    onOfflineReady() {
      void ensureServiceWorkerControlsPage();
    },
  });
  createRoot(document.getElementById("root")!).render(<App />);
  void ensureServiceWorkerControlsPage();
}

void bootstrap();
