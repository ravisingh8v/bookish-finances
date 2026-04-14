import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Cloud, CloudOff, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function OfflineStatusBar() {
  const { isOnline, syncStatus, pendingCount } = useOfflineSync();

  const showBar = !isOnline || syncStatus === "syncing" || syncStatus === "success" || syncStatus === "error" || pendingCount > 0;

  if (!showBar) return null;

  let bgClass = "bg-amber-500/90 text-amber-950";
  let icon = <CloudOff className="h-4 w-4" />;
  let message = `You're offline. ${pendingCount > 0 ? `${pendingCount} pending action(s).` : "Changes will be saved locally."}`;

  if (isOnline && syncStatus === "syncing") {
    bgClass = "bg-blue-500/90 text-white";
    icon = <Loader2 className="h-4 w-4 animate-spin" />;
    message = "Syncing offline data...";
  } else if (syncStatus === "success") {
    bgClass = "bg-emerald-500/90 text-white";
    icon = <CheckCircle className="h-4 w-4" />;
    message = "All data synced!";
  } else if (isOnline && syncStatus === "error") {
    bgClass = "bg-destructive/90 text-destructive-foreground";
    icon = <AlertCircle className="h-4 w-4" />;
    message = "Some actions failed to sync. Will retry.";
  } else if (isOnline && pendingCount > 0) {
    bgClass = "bg-amber-500/90 text-amber-950";
    icon = <Cloud className="h-4 w-4" />;
    message = `${pendingCount} action(s) pending sync.`;
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
      </motion.div>
    </AnimatePresence>
  );
}
