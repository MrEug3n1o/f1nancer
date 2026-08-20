import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { Settings } from "./types";
import { currentMonth } from "./utils";

interface AppContextValue {
  month: string;
  setMonth: (m: string) => void;
  currency: string;
  refreshSettings: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(currentMonth);
  const [currency, setCurrency] = useState("USD");

  const refreshSettings = useCallback(async () => {
    try {
      const settings = await api.get<Settings>("/settings");
      setCurrency(settings.currency_code);
    } catch {
      setCurrency("USD");
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
    void api.post("/recurring/process", {}).catch(() => undefined);
  }, [refreshSettings]);

  return (
    <AppContext.Provider value={{ month, setMonth, currency, refreshSettings }}>
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
