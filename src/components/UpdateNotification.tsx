import { Button } from "@/components/ui/button";
import { usePWAUpdate } from "@/lib/pwa";
import { AnimatePresence, motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { useState } from "react";

export function UpdateNotification() {
  const { updateAvailable, applyUpdate } = usePWAUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (!updateAvailable || dismissed) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-4 right-4 z-50"
      >
        <div className="bg-primary text-primary-foreground rounded-lg shadow-lg p-4 pr-3 flex items-center gap-3 max-w-sm">
          <div className="flex-1 flex items-center gap-3">
            <Download className="h-5 w-5 flex-shrink-0 animate-pulse" />
            <div>
              <p className="font-semibold text-sm">Update available</p>
              <p className="text-xs opacity-90">
                A new version is ready to use
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs hover:bg-white/20"
              onClick={() => applyUpdate()}
            >
              Update
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-white/20"
              onClick={() => setDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
