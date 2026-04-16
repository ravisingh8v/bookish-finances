import { useOfflineSync } from "@/hooks/useOfflineSync";
import {
  AlertCircle,
  CloudOff,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function OfflineStatusBar() {
  const { isOnline, syncStatus, pendingCount, syncNow } =
    useOfflineSync();

  // ONLY show: when offline OR when there are sync errors/pending items
  // Hide completely when online and synced - sync happens silently
  const showBar =
    !isOnline ||
    syncStatus === "error" ||
    (pendingCount > 0 && syncStatus !== "success");

  let bgClass = "bg-amber-500/90 text-amber-950";
  let icon = <CloudOff className="h-3.5 w-3.5" />;
  let message = `Offline - ${
    pendingCount > 0
      ? `${pendingCount} change${pendingCount !== 1 ? "s" : ""} pending sync`
      : "changes saved locally"
  }`;

  if (isOnline && syncStatus === "error") {
    bgClass = "bg-destructive/90 text-destructive-foreground";
    icon = <AlertCircle className="h-3.5 w-3.5" />;
    message = `${pendingCount} change${pendingCount !== 1 ? "s" : ""} failed to sync`;
  } else if (isOnline && pendingCount > 0) {
    bgClass = "bg-blue-500/90 text-white";
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    message = `${pendingCount} change${pendingCount !== 1 ? "s" : ""} syncing...`;
  }

  return (
    <AnimatePresence mode="wait">
      {showBar && (
        <motion.div
          key="status-bar"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className={`${bgClass} text-xs font-medium flex items-center justify-center gap-2 py-1.5 px-4 z-50`}
        >
          {icon}
          <span>{message}</span>
          {isOnline && syncStatus === "error" && (
            <button
              onClick={syncNow}
              className="ml-2 flex items-center gap-1 opacity-80 hover:opacity-100 underline underline-offset-2"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
