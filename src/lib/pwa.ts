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

const updateReadyCallbacks = new Set<(event: UpdateReadyEvent) => void>();
const installReadyCallbacks = new Set<(event: InstallReadyEvent) => void>();
let latestRegistration: ServiceWorkerRegistration | null = null;
let latestInstallPrompt: BeforeInstallPromptEvent | null = null;

export function onPWAUpdateReady(callback: (event: UpdateReadyEvent) => void) {
  updateReadyCallbacks.add(callback);
  if (latestRegistration?.waiting) {
    callback({
      type: "update-ready",
      payload: { registration: latestRegistration },
    });
  }
  return () => updateReadyCallbacks.delete(callback);
}

export function emitPWAUpdateReady(registration: ServiceWorkerRegistration) {
  latestRegistration = registration;
  updateReadyCallbacks.forEach((callback) => {
    callback({
      type: "update-ready",
      payload: { registration },
    });
  });
}

export function emitPWAInstallReady(promptEvent: any) {
  latestInstallPrompt = promptEvent;
  installReadyCallbacks.forEach((callback) => {
    callback({
      type: "install-ready",
      payload: { promptEvent },
    });
  });
}

export function onPWAInstallReady(
  callback: (event: InstallReadyEvent) => void,
) {
  installReadyCallbacks.add(callback);
  if (latestInstallPrompt) {
    callback({
      type: "install-ready",
      payload: { promptEvent: latestInstallPrompt },
    });
  }
  return () => installReadyCallbacks.delete(callback);
}

export function usePWAStatus() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);

  const checkNow = useCallback(async () => {
    const nextRegistration = await getUpdatedRegistration();
    if (nextRegistration) {
      latestRegistration = nextRegistration;
      setRegistration(nextRegistration);
      setUpdateAvailable(Boolean(nextRegistration.waiting));
      return Boolean(nextRegistration.waiting);
    }
    setUpdateAvailable(false);
    return false;
  }, []);

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

    const cleanupUpdate = onPWAUpdateReady((e: UpdateReadyEvent) =>
      handlePWAEvent(e),
    );
    const cleanupInstall = onPWAInstallReady((e: InstallReadyEvent) =>
      handlePWAEvent(e),
    );

    // Check for updates on mount/online
    void checkNow();

    const handleOnline = () => void checkNow();
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      cleanupUpdate();
      cleanupInstall();
    };
  }, [checkNow]);

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
    latestInstallPrompt = null;
    return true;
  };

  return {
    updateAvailable,
    isInstallable,
    applyUpdate,
    promptInstall,
    checkForUpdates: checkNow,
  };
}

async function getUpdatedRegistration() {
  if (!navigator.serviceWorker.controller) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return null;

    await registration.update();
    return registration;
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return null;
  }
}

export async function checkForUpdates() {
  const registration = await getUpdatedRegistration();
  if (registration?.waiting) {
    emitPWAUpdateReady(registration);
  }
  return Boolean(registration?.waiting);
}
