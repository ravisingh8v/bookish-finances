import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { emitPWAInstallReady, emitPWAUpdateReady } from "./lib/pwa";

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
      void updateSW(true);
    },
    onRegisteredSW(_swUrl, reg) {
      if (reg) {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
          return;
        }

        if (reg.installing) {
          reg.installing.addEventListener("statechange", () => {
            if (reg.installing?.state === "installed") {
              reg.waiting?.postMessage({ type: "SKIP_WAITING" });
            }
          });
        }

        void reg.update();
        setInterval(() => {
          void reg.update();
        }, 60 * 1000);
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
