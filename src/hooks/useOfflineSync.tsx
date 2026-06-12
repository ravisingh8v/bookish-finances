import { createContext, ReactNode, useContext } from "react";
import { useOnlineStatus } from "./useOnlineStatus";

interface OnlineStatusContextType {
  isOnline: boolean;
}

const OnlineStatusContext = createContext<OnlineStatusContextType | undefined>(
  undefined,
);

/**
 * Lightweight provider that only tracks online/offline status.
 * Offline support has been removed in favour of a realtime, online-first
 * experience. The provider/hook names are kept for backwards compatibility
 * with existing imports across the app.
 */
export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const isOnline = useOnlineStatus();
  return (
    <OnlineStatusContext.Provider value={{ isOnline }}>
      {children}
    </OnlineStatusContext.Provider>
  );
}

export function useOfflineSync() {
  const context = useContext(OnlineStatusContext);
  if (!context) {
    throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  }
  return context;
}
