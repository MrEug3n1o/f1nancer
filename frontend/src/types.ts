import type {
  Budget,
  Category,
  CategorySpend,
  CategoryType,
  Cadence,
  CreditDebt,
  CreditDebtDirection,
  CreditDebtSource,
  CreditDebtStatus,
  CreditDebtSummaryItem,
  Currency,
  CurrencyMonthSplit,
  CurrencyOverview,
  Deposit,
  DepositStatus,
  DepositSummaryItem,
  DepositType,
  Goal,
  GoalProgress,
  GoalStatus,
  MoneyLocation,
  MoneyLocationCurrencyOverview,
  MoneyLocationOverview,
  MoneyLocationSplit,
  MonthOverview,
  PocketOverview,
  RecurringRule,
  Settings as DomainSettings,
  ThemeMode,
  Transaction,
  TrendPoint,
} from "@f1nancer/domain";

export type {
  Budget,
  Category,
  CategorySpend,
  CategoryType,
  Cadence,
  CreditDebt,
  CreditDebtDirection,
  CreditDebtSource,
  CreditDebtStatus,
  CreditDebtSummaryItem,
  Currency,
  CurrencyMonthSplit,
  CurrencyOverview,
  Deposit,
  DepositStatus,
  DepositSummaryItem,
  DepositType,
  Goal,
  GoalProgress,
  GoalStatus,
  MoneyLocation,
  MoneyLocationCurrencyOverview,
  MoneyLocationOverview,
  MoneyLocationSplit,
  MonthOverview,
  PocketOverview,
  RecurringRule,
  ThemeMode,
  Transaction,
  TrendPoint,
};

export interface CurrencyCatalogItem {
  code: string;
  name: string;
}

export interface DashboardWidgetLayoutItem {
  id: DashboardWidgetId;
  span: 1 | 2;
  col: 0 | 1;
}

export interface Settings extends Omit<DomainSettings, "dashboard_widget_layout"> {
  dashboard_widget_layout: DashboardWidgetLayoutItem[];
}

export const DASHBOARD_WIDGET_OPTIONS = [
  { id: "pocket", label: "My pocket" },
  { id: "overview", label: "Month overview" },
  { id: "money_location", label: "Cash & card flow" },
  { id: "spend_by_category", label: "Spend by category" },
  { id: "budgets", label: "Budget progress" },
  { id: "category_table", label: "Category breakdown table" },
  { id: "goals", label: "Goals" },
  { id: "deposits", label: "Bank" },
  { id: "credits_debts", label: "Credits & debts" },
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_OPTIONS)[number]["id"];

export const DEFAULT_WIDGET_VIEWS: Record<DashboardWidgetId, string> = {
  pocket: "hero",
  overview: "cards",
  money_location: "cards",
  spend_by_category: "donut",
  budgets: "bars",
  category_table: "table",
  goals: "rings",
  deposits: "rings",
  credits_debts: "rings",
};

export const WIDGET_VIEW_OPTIONS: Record<
  DashboardWidgetId,
  readonly { id: string; label: string }[]
> = {
  pocket: [{ id: "hero", label: "Hero card" }],
  overview: [
    { id: "cards", label: "Stat cards" },
    { id: "bar", label: "Vertical bars" },
    { id: "horizontal_bar", label: "Horizontal bars" },
    { id: "stacked", label: "Stacked bars" },
    { id: "area", label: "Area chart" },
    { id: "line", label: "Line chart" },
    { id: "pie", label: "Pie chart" },
    { id: "donut", label: "Donut chart" },
    { id: "radial", label: "Radial bars" },
    { id: "treemap", label: "Treemap" },
  ],
  money_location: [
    { id: "cards", label: "Stat cards" },
    { id: "bar", label: "Vertical bars" },
    { id: "horizontal_bar", label: "Horizontal bars" },
    { id: "stacked", label: "Stacked bars" },
  ],
  spend_by_category: [
    { id: "donut", label: "Donut chart" },
    { id: "pie", label: "Pie chart" },
    { id: "bar", label: "Horizontal bars" },
    { id: "bar_vertical", label: "Vertical bars" },
    { id: "radial", label: "Radial bars" },
    { id: "treemap", label: "Treemap" },
    { id: "area", label: "Area chart" },
    { id: "line", label: "Line chart" },
  ],
  budgets: [
    { id: "bars", label: "Progress bars" },
    { id: "bar_chart", label: "Horizontal bars" },
    { id: "bar_vertical", label: "Vertical bars" },
    { id: "stacked", label: "Stacked bars" },
    { id: "radial", label: "Radial bars" },
    { id: "pie", label: "Pie chart" },
    { id: "donut", label: "Donut chart" },
    { id: "table", label: "Table" },
  ],
  category_table: [
    { id: "table", label: "Table" },
    { id: "bar", label: "Horizontal bars" },
    { id: "bar_vertical", label: "Vertical bars" },
    { id: "pie", label: "Pie chart" },
    { id: "donut", label: "Donut chart" },
    { id: "radial", label: "Radial bars" },
    { id: "treemap", label: "Treemap" },
  ],
  goals: [
    { id: "rings", label: "Progress rings" },
    { id: "bars", label: "Progress bars" },
    { id: "bar_vertical", label: "Vertical bars" },
    { id: "pie", label: "Pie chart" },
    { id: "donut", label: "Donut chart" },
    { id: "radial", label: "Radial bars" },
    { id: "treemap", label: "Treemap" },
  ],
  deposits: [
    { id: "rings", label: "Progress rings" },
    { id: "bars", label: "Progress bars" },
    { id: "list", label: "List" },
    { id: "bar_chart", label: "Horizontal bars" },
    { id: "bar_vertical", label: "Vertical bars" },
    { id: "pie", label: "Pie chart" },
    { id: "donut", label: "Donut chart" },
    { id: "radial", label: "Radial bars" },
    { id: "treemap", label: "Treemap" },
  ],
  credits_debts: [
    { id: "rings", label: "Progress rings" },
    { id: "bars", label: "Progress bars" },
    { id: "list", label: "List" },
    { id: "bar_chart", label: "Horizontal bars" },
    { id: "bar_vertical", label: "Vertical bars" },
    { id: "pie", label: "Pie chart" },
    { id: "donut", label: "Donut chart" },
    { id: "radial", label: "Radial bars" },
    { id: "treemap", label: "Treemap" },
  ],
};

export function resolveWidgetView(
  widgetId: DashboardWidgetId,
  views: Record<string, string> | undefined,
): string {
  const saved = views?.[widgetId];
  if (saved && WIDGET_VIEW_OPTIONS[widgetId].some((o) => o.id === saved)) {
    return saved;
  }
  return DEFAULT_WIDGET_VIEWS[widgetId];
}

export const DEFAULT_WIDGET_LAYOUT: DashboardWidgetLayoutItem[] = [
  { id: "pocket", span: 2, col: 0 },
  { id: "overview", span: 1, col: 0 },
  { id: "money_location", span: 1, col: 1 },
  { id: "spend_by_category", span: 1, col: 0 },
  { id: "budgets", span: 1, col: 1 },
  { id: "category_table", span: 2, col: 0 },
  { id: "goals", span: 2, col: 0 },
  { id: "deposits", span: 2, col: 0 },
  { id: "credits_debts", span: 2, col: 0 },
];

const WIDGET_ID_SET = new Set<string>(
  DASHBOARD_WIDGET_OPTIONS.map((option) => option.id),
);

export function resolveWidgetLayout(
  layout: DashboardWidgetLayoutItem[] | undefined,
): DashboardWidgetLayoutItem[] {
  const seen = new Set<string>();
  const result: DashboardWidgetLayoutItem[] = [];
  let pendingHalf: DashboardWidgetLayoutItem | null = null;
  for (const item of layout ?? []) {
    if (!WIDGET_ID_SET.has(item.id) || seen.has(item.id)) continue;
    const span: 1 | 2 = item.span === 1 ? 1 : 2;
    const hasCol = item.col === 0 || item.col === 1;
    const next: DashboardWidgetLayoutItem = {
      id: item.id,
      span,
      col: span === 2 ? 0 : hasCol ? item.col : 0,
    };
    if (span === 1 && !hasCol) {
      if (pendingHalf) {
        pendingHalf.col = 0;
        result.push(pendingHalf);
        next.col = 1;
        result.push(next);
        pendingHalf = null;
      } else {
        pendingHalf = next;
      }
    } else {
      if (pendingHalf) {
        result.push(pendingHalf);
        pendingHalf = null;
      }
      result.push(next);
    }
    seen.add(item.id);
  }
  if (pendingHalf) result.push(pendingHalf);
  for (const fallback of DEFAULT_WIDGET_LAYOUT) {
    if (!seen.has(fallback.id)) result.push(fallback);
  }
  return result;
}
