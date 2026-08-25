import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AppProvider } from "./context";
import { BudgetsPage } from "./pages/BudgetsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GoalsPage } from "./pages/GoalsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { TransactionsPage } from "./pages/TransactionsPage";

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/goals" element={<GoalsPage />} />
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
