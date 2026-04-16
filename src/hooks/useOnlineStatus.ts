import { useSyncExternalStore } from "react";
import {
  getNetworkStatusSnapshot,
  subscribeToNetworkStatus,
} from "@/lib/network";

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeToNetworkStatus,
    getNetworkStatusSnapshot,
    () => true,
  );
}
