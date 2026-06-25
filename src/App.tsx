import { ScrollToTop } from "@/components/ScrollToTop";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { OfflineSyncProvider } from "@/hooks/useOfflineSync";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Analytics from "./pages/Analytics";
import Auth from "./pages/Auth";
import BookDetail from "./pages/BookDetail";
import Books from "./pages/Books";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import SettingsPage from "./pages/SettingsPage";
import SplitBills from "./pages/SplitBills";

import queryClient from "@/lib/queryClient";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OfflineSyncProvider>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<Navigate to="/books" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/books" element={<Books />} />
              <Route path="/books/:bookId" element={<BookDetail />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/split-bills" element={<SplitBills />} />
              <Route path="/app-update" element={<AppUpdate />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </OfflineSyncProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
