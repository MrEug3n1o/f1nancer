import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { packRows, parseSlotId, placeInSlot, slotId } from "../dashboardLayout";
import {
  BudgetsView,
  CategoryBreakdownView,
  CreditsDebtsView,
  DepositsView,
  GoalsView,
  MoneyLocationView,
  OverviewView,
  PocketView,
  SpendCategoryView,
} from "../components/dashboardViews";
import {
  DashboardLayoutRow,
  DashboardWidget,
  MovableDashboardWidget,
  placementLabel,
} from "../components/DashboardWidget";
import { EmptyState, ErrorBanner, Select } from "../components/ui";
import { WidgetViewPicker } from "../components/WidgetViewPicker";
import { useApp } from "../context";
import type {
  Budget,
  CategorySpend,
  CreditDebt,
  DashboardWidgetLayoutItem,
  Deposit,
  GoalProgress,
  MoneyLocationOverview,
  MonthOverview,
  PocketOverview,
  Settings,
} from "../types";
import {
  resolveWidgetLayout,
  resolveWidgetView,
  type DashboardWidgetId,
} from "../types";

const DEFAULT_WIDGETS = [
  "pocket",
  "overview",
  "money_location",
  "spend_by_category",
  "budgets",
  "goals",
  "deposits",
  "credits_debts",
];

const WIDGET_TITLES: Record<DashboardWidgetId, string> = {
  pocket: "My pocket",
  overview: "Month overview",
  money_location: "Cash & card flow",
  spend_by_category: "Spend by category",
  budgets: "Budget progress",
  category_table: "Category breakdown",
  goals: "Goals",
  deposits: "Bank",
  credits_debts: "Credits & debts",
};

type CustomizeDraft = {
  layout: DashboardWidgetLayoutItem[];
  widgets: string[];
  views: Record<string, string>;
};

const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  return rectIntersection(args);
};

export function DashboardPage() {
  const {
    month,
    settings,
    locale,
    refreshSettings,
    dashboardCustomizing,
    registerDashboardCustomize,
    resolvedTheme,
  } = useApp();
  const savedWidgets = settings?.dashboard_widgets ?? DEFAULT_WIDGETS;
  const savedViews = settings?.dashboard_widget_views ?? {};
  const savedLayout = useMemo(
    () => resolveWidgetLayout(settings?.dashboard_widget_layout),
    [settings?.dashboard_widget_layout],
  );
  const [draft, setDraft] = useState<CustomizeDraft | null>(null);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const widgets = draft?.widgets ?? savedWidgets;
  const widgetViews = draft?.views ?? savedViews;
  const layout = draft?.layout ?? savedLayout;
  const [overview, setOverview] = useState<MonthOverview | null>(null);
  const [pocket, setPocket] = useState<PocketOverview | null>(null);
  const [moneyLocation, setMoneyLocation] = useState<MoneyLocationOverview | null>(null);
  const [spend, setSpend] = useState<CategorySpend[]>([]);
  const [goals, setGoals] = useState<GoalProgress[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [rentalDeposits, setRentalDeposits] = useState<Deposit[]>([]);
  const [creditDebts, setCreditDebts] = useState<CreditDebt[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spendCurrency, setSpendCurrency] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const spendUrl = spendCurrency
        ? `/analytics/spend-by-category?month=${month}&currency=${spendCurrency}`
        : `/analytics/spend-by-category?month=${month}`;
      const [ov, pocketData, ml, sp, gp, bu, dep, rentals, cd] = await Promise.all([
        api.get<MonthOverview>(`/analytics/month-overview?month=${month}`),
        api.get<PocketOverview>("/analytics/pocket"),
        api.get<MoneyLocationOverview>(
          `/analytics/money-location-overview?month=${month}`,
        ),
        api.get<CategorySpend[]>(spendUrl),
        api.get<GoalProgress[]>("/analytics/goals-progress"),
        api.get<Budget[]>(`/budgets?month=${month}`),
        api.get<Deposit[]>("/deposits?type=bank"),
        api.get<Deposit[]>("/deposits?type=rental"),
        api.get<CreditDebt[]>("/credits-debts?source=informal"),
      ]);
      setOverview(ov);
      setPocket(pocketData);
      setMoneyLocation(ml);
      setSpend(sp);
      setGoals(gp);
      setBudgets(bu);
      setDeposits(dep.filter((d) => d.status === "active"));
      setRentalDeposits(rentals.filter((d) => d.status === "active"));
      setCreditDebts(cd.filter((item) => item.status === "active"));
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

  useEffect(() => {
    if (!dashboardCustomizing) {
      setDraft(null);
      setActiveId(null);
      setOverId(null);
      return;
    }
    setDraft((current) =>
      current ?? {
        layout: savedLayout,
        widgets: [...savedWidgets],
        views: { ...savedViews },
      },
    );
  }, [dashboardCustomizing, savedLayout, savedWidgets, savedViews]);

  const saveDraft = useCallback(async () => {
    if (!settings) return;
    const current = draftRef.current;
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch<Settings>("/settings", {
        dashboard_widgets: current.widgets,
        dashboard_widget_views: current.views,
        dashboard_widget_layout: current.layout,
      });
      await refreshSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save dashboard");
      throw e;
    } finally {
      setSaving(false);
    }
  }, [refreshSettings, settings]);

  useEffect(() => {
    if (!dashboardCustomizing) {
      registerDashboardCustomize(null);
      return;
    }
    registerDashboardCustomize({
      saving,
      onDone: saveDraft,
      onCancel: () => {
        setDraft(null);
        setActiveId(null);
        setOverId(null);
      },
    });
    return () => registerDashboardCustomize(null);
  }, [dashboardCustomizing, registerDashboardCustomize, saveDraft, saving]);

  const spendForPie = useMemo(() => {
    if (!spendCurrency) return spend;
    return spend.filter((s) => s.currency_code === spendCurrency);
  }, [spend, spendCurrency]);

  const currencyOptions = overview?.currencies.map((c) => c.currency_code) ?? [];

  function toggleWidget(id: string) {
    setDraft((current) => {
      const base = current ?? {
        layout: savedLayout,
        widgets: [...savedWidgets],
        views: { ...savedViews },
      };
      const nextWidgets = base.widgets.includes(id)
        ? base.widgets.filter((w) => w !== id)
        : [...base.widgets, id];
      return { ...base, widgets: nextWidgets };
    });
  }

  function updateWidgetView(widgetId: DashboardWidgetId, view: string) {
    setDraft((current) => {
      const base = current ?? {
        layout: savedLayout,
        widgets: [...savedWidgets],
        views: { ...savedViews },
      };
      return { ...base, views: { ...base.views, [widgetId]: view } };
    });
  }

  function updateLayout(next: DashboardWidgetLayoutItem[]) {
    setDraft((current) => {
      const base = current ?? {
        layout: savedLayout,
        widgets: [...savedWidgets],
        views: { ...savedViews },
      };
      return { ...base, layout: next };
    });
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragOver(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null);
  }

  function onDragEnd(event: DragEndEvent) {
    const draggedId = String(event.active.id);
    const dropId = event.over ? String(event.over.id) : null;
    setActiveId(null);
    setOverId(null);
    if (!dropId) return;
    const slot = parseSlotId(dropId);
    if (slot) {
      updateLayout(placeInSlot(layout, draggedId as DashboardWidgetId, slot));
    }
  }

  function viewPicker(widgetId: DashboardWidgetId) {
    return (
      <WidgetViewPicker
        widgetId={widgetId}
        value={resolveWidgetView(widgetId, widgetViews)}
        saving={saving}
        onChange={(view) => updateWidgetView(widgetId, view)}
      />
    );
  }

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

  function widgetBody(id: DashboardWidgetId): ReactNode {
    switch (id) {
      case "pocket":
        return !pocket || pocket.currencies.length === 0 ? (
          <EmptyState
            title="No pocket yet"
            hint="Add transactions to track how much free cash you have over time."
          />
        ) : (
          <PocketView pocket={pocket} />
        );
      case "overview":
        return !overview || overview.currencies.length === 0 ? (
          <EmptyState
            title="No activity this month"
            hint="Add transactions to see income and expenses."
          />
        ) : (
          <OverviewView
            view={resolveWidgetView("overview", widgetViews)}
            overview={overview}
            locale={locale}
          />
        );
      case "money_location":
        return !moneyLocation || moneyLocation.currencies.length === 0 ? (
          <EmptyState
            title="No cash or card flow this month"
            hint="Tag income and expenses as cash or card to see the split."
          />
        ) : (
          <MoneyLocationView
            view={resolveWidgetView("money_location", widgetViews)}
            overview={moneyLocation}
            locale={locale}
          />
        );
      case "spend_by_category":
        return spendForPie.length === 0 ? (
          <EmptyState
            title="No expenses this month"
            hint="Add transactions to see the breakdown."
          />
        ) : (
          <SpendCategoryView
            view={resolveWidgetView("spend_by_category", widgetViews)}
            data={spendForPie}
            spendCurrency={spendCurrency}
            locale={locale}
            resolvedTheme={resolvedTheme}
          />
        );
      case "budgets":
        return budgets.length === 0 ? (
          <EmptyState
            title="No budgets set"
            hint="Set a standing monthly limit on the Budgets page."
          />
        ) : (
          <BudgetsView
            view={resolveWidgetView("budgets", widgetViews)}
            budgets={budgets}
            resolvedTheme={resolvedTheme}
          />
        );
      case "category_table":
        return spend.length === 0 ? (
          <EmptyState title="No expenses this month" />
        ) : (
          <CategoryBreakdownView
            view={resolveWidgetView("category_table", widgetViews)}
            spend={spend}
            resolvedTheme={resolvedTheme}
          />
        );
      case "goals":
        return goals.length === 0 ? (
          <EmptyState
            title="No savings goals yet"
            hint="Set a target on the Goals page."
          />
        ) : (
          <GoalsView
            view={resolveWidgetView("goals", widgetViews)}
            goals={goals}
            resolvedTheme={resolvedTheme}
          />
        );
      case "deposits":
        return deposits.length === 0 ? (
          <EmptyState
            title="No active bank deposits"
            hint="Add a term deposit on the Bank page."
          />
        ) : (
          <DepositsView
            view={resolveWidgetView("deposits", widgetViews)}
            deposits={deposits}
            resolvedTheme={resolvedTheme}
          />
        );
      case "credits_debts":
        return creditDebts.length === 0 && rentalDeposits.length === 0 ? (
          <EmptyState
            title="No active credits or debts"
            hint="Track informal IOUs and rental deposits on the Credits & Debts page."
          />
        ) : (
          <>
            {creditDebts.length > 0 ? (
              <CreditsDebtsView
                view={resolveWidgetView("credits_debts", widgetViews)}
                items={creditDebts}
                resolvedTheme={resolvedTheme}
              />
            ) : null}
            {rentalDeposits.length > 0 ? (
              <DepositsView
                view={resolveWidgetView("credits_debts", widgetViews)}
                deposits={rentalDeposits}
                resolvedTheme={resolvedTheme}
              />
            ) : null}
          </>
        );
    }
  }

  function widgetMenuOptions(id: DashboardWidgetId): ReactNode {
    if (!dashboardCustomizing) return undefined;
    if (id === "spend_by_category") {
      return (
        <>
          {viewPicker(id)}
          {spendCurrencyFilter}
        </>
      );
    }
    if (id === "pocket") return undefined;
    return viewPicker(id);
  }

  const visibleSet = useMemo(() => new Set(widgets), [widgets]);
  const displayed = dashboardCustomizing
    ? layout
    : layout.filter((item) => visibleSet.has(item.id));
  const rows = packRows(displayed);

  function widgetProps(item: DashboardWidgetLayoutItem, rowIndex: number, inRow = false) {
    const headerActions =
      item.id === "spend_by_category" && !dashboardCustomizing
        ? spendCurrencyFilter
        : undefined;
    return {
      title: WIDGET_TITLES[item.id],
      visible: visibleSet.has(item.id),
      customizing: dashboardCustomizing,
      saving,
      span: item.span,
      col: item.col,
      gridRow: inRow ? undefined : rowIndex + 1,
      onToggleVisibility: () => toggleWidget(item.id),
      headerActions,
      menuOptions: widgetMenuOptions(item.id),
      children: widgetBody(item.id),
    };
  }

  if (loading) {
    return <p className="muted">Loading dashboard…</p>;
  }

  const overTarget = overId ? parseSlotId(overId) : null;
  const previewKind = !overTarget ? "moving" : overTarget.span === 2 ? "full" : "half";

  const grid = dashboardCustomizing ? (
    <div className={`dashboard-grid customizing${activeId ? " dragging" : ""}`}>
      {rows.map((row) => (
        <DashboardLayoutRow
          key={`row-${row.index}`}
          fullSlotId={slotId(row.index, "full")}
          leftSlotId={slotId(row.index, 0)}
          rightSlotId={slotId(row.index, 1)}
          leftOccupied={Boolean(row.full || row.left)}
          rightOccupied={Boolean(row.full || row.right)}
          splitExisting={
            overTarget &&
            overTarget.span === 1 &&
            overTarget.rowIndex === row.index &&
            row.full
              ? overTarget.col === 1
                ? 0
                : 1
              : null
          }
        >
          {row.full ? (
            <MovableDashboardWidget
              id={row.full.id}
              {...widgetProps(row.full, row.index, true)}
            />
          ) : (
            <>
              {row.left ? (
                <MovableDashboardWidget
                  id={row.left.id}
                  {...widgetProps(row.left, row.index, true)}
                />
              ) : null}
              {row.right ? (
                <MovableDashboardWidget
                  id={row.right.id}
                  {...widgetProps(row.right, row.index, true)}
                />
              ) : null}
            </>
          )}
        </DashboardLayoutRow>
      ))}
      {activeId ? (
        <DashboardLayoutRow
          key={`row-${rows.length}`}
          fullSlotId={slotId(rows.length, "full")}
          leftSlotId={slotId(rows.length, 0)}
          rightSlotId={slotId(rows.length, 1)}
          leftOccupied={false}
          rightOccupied={false}
        />
      ) : null}
    </div>
  ) : (
    <div className="dashboard-grid">
      {rows.flatMap((row) => {
        const nodes: ReactNode[] = [];
        if (row.full) {
          nodes.push(
            <DashboardWidget key={row.full.id} {...widgetProps(row.full, row.index)} />,
          );
          return nodes;
        }
        if (row.left) {
          nodes.push(
            <DashboardWidget key={row.left.id} {...widgetProps(row.left, row.index)} />,
          );
        }
        if (row.right) {
          nodes.push(
            <DashboardWidget key={row.right.id} {...widgetProps(row.right, row.index)} />,
          );
        }
        return nodes;
      })}
    </div>
  );

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      {dashboardCustomizing ? (
        <p className="muted small dashboard-place-hint">
          Drop on the left or right of a row. Drop between rows for full width.
        </p>
      ) : null}
      {dashboardCustomizing ? (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setOverId(null);
          }}
        >
          {grid}
          <DragOverlay>
            {activeId ? (
              <div
                className={`section widget-section widget-drag-overlay widget-drag-preview-${previewKind}`}
              >
                <h2>{WIDGET_TITLES[activeId as DashboardWidgetId] ?? "Widget"}</h2>
                <p className="muted small">{placementLabel(overTarget)}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        grid
      )}
    </div>
  );
}
