import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { emitPWAInstallReady, emitPWAUpdateReady } from "./lib/pwa";

const BUILD_ID_STORAGE_KEY = "expenseflow-build-id";
const CACHE_RESET_STORAGE_KEY = "expenseflow-cache-reset-build-id";
const SW_CONTROL_RELOAD_KEY = "expenseflow-sw-control-reload";

// Cache names that should be cleared on update
const CLEARABLE_CACHES = ["app-pages", "app-shell", "app-images", "api-cache"];

async function clearLegacyCachesIfNeeded() {
  // Disabled: Causes double loads on first app open
  console.log("App version:", __APP_BUILD_ID__);
  localStorage.setItem(BUILD_ID_STORAGE_KEY, __APP_BUILD_ID__);
}

async function ensureServiceWorkerControlsPage() {
  // Simplified: Rely on vite-pwa prompt, no aggressive reloads
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    console.log("SW controls page");
  }
}

async function bootstrap() {
  await clearLegacyCachesIfNeeded();

  let registration: ServiceWorkerRegistration | null = null;

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, reg) {
      registration = reg;
      void ensureServiceWorkerControlsPage();

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

  // PWA Install Prompt
  let deferredInstallPrompt: Event | null = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    emitPWAInstallReady(e);
    console.log("PWA install prompt ready");
  });

  createRoot(document.getElementById("root")!).render(<App />);

  // Fade out the static splash screen once React has mounted.
  requestAnimationFrame(() => {
    setTimeout(() => {
      const splash = document.getElementById("app-splash");
      if (splash) {
        splash.classList.add("hide");
        setTimeout(() => splash.remove(), 400);
      }
    }, 250);
  });
}

void bootstrap();
