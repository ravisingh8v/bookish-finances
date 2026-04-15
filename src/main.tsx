import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

const BUILD_ID_STORAGE_KEY = "expenseflow-build-id";
const CACHE_RESET_STORAGE_KEY = "expenseflow-cache-reset-build-id";

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

async function bootstrap() {
  await clearLegacyCachesIfNeeded();
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registration?.update();
    },
    onNeedRefresh() {
      void updateSW(true);
    },
  });
  createRoot(document.getElementById("root")!).render(<App />);
}

void bootstrap();
