// Workbox background sync bridge for useOfflineSync
let syncCallback: (() => Promise<void>) | null = null;

export function registerSyncCallback(cb: () => Promise<void>) {
  syncCallback = cb;
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SYNC_NOW") {
    syncCallback?.();
  }
});

// Export for SW
export {};
