import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { api } from "../api";
import { EmptyState, ErrorBanner, Money, ProgressBar, Select } from "../components/ui";
import { DepositAccrualRing } from "../components/DepositCard";
import { useApp } from "../context";
import type {
  Budget,
  CategorySpend,
  Deposit,
  GoalProgress,
  MonthOverview,
  Settings,
} from "../types";
import { DASHBOARD_WIDGET_OPTIONS } from "../types";
import { chartFill, formatMoney } from "../utils";

const GOAL_COLORS = [
  "#2f6b4f",
  "#4a8f6a",
  "#c4a35a",
  "#5b7c99",
  "#a65d57",
  "#7a6b8a",
];

const CHART_TOOLTIP_STYLE = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  color: "var(--ink)",
  boxShadow: "var(--shadow)",
};

function GoalProgressRing({
  percent,
  color,
  size = 148,
}: {
  percent: number;
  color: string;
  size?: number;
}) {
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, percent));
  const dash = (pct / 100) * c;

  return (
    <div className="goal-pie-chart" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="goal-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        {pct > 0 ? (
          <circle
            className="goal-ring-progress"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap={pct > 0 && pct < 100 ? "round" : "butt"}
            strokeDasharray={`${dash} ${c - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </svg>
      <div className="goal-pie-center" aria-hidden>
        {Math.round(pct)}%
      </div>
    </div>
  );
}

const DEFAULT_WIDGETS = [
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
  const [overview, setOverview] = useState<MonthOverview | null>(null);
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
      const [ov, sp, gp, bu, dep] = await Promise.all([
        api.get<MonthOverview>(`/analytics/month-overview?month=${month}`),
        api.get<CategorySpend[]>(spendUrl),
        api.get<GoalProgress[]>("/analytics/goals-progress"),
        api.get<Budget[]>(`/budgets?month=${month}`),
        api.get<Deposit[]>("/deposits"),
      ]);
      setOverview(ov);
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

  if (loading) {
    return <p className="muted">Loading dashboard…</p>;
  }

  const showOverview = widgets.includes("overview");
  const showSpend = widgets.includes("spend_by_category");
  const showBudgets = widgets.includes("budgets");
  const showCategoryTable = widgets.includes("category_table");
  const showGoals = widgets.includes("goals");
  const showDeposits = widgets.includes("deposits");

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      {dashboardCustomizing ? (
        <section className="section">
          <h2>Customize widgets</h2>
          <ul className="checkbox-list">
            {DASHBOARD_WIDGET_OPTIONS.map((opt) => (
              <li key={opt.id}>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={widgets.includes(opt.id)}
                    disabled={saving}
                    onChange={() => void toggleWidget(opt.id)}
                  />
                  {opt.label}
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showOverview ? (
        <section className="section">
          <h2>Month overview</h2>
          {!overview || overview.currencies.length === 0 ? (
            <EmptyState
              title="No activity this month"
              hint="Add transactions to see income and expenses."
            />
          ) : (
            <div className="currency-overview-stack">
              {overview.currencies.map((c) => (
                <div key={c.currency_code} className="currency-overview-block">
                  <h3 className="currency-heading">{c.currency_code}</h3>
                  <div className="stat-row">
                    <div className="stat">
                      <span className="stat-label">Income</span>
                      <span className="stat-value income">
                        <Money cents={c.income_cents} currency={c.currency_code} />
                      </span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Expenses</span>
                      <span className="stat-value expense">
                        <Money cents={c.expense_cents} currency={c.currency_code} />
                      </span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Net</span>
                      <span
                        className={`stat-value ${c.net_cents >= 0 ? "income" : "expense"}`}
                      >
                        <Money cents={c.net_cents} currency={c.currency_code} />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showSpend || showBudgets ? (
        <div className="grid-2">
          {showSpend ? (
            <section className="section">
              <div className="row-between">
                <h2>Spend by category</h2>
                {currencyOptions.length > 1 ? (
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
                ) : null}
              </div>
              {spendForPie.length === 0 ? (
                <EmptyState
                  title="No expenses this month"
                  hint="Add transactions to see the breakdown."
                />
              ) : (
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={spendForPie}
                        dataKey="total_cents"
                        nameKey="category_name"
                        innerRadius={58}
                        outerRadius={96}
                        paddingAngle={spendForPie.length > 1 ? 3 : 0}
                        stroke="none"
                        cornerRadius={spendForPie.length > 1 ? 6 : 0}
                      >
                        {spendForPie.map((s) => (
                          <Cell
                            key={`${s.category_id}-${s.currency_code}`}
                            fill={chartFill(s.color, resolvedTheme)}
                            stroke="none"
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        itemStyle={{ color: "var(--ink)" }}
                        formatter={(value, _name, item) => {
                          const code =
                            (item?.payload as CategorySpend | undefined)
                              ?.currency_code ?? "USD";
                          return typeof value === "number"
                            ? [
                                formatMoney(value, code, locale || undefined),
                                "Amount",
                              ]
                            : [value, "Amount"];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="legend">
                    {spendForPie.map((s) => (
                      <li key={`${s.category_id}-${s.currency_code}`}>
                        <span
                          className="swatch"
                          style={{
                            background: chartFill(s.color, resolvedTheme),
                          }}
                        />
                        {s.category_name}
                        {!spendCurrency ? ` (${s.currency_code})` : ""} —{" "}
                        <Money cents={s.total_cents} currency={s.currency_code} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ) : null}

          {showBudgets ? (
            <section className="section">
              <h2>Budget progress</h2>
              {budgets.length === 0 ? (
                <EmptyState
                  title="No budgets set"
                  hint="Create monthly limits on the Budgets page."
                />
              ) : (
                <ul className="progress-list">
                  {budgets.map((b) => (
                    <li key={b.id}>
                      <div className="row-between">
                        <span>
                          {b.category?.name ?? "Category"}{" "}
                          <span className="muted small">({b.currency_code})</span>
                        </span>
                        <span className="muted">
                          <Money cents={b.spent_cents} currency={b.currency_code} /> /{" "}
                          <Money cents={b.limit_cents} currency={b.currency_code} />
                        </span>
                      </div>
                      <ProgressBar
                        value={b.spent_cents}
                        max={b.limit_cents}
                        color={
                          b.category?.color
                            ? chartFill(b.category.color, resolvedTheme)
                            : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      ) : null}

      {showCategoryTable ? (
        <section className="section">
          <h2>Category breakdown</h2>
          {spend.length === 0 ? (
            <EmptyState title="No expenses this month" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Currency</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...spend]
                  .sort((a, b) => b.total_cents - a.total_cents)
                  .map((s) => (
                    <tr key={`${s.category_id}-${s.currency_code}`}>
                      <td>
                        <span
                          className="swatch inline"
                          style={{
                            background: chartFill(s.color, resolvedTheme),
                          }}
                        />
                        {s.category_name}
                      </td>
                      <td>{s.currency_code}</td>
                      <td className="num">
                        <Money cents={s.total_cents} currency={s.currency_code} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {showGoals ? (
        <section className="section">
          <h2>Goals</h2>
          {goals.length === 0 ? (
            <EmptyState
              title="No savings goals yet"
              hint="Set a target on the Goals page."
            />
          ) : (
            <div className="goal-pies">
              {goals.map((g, i) => {
                const color = chartFill(
                  GOAL_COLORS[i % GOAL_COLORS.length],
                  resolvedTheme,
                );
                return (
                  <div key={g.id} className="goal-pie">
                    <GoalProgressRing percent={g.progress_pct} color={color} />
                    <div className="goal-pie-meta">
                      <strong>{g.name}</strong>
                      <span className="muted">
                        <Money
                          cents={g.current_amount}
                          currency={g.currency_code}
                        />{" "}
                        /{" "}
                        <Money
                          cents={g.target_amount}
                          currency={g.currency_code}
                        />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {showDeposits ? (
        <section className="section">
          <h2>Deposits</h2>
          {deposits.length === 0 ? (
            <EmptyState
              title="No active deposits"
              hint="Add a bank or rental deposit on the Deposits page."
            />
          ) : (
            <div className="goal-pies">
              {deposits.map((d) => {
                const accrued =
                  d.type === "bank" ? d.accrued_interest_cents : 0;
                return (
                  <div key={d.id} className="goal-pie">
                    <DepositAccrualRing
                      progressPct={d.term_progress_pct}
                      accruedCents={accrued}
                      currency={d.currency_code}
                      size={160}
                    />
                    <div className="goal-pie-meta">
                      <strong>{d.name}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
