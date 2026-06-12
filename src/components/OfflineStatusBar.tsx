import { useOfflineSync } from "@/hooks/useOfflineSync";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff } from "lucide-react";

export function OfflineStatusBar() {
  const { isOnline } = useOfflineSync();

  return (
    <AnimatePresence mode="wait">
      {!isOnline && (
        <motion.div
          key="status-bar"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="bg-amber-500/90 text-amber-950 text-xs font-medium flex items-center justify-center gap-2 py-1.5 px-4 z-50"
        >
          <CloudOff className="h-3.5 w-3.5" />
          <span>You're offline. Reconnect to view and edit your data.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
