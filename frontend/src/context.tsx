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
import { DEFAULT_WIDGET_LAYOUT } from "./types";
import { applyTheme, currentMonth, resolveTheme } from "./utils";

export type DashboardCustomizeSession = {
  saving: boolean;
  onDone: () => Promise<void>;
  onCancel: () => void;
};

export type PageComposerSession = {
  active: boolean;
  onAdd: () => void;
  onCancel: () => void;
};

interface AppContextValue {
  month: string;
  setMonth: (m: string) => void;
  settings: Settings | null;
  defaultCurrency: string;
  locale: string;
  currencies: Currency[];
  resolvedTheme: "light" | "dark";
  dashboardCustomizing: boolean;
  setDashboardCustomizing: (value: boolean | ((prev: boolean) => boolean)) => void;
  dashboardCustomizeSession: DashboardCustomizeSession | null;
  registerDashboardCustomize: (session: DashboardCustomizeSession | null) => void;
  pageComposerSession: PageComposerSession | null;
  registerPageComposer: (session: PageComposerSession | null) => void;
  refreshSettings: () => Promise<void>;
  refreshCurrencies: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const fallbackSettings: Settings = {
  id: 0,
  default_currency_code: "USD",
  theme: "system",
  locale: "en-US",
  dashboard_widgets: ["pocket", "overview", "money_location", "spend_by_category", "budgets", "goals", "deposits", "credits_debts"],
  dashboard_widget_views: {},
  dashboard_widget_layout: DEFAULT_WIDGET_LAYOUT,
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(currentMonth);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [dashboardCustomizing, setDashboardCustomizing] = useState(false);
  const [dashboardCustomizeSession, setDashboardCustomizeSession] =
    useState<DashboardCustomizeSession | null>(null);
  const [pageComposerSession, setPageComposerSession] =
    useState<PageComposerSession | null>(null);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    resolveTheme("system"),
  );

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
      setResolvedTheme(applyTheme(next.theme));
    } catch {
      setSettings(fallbackSettings);
      setResolvedTheme(applyTheme("system"));
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
    void refreshCurrencies();
    void api.post("/recurring/process", {}).catch(() => undefined);
  }, [refreshSettings, refreshCurrencies]);

  useEffect(() => {
    if (!settings?.theme) return;
    setResolvedTheme(applyTheme(settings.theme));
  }, [settings?.theme]);

  useEffect(() => {
    if (!settings || settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolvedTheme(applyTheme("system"));
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
        resolvedTheme,
        dashboardCustomizing,
        setDashboardCustomizing,
        dashboardCustomizeSession,
        registerDashboardCustomize: setDashboardCustomizeSession,
        pageComposerSession,
        registerPageComposer: setPageComposerSession,
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
