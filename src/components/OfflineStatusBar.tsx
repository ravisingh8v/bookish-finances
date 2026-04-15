import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Cloud, CloudOff, Loader2, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function OfflineStatusBar() {
  const { isOnline, syncStatus, pendingCount, lastSyncedAt, syncNow } = useOfflineSync();

  const showBar = !isOnline || syncStatus === "syncing" || syncStatus === "success" || syncStatus === "error" || pendingCount > 0;
  if (!showBar) return null;

  let bgClass = "bg-amber-500/90 text-amber-950";
  let icon = <CloudOff className="h-3.5 w-3.5" />;
  let message = `Offline — ${pendingCount > 0 ? `${pendingCount} change${pendingCount !== 1 ? "s" : ""} pending sync` : "changes saved locally"}`;

  if (isOnline && syncStatus === "syncing") {
    bgClass = "bg-blue-500/90 text-white";
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    message = `Syncing ${pendingCount > 0 ? `${pendingCount} change${pendingCount !== 1 ? "s" : ""}` : "data"}…`;
  } else if (syncStatus === "success") {
    bgClass = "bg-emerald-500/90 text-white";
    icon = <CheckCircle className="h-3.5 w-3.5" />;
    message = "All changes synced" + (lastSyncedAt ? ` · ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "");
  } else if (isOnline && syncStatus === "error") {
    bgClass = "bg-destructive/90 text-destructive-foreground";
    icon = <AlertCircle className="h-3.5 w-3.5" />;
    message = `${pendingCount} change${pendingCount !== 1 ? "s" : ""} failed to sync`;
  } else if (isOnline && pendingCount > 0) {
    bgClass = "bg-amber-500/90 text-amber-950";
    icon = <Cloud className="h-3.5 w-3.5" />;
    message = `${pendingCount} change${pendingCount !== 1 ? "s" : ""} pending sync`;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className={`${bgClass} text-xs font-medium flex items-center justify-center gap-2 py-1.5 px-4 z-50`}
      >
        {icon}
        <span>{message}</span>
        {isOnline && pendingCount > 0 && syncStatus !== "syncing" && (
          <button
            onClick={syncNow}
            className="ml-2 flex items-center gap-1 opacity-80 hover:opacity-100 underline underline-offset-2"
          >
            <RefreshCw className="h-3 w-3" />
            Sync now
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
