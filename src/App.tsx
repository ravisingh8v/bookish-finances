import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { OfflineSyncProvider } from "@/hooks/useOfflineSync";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Books from "./pages/Books";
import BookDetail from "./pages/BookDetail";
import Analytics from "./pages/Analytics";
import SettingsPage from "./pages/SettingsPage";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OfflineSyncProvider>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/books" element={<Books />} />
              <Route path="/books/:bookId" element={<BookDetail />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <PWAUpdatePrompt />
          </OfflineSyncProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
