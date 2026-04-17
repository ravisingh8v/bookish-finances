import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function PWAUpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      // Poll for updates every 30 minutes
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {});
        }, 30 * 60 * 1000);
      }
    },
  });

  useEffect(() => {
    if (needRefresh) setDismissed(false);
  }, [needRefresh]);

  const show = needRefresh && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 20 }}
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50"
        >
          <div className="rounded-2xl border bg-card shadow-lg p-4 flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 shrink-0">
              <RefreshCw className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Update available</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                A new version is ready. Reload to apply.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => updateServiceWorker(true)}
                >
                  Update Now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => {
                    setDismissed(true);
                    setNeedRefresh(false);
                  }}
                >
                  Later
                </Button>
              </div>
            </div>
            <button
              onClick={() => {
                setDismissed(true);
                setNeedRefresh(false);
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
