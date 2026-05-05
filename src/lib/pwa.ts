import { useCallback, useEffect, useState } from "react";

interface UpdateReadyEvent {
  type: "update-ready";
  payload: {
    registration: ServiceWorkerRegistration;
  };
}

interface InstallReadyEvent {
  type: "install-ready";
  payload: {
    promptEvent: BeforeInstallPromptEvent;
  };
}

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
  }
}

type PWAEvent = UpdateReadyEvent | InstallReadyEvent;

let updateReadyCallback: ((event: UpdateReadyEvent) => void) | null = null;
let installReadyCallback: ((event: InstallReadyEvent) => void) | null = null;

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

export function emitPWAInstallReady(promptEvent: any) {
  if (installReadyCallback) {
    installReadyCallback({
      type: "install-ready",
      payload: { promptEvent },
    });
  }
}

export function onPWAInstallReady(
  callback: (event: InstallReadyEvent) => void,
) {
  installReadyCallback = callback;
}

export function usePWAStatus() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);

  useEffect(() => {
    const handlePWAEvent = (event: PWAEvent) => {
      if (event.type === "update-ready") {
        setUpdateAvailable(true);
        setRegistration(event.payload.registration);
      } else if (event.type === "install-ready") {
        setIsInstallable(true);
        setDeferredPrompt(event.payload.promptEvent);
      }
    };

    onPWAUpdateReady((e: UpdateReadyEvent) => handlePWAEvent(e));
    onPWAInstallReady((e: InstallReadyEvent) => handlePWAEvent(e));

    // Check for updates on mount/online
    checkForUpdates();

    const handleOnline = () => checkForUpdates();
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      updateReadyCallback = null;
      installReadyCallback = null;
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!registration?.waiting) return false;

    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => window.location.reload(), 250);
    setUpdateAvailable(false);
    return true;
  }, [registration]);

  const promptInstall = () => {
    if (!deferredPrompt) return false;

    (deferredPrompt as BeforeInstallPromptEvent).prompt();
    // Hide prompt after user sees it
    setIsInstallable(false);
    setDeferredPrompt(null);
    return true;
  };

  return {
    updateAvailable,
    isInstallable,
    applyUpdate,
    promptInstall,
    checkForUpdates,
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
