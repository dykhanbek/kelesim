import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { AppShell } from "./components/AppShell";
import { Loading, UiProvider } from "./components/ui";
import { I18nProvider } from "./i18n";
import { Brokers, DemoStart, Landing, Legal, PricingPage } from "./pages/Public";
import { Forgot, Login, Register, Reset } from "./pages/Auth";
import { Onboarding } from "./pages/Onboarding";
import { Dashboard } from "./pages/Dashboard";
import { DealsList, NewDeal } from "./pages/Deals";
import { Wizard } from "./pages/Wizard";
import { CheckScreen } from "./pages/Check";
import { PackagePreview } from "./pages/Package";
import { DealPage } from "./pages/DealPage";
import { DocumentsPage } from "./pages/Documents";
import { CounterpartiesPage, CounterpartyPage } from "./pages/Counterparties";
import { CalendarPage } from "./pages/Calendar";
import { CompanyPage } from "./pages/Company";
import { SettingsPage } from "./pages/Settings";
import { HelpPage, LimitPage } from "./pages/Help";
import "./styles.css";
import { applyTheme, watchSystemTheme } from "./theme";

applyTheme();
watchSystemTheme();

// PWA: offline app shell + "Add to home screen" (production builds only)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

/** Personal account zone: requires login; unfinished onboarding is resumed first. */
function Private({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (me.onboarding_step < 4 && !loc.pathname.startsWith("/app/onboarding")) return <Navigate to="/app/onboarding" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <Loading />;
  return me ? <Navigate to="/app" replace /> : <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/brokers" element={<Brokers />} />
      <Route path="/legal" element={<Legal />} />
      <Route path="/demo" element={<DemoStart />} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/forgot-password" element={<Forgot />} />
      <Route path="/reset-password" element={<Reset />} />
      <Route path="/app" element={<Private><AppShell /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="deals" element={<DealsList />} />
        <Route path="deals/new" element={<NewDeal />} />
        <Route path="deals/:id" element={<DealPage />} />
        <Route path="deals/:id/edit" element={<Wizard />} />
        <Route path="deals/:id/check" element={<CheckScreen />} />
        <Route path="deals/:id/documents" element={<PackagePreview />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="counterparties" element={<CounterpartiesPage />} />
        <Route path="counterparties/:id" element={<CounterpartyPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="company" element={<CompanyPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="limit" element={<LimitPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <UiProvider>
            <App />
          </UiProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
