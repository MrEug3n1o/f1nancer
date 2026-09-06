import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AppProvider } from "./context";
import { AuthPage } from "./pages/AuthPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { BankPage } from "./pages/BankPage";
import { CreditsDebtsPage } from "./pages/CreditsDebtsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GoalsPage } from "./pages/GoalsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { AuthProvider, useAuth } from "./sync/AuthProvider";

function SignedInApp() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/bank" element={<BankPage />} />
            <Route path="/deposits" element={<Navigate to="/bank" replace />} />
            <Route path="/credits-debts" element={<CreditsDebtsPage />} />
            <Route path="/subscriptions" element={<SubscriptionsPage />} />
            <Route path="/statistics" element={<Navigate to="/" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="auth-shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!session) return <AuthPage />;
  return <SignedInApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
