import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { OfflineStatusBar } from "./OfflineStatusBar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { session, loading, profile } = useAuth();

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  if (!session) return <Navigate to="/auth" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border px-4 gap-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
            <SidebarTrigger />
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                {profile?.display_name?.[0]?.toUpperCase() ?? "U"}
              </div>
              <span className="text-sm font-medium hidden sm:block">
                {profile?.display_name ?? "User"}
              </span>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
