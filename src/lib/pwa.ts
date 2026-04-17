import { useEffect, useState } from "react";

interface UpdateReadyEvent {
  type: "update-ready";
  payload: {
    registration: ServiceWorkerRegistration;
  };
}

type PWAEvent = UpdateReadyEvent;

let updateReadyCallback: ((event: UpdateReadyEvent) => void) | null = null;

export function onPWAUpdateReady(callback: (event: UpdateReadyEvent) => void) {
  updateReadyCallback = callback;
}

export function emitPWAUpdateReady(registration: ServiceWorkerRegistration) {
  if (updateReadyCallback) {
    updateReadyCallback({
      type: "update-ready",
      payload: { registration },
    });
  }
}

export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const handleUpdateReady = (event: UpdateReadyEvent) => {
      setUpdateAvailable(true);
      setRegistration(event.payload.registration);
    };

    onPWAUpdateReady(handleUpdateReady);

    return () => {
      updateReadyCallback = null;
    };
  }, []);

  const applyUpdate = () => {
    if (!registration?.waiting) {
      console.warn("No waiting service worker found");
      return;
    }

    // Listen for controller change before posting message
    let controllerChangeListener: (() => void) | null = null;
    const onControllerChange = () => {
      if (controllerChangeListener) {
        window.removeEventListener(
          "controllerchange",
          controllerChangeListener,
        );
        controllerChangeListener = null;
      }
      // Small delay to ensure new service worker has taken control
      setTimeout(() => {
        window.location.reload();
      }, 100);
    };

    controllerChangeListener = onControllerChange;
    window.addEventListener("controllerchange", onControllerChange);

    // Tell the waiting service worker to take control
    registration.waiting.postMessage({
      type: "SKIP_WAITING",
    });

    // Timeout fallback in case controller change doesn't fire
    const timeoutId = setTimeout(() => {
      if (controllerChangeListener) {
        window.removeEventListener(
          "controllerchange",
          controllerChangeListener,
        );
        window.location.reload();
      }
    }, 2000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (controllerChangeListener) {
        window.removeEventListener(
          "controllerchange",
          controllerChangeListener,
        );
      }
    };

    window.addEventListener("beforeunload", cleanup);
  };

  return {
    updateAvailable,
    applyUpdate,
  };
}

export async function checkForUpdates() {
  if (!navigator.serviceWorker.controller) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;

    await registration.update();
    return !!registration.waiting;
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return false;
  }
}
