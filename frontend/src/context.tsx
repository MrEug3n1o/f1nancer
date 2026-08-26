import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { Currency, Settings } from "./types";
import { applyTheme, currentMonth } from "./utils";

interface AppContextValue {
  month: string;
  setMonth: (m: string) => void;
  settings: Settings | null;
  defaultCurrency: string;
  locale: string;
  currencies: Currency[];
  dashboardCustomizing: boolean;
  setDashboardCustomizing: (value: boolean | ((prev: boolean) => boolean)) => void;
  refreshSettings: () => Promise<void>;
  refreshCurrencies: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const fallbackSettings: Settings = {
  id: 0,
  default_currency_code: "USD",
  theme: "system",
  locale: "en-US",
  first_day_of_week: "monday",
  dashboard_widgets: ["overview", "spend_by_category", "budgets", "goals", "deposits"],
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(currentMonth);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [dashboardCustomizing, setDashboardCustomizing] = useState(false);

  const refreshCurrencies = useCallback(async () => {
    try {
      setCurrencies(await api.get<Currency[]>("/currencies"));
    } catch {
      setCurrencies([]);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const next = await api.get<Settings>("/settings");
      setSettings(next);
      applyTheme(next.theme);
    } catch {
      setSettings(fallbackSettings);
      applyTheme("system");
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
    void refreshCurrencies();
    void api.post("/recurring/process", {}).catch(() => undefined);
  }, [refreshSettings, refreshCurrencies]);

  useEffect(() => {
    if (!settings?.theme) return;
    applyTheme(settings.theme);
  }, [settings?.theme]);

  useEffect(() => {
    if (!settings || settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings]);

  const defaultCurrency =
    settings?.default_currency_code ??
    currencies[0]?.code ??
    "USD";

  return (
    <AppContext.Provider
      value={{
        month,
        setMonth,
        settings,
        defaultCurrency,
        locale: "en-US",
        currencies,
        dashboardCustomizing,
        setDashboardCustomizing,
        refreshSettings,
        refreshCurrencies,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within AppProvider");
  }
  return ctx;
}
