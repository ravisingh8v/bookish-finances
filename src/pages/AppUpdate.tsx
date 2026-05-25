import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePWAStatus } from "@/lib/pwa";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AppUpdate() {
  const {
    updateAvailable,
    isInstallable,
    applyUpdate,
    promptInstall,
    checkForUpdates,
  } = usePWAStatus();
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const handleCheck = async () => {
    setChecking(true);
    const hasUpdate = await checkForUpdates();
    setChecking(false);
    setLastChecked(
      new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    if (hasUpdate) {
      toast.success("Update ready to install");
    } else {
      toast("You're already on the latest version");
    }
  };

  const handleUpdate = () => {
    if (!applyUpdate()) {
      toast("No downloaded update is ready yet");
    }
  };

  const handleInstall = () => {
    if (!promptInstall()) {
      toast("Install is not available on this browser right now");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl font-display font-bold">App Update</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Check for the latest version and install it when it is ready.
          </p>
        </motion.div>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="font-display text-lg">Version Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border bg-background/70 p-4">
              {updateAvailable ? (
                <Download className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {updateAvailable ? "Update available" : "App is up to date"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {updateAvailable
                    ? "A newer build has been downloaded and can be applied now."
                    : lastChecked
                      ? `Last checked at ${lastChecked}.`
                      : "Run a check when you want to refresh the app version."}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={handleCheck}
                disabled={checking}
                className="h-11 sm:w-auto"
              >
                {checking ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Check for Update
              </Button>
              <Button
                variant="outline"
                onClick={handleUpdate}
                disabled={!updateAvailable}
                className="h-11 sm:w-auto"
              >
                <Download className="mr-2 h-4 w-4" />
                Update App
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="font-display text-lg">Install</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">Add to home screen</p>
              <p className="text-sm text-muted-foreground">
                {isInstallable
                  ? "This device can install the app."
                  : "Install may already be done or unavailable in this browser."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleInstall}
              disabled={!isInstallable}
              className="h-11 shrink-0"
            >
              <Smartphone className="mr-2 h-4 w-4" />
              Install
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
