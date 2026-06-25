import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { emitPWAInstallReady, emitPWAUpdateReady } from "./lib/pwa";

const BUILD_ID_STORAGE_KEY = "expenseflow-build-id";
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

  // Auto-update: apply newly deployed versions automatically and reload.
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // A new version is ready — activate it and reload with no user action.
      void updateSW(true);
    },
    onRegisteredSW(_swUrl, reg) {
      void ensureServiceWorkerControlsPage();
      if (reg) {
        // Periodically poll for new deployments so long-lived tabs update.
        setInterval(() => {
          void reg.update();
        }, 60 * 1000);
        emitPWAUpdateReady(reg);
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
