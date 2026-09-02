import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore, startFirebaseAuthListener } from "@/store/authStore";
import { useAppStore } from "@/store/appStore";
import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";

// Layouts
import { AppLayout } from "@/components/layout/AppLayout";

// Pages
import { LoginPage }         from "@/pages/LoginPage";
import { RegisterPage }      from "@/pages/RegisterPage";
import { DashboardPage }     from "@/pages/DashboardPage";
import { CostAnalysisPage }  from "@/pages/CostAnalysisPage";
import { AnomaliesPage }     from "@/pages/AnomaliesPage";
import { OptimizationPage }  from "@/pages/OptimizationPage";
import { AiAssistantPage }   from "@/pages/AiAssistantPage";
import { DatasetHistoryPage } from "@/pages/DatasetHistoryPage";
import { DemoDataPage }      from "@/pages/DemoDataPage";
import { SettingsPage }      from "@/pages/SettingsPage";

// Start Firebase auth listener once at module level (survives re-renders)
startFirebaseAuthListener();

// ─── Route guards ─────────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, isAuthChecked } = useAuthStore();
  if (!isAuthChecked) return null;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, isAuthChecked } = useAuthStore();
  if (!isAuthChecked) return null;
  if (firebaseUser) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// ─── Full-screen loading spinner ─────────────────────────────────────────────

function AppLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/15 border border-primary/25">
          <Cpu className="w-6 h-6 text-primary animate-pulse" />
        </div>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { isAuthChecked } = useAuthStore();

  // Show loader until Firebase auth state is resolved
  if (!isAuthChecked) return <AppLoader />;

  return (
    <TooltipProvider delayDuration={300}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

          {/* Protected */}
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"     element={<DashboardPage />} />
            <Route path="cost-analysis" element={<CostAnalysisPage />} />
            <Route path="anomalies"     element={<AnomaliesPage />} />
            <Route path="optimization"  element={<OptimizationPage />} />
            <Route path="ai-assistant"  element={<AiAssistantPage />} />
            <Route path="demo-data"     element={<DemoDataPage />} />
            <Route path="history"       element={<DatasetHistoryPage />} />
            <Route path="settings"      element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
}
