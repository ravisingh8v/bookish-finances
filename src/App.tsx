import { ScrollToTop } from "@/components/ScrollToTop";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { OfflineSyncProvider } from "@/hooks/useOfflineSync";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import Analytics from "./pages/Analytics";
import Auth from "./pages/Auth";
import BookDetail from "./pages/BookDetail";
import Books from "./pages/Books";
import Dashboard from "./pages/Dashboard";
import MoneyTracker from "./pages/MoneyTracker";
import DebtDetail from "./pages/DebtDetail";
import Debts from "./pages/Debts";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import SettingsPage from "./pages/SettingsPage";
import SplitBills from "./pages/SplitBills";

import queryClient from "@/lib/queryClient";

const LegacyDueRedirect = () => {
  const { dueId } = useParams();
  return <Navigate to={dueId ? `/debts/${dueId}` : "/debts"} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="bookish-theme"
    >
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
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
                <Route path="/debts" element={<Debts />} />
                <Route path="/debts/:debtId" element={<DebtDetail />} />
                <Route path="/money-tracker" element={<MoneyTracker />} />
                <Route path="/dues" element={<Navigate to="/debts" replace />} />
                <Route path="/dues/:dueId" element={<LegacyDueRedirect />} />
                <Route path="/split-bills" element={<SplitBills />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </OfflineSyncProvider>
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
