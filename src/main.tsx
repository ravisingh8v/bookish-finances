import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { emitPWAInstallReady, emitPWAUpdateReady, checkForUpdates } from "./lib/pwa";

function bootstrap() {
  let isRefreshing = false;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (isRefreshing) return;
      isRefreshing = true;
      window.location.reload();
    });
  }

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // A new service worker is available. Emit an update-ready event
      // so the UI can prompt the user instead of forcing activation.
      void checkForUpdates();
    },
    onRegisteredSW(_swUrl, reg) {
      if (reg) {
        // If a worker is already waiting or installing, notify the app
        // so it can ask the user to apply the update. Avoid forcing
        // SKIP_WAITING here to prevent unexpected behavior on installed
        // mobile PWAs.
        if (reg.waiting || reg.installing) {
          emitPWAUpdateReady(reg);
        }

        // Trigger an update check immediately and periodically.
        void reg.update();
        setInterval(() => {
          void reg.update();
        }, 60 * 1000);
        // Also emit update-ready for completeness when registration occurs.
        emitPWAUpdateReady(reg);
      }
    },
    onOfflineReady() {},
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    emitPWAInstallReady(e);
  });

  createRoot(document.getElementById("root")!).render(<App />);

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
