import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppModeProvider } from "@/contexts/AppModeContext";
import { DemoPortfolioProvider } from "@/contexts/DemoPortfolioContext";
import { BotProvider } from "@/contexts/BotContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SessionExpiryWarning } from "@/components/session/SessionExpiryWarning";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Scanner from "./pages/Scanner";
import Portfolio from "./pages/Portfolio";
import Admin from "./pages/Admin";
import AdminAnalytics from "./pages/AdminAnalytics";
import UserSettings from "./pages/UserSettings";
import MemeSniperSettings from "./pages/MemeSniperSettings";
import RiskCompliance from "./pages/RiskCompliance";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Notifications from "./pages/Notifications";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppModeProvider>
        <DemoPortfolioProvider>
          <BotProvider>
            <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <SessionExpiryWarning />
            <OfflineIndicator />
            <ErrorBoundary>
            <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/scanner"
              element={
                <ProtectedRoute>
                  <Scanner />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portfolio"
              element={
                <ProtectedRoute>
                  <Portfolio />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <UserSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sniper-settings"
              element={
                <ProtectedRoute>
                  <MemeSniperSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/risk"
              element={
                <ProtectedRoute>
                  <RiskCompliance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminAnalytics />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
            </Routes>
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
          </BotProvider>
        </DemoPortfolioProvider>
      </AppModeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
