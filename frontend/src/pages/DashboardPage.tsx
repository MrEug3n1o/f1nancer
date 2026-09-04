import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import {
  BudgetsView,
  CategoryBreakdownView,
  DepositsView,
  GoalsView,
  OverviewView,
  PocketView,
  SpendCategoryView,
} from "../components/dashboardViews";
import { DashboardWidget } from "../components/DashboardWidget";
import { EmptyState, ErrorBanner, Select } from "../components/ui";
import { WidgetViewPicker } from "../components/WidgetViewPicker";
import { useApp } from "../context";
import type {
  Budget,
  CategorySpend,
  Deposit,
  GoalProgress,
  MonthOverview,
  PocketOverview,
  Settings,
} from "../types";
import {
  resolveWidgetView,
  type DashboardWidgetId,
} from "../types";

const DEFAULT_WIDGETS = [
  "pocket",
  "overview",
  "spend_by_category",
  "budgets",
  "goals",
  "deposits",
];

export function DashboardPage() {
  const {
    month,
    settings,
    locale,
    refreshSettings,
    dashboardCustomizing,
    resolvedTheme,
  } = useApp();
  const widgets = settings?.dashboard_widgets ?? DEFAULT_WIDGETS;
  const widgetViews = settings?.dashboard_widget_views ?? {};
  const [overview, setOverview] = useState<MonthOverview | null>(null);
  const [pocket, setPocket] = useState<PocketOverview | null>(null);
  const [spend, setSpend] = useState<CategorySpend[]>([]);
  const [goals, setGoals] = useState<GoalProgress[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spendCurrency, setSpendCurrency] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const spendUrl = spendCurrency
        ? `/analytics/spend-by-category?month=${month}&currency=${spendCurrency}`
        : `/analytics/spend-by-category?month=${month}`;
      const [ov, pocketData, sp, gp, bu, dep] = await Promise.all([
        api.get<MonthOverview>(`/analytics/month-overview?month=${month}`),
        api.get<PocketOverview>("/analytics/pocket"),
        api.get<CategorySpend[]>(spendUrl),
        api.get<GoalProgress[]>("/analytics/goals-progress"),
        api.get<Budget[]>(`/budgets?month=${month}`),
        api.get<Deposit[]>("/deposits"),
      ]);
      setOverview(ov);
      setPocket(pocketData);
      setSpend(sp);
      setGoals(gp);
      setBudgets(bu);
      setDeposits(dep.filter((d) => d.status === "active"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [month, spendCurrency]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (overview && overview.currencies.length === 1 && !spendCurrency) {
      setSpendCurrency(overview.currencies[0].currency_code);
    }
  }, [overview, spendCurrency]);

  const spendForPie = useMemo(() => {
    if (!spendCurrency) return spend;
    return spend.filter((s) => s.currency_code === spendCurrency);
  }, [spend, spendCurrency]);

  const currencyOptions = overview?.currencies.map((c) => c.currency_code) ?? [];

  async function toggleWidget(id: string) {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const next = widgets.includes(id)
        ? widgets.filter((w) => w !== id)
        : [...widgets, id];
      await api.patch<Settings>("/settings", { dashboard_widgets: next });
      await refreshSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save widget prefs");
    } finally {
      setSaving(false);
    }
  }

  async function updateWidgetView(widgetId: DashboardWidgetId, view: string) {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const next = {
        ...widgetViews,
        [widgetId]: view,
      };
      await api.patch<Settings>("/settings", { dashboard_widget_views: next });
      await refreshSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save widget view");
    } finally {
      setSaving(false);
    }
  }

  function viewPicker(widgetId: DashboardWidgetId) {
    return (
      <WidgetViewPicker
        widgetId={widgetId}
        value={resolveWidgetView(widgetId, widgetViews)}
        saving={saving}
        onChange={(view) => void updateWidgetView(widgetId, view)}
      />
    );
  }

  if (loading) {
    return <p className="muted">Loading dashboard…</p>;
  }

  const showPocket = widgets.includes("pocket");
  const showOverview = widgets.includes("overview");
  const showSpend = widgets.includes("spend_by_category");
  const showBudgets = widgets.includes("budgets");
  const showCategoryTable = widgets.includes("category_table");
  const showGoals = widgets.includes("goals");
  const showDeposits = widgets.includes("deposits");

  const overviewView = resolveWidgetView("overview", widgetViews);
  const spendView = resolveWidgetView("spend_by_category", widgetViews);
  const budgetsView = resolveWidgetView("budgets", widgetViews);
  const categoryView = resolveWidgetView("category_table", widgetViews);
  const goalsView = resolveWidgetView("goals", widgetViews);
  const depositsView = resolveWidgetView("deposits", widgetViews);

  const spendCurrencyFilter =
    currencyOptions.length > 1 ? (
      <label className="inline-filter">
        Currency
        <Select
          compact
          value={spendCurrency}
          onChange={(e) => setSpendCurrency(e.target.value)}
        >
          <option value="">All (separate)</option>
          {currencyOptions.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      </label>
    ) : null;

  const spendMenuOptions = dashboardCustomizing ? (
    <>
      {viewPicker("spend_by_category")}
      {spendCurrencyFilter}
    </>
  ) : undefined;

  return (
    <div className="stack">
      <ErrorBanner message={error} />

      <DashboardWidget
        title="My pocket"
        visible={showPocket}
        customizing={dashboardCustomizing}
        saving={saving}
        onToggleVisibility={() => void toggleWidget("pocket")}
      >
        {!pocket || pocket.currencies.length === 0 ? (
          <EmptyState
            title="No pocket yet"
            hint="Add transactions to track how much free cash you have over time."
          />
        ) : (
          <PocketView pocket={pocket} />
        )}
      </DashboardWidget>

      <DashboardWidget
        title="Month overview"
        visible={showOverview}
        customizing={dashboardCustomizing}
        saving={saving}
        onToggleVisibility={() => void toggleWidget("overview")}
        menuOptions={dashboardCustomizing ? viewPicker("overview") : undefined}
      >
        {!overview || overview.currencies.length === 0 ? (
          <EmptyState
            title="No activity this month"
            hint="Add transactions to see income and expenses."
          />
        ) : (
          <OverviewView view={overviewView} overview={overview} locale={locale} />
        )}
      </DashboardWidget>

      {showSpend || showBudgets || dashboardCustomizing ? (
        <div className="grid-2">
          <DashboardWidget
            title="Spend by category"
            visible={showSpend}
            customizing={dashboardCustomizing}
            saving={saving}
            onToggleVisibility={() => void toggleWidget("spend_by_category")}
            headerActions={!dashboardCustomizing ? spendCurrencyFilter : undefined}
            menuOptions={spendMenuOptions}
          >
            {spendForPie.length === 0 ? (
              <EmptyState
                title="No expenses this month"
                hint="Add transactions to see the breakdown."
              />
            ) : (
              <SpendCategoryView
                view={spendView}
                data={spendForPie}
                spendCurrency={spendCurrency}
                locale={locale}
                resolvedTheme={resolvedTheme}
              />
            )}
          </DashboardWidget>

          <DashboardWidget
            title="Budget progress"
            visible={showBudgets}
            customizing={dashboardCustomizing}
            saving={saving}
            onToggleVisibility={() => void toggleWidget("budgets")}
            menuOptions={dashboardCustomizing ? viewPicker("budgets") : undefined}
          >
            {budgets.length === 0 ? (
              <EmptyState
                title="No budgets set"
                hint="Set a standing monthly limit on the Budgets page."
              />
            ) : (
              <BudgetsView
                view={budgetsView}
                budgets={budgets}
                resolvedTheme={resolvedTheme}
              />
            )}
          </DashboardWidget>
        </div>
      ) : null}

      <DashboardWidget
        title="Category breakdown"
        visible={showCategoryTable}
        customizing={dashboardCustomizing}
        saving={saving}
        onToggleVisibility={() => void toggleWidget("category_table")}
        menuOptions={dashboardCustomizing ? viewPicker("category_table") : undefined}
      >
        {spend.length === 0 ? (
          <EmptyState title="No expenses this month" />
        ) : (
          <CategoryBreakdownView
            view={categoryView}
            spend={spend}
            resolvedTheme={resolvedTheme}
          />
        )}
      </DashboardWidget>

      <DashboardWidget
        title="Goals"
        visible={showGoals}
        customizing={dashboardCustomizing}
        saving={saving}
        onToggleVisibility={() => void toggleWidget("goals")}
        menuOptions={dashboardCustomizing ? viewPicker("goals") : undefined}
      >
        {goals.length === 0 ? (
          <EmptyState
            title="No savings goals yet"
            hint="Set a target on the Goals page."
          />
        ) : (
          <GoalsView view={goalsView} goals={goals} resolvedTheme={resolvedTheme} />
        )}
      </DashboardWidget>

      <DashboardWidget
        title="Deposits"
        visible={showDeposits}
        customizing={dashboardCustomizing}
        saving={saving}
        onToggleVisibility={() => void toggleWidget("deposits")}
        menuOptions={dashboardCustomizing ? viewPicker("deposits") : undefined}
      >
        {deposits.length === 0 ? (
          <EmptyState
            title="No active deposits"
            hint="Add a bank or rental deposit on the Deposits page."
          />
        ) : (
          <DepositsView
            view={depositsView}
            deposits={deposits}
            resolvedTheme={resolvedTheme}
          />
        )}
      </DashboardWidget>
    </div>
  );
}
