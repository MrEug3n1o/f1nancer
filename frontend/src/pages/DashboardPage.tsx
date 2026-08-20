import { useCallback, useEffect, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { api } from "../api";
import { EmptyState, ErrorBanner, Money, ProgressBar } from "../components/ui";
import { useApp } from "../context";
import type { Budget, CategorySpend, GoalProgress, MonthOverview } from "../types";

const GOAL_COLORS = [
  "#2f6b4f",
  "#4a8f6a",
  "#c4a35a",
  "#5b7c99",
  "#a65d57",
  "#7a6b8a",
];

export function DashboardPage() {
  const { month } = useApp();
  const [overview, setOverview] = useState<MonthOverview | null>(null);
  const [spend, setSpend] = useState<CategorySpend[]>([]);
  const [goals, setGoals] = useState<GoalProgress[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, sp, gp, bu] = await Promise.all([
        api.get<MonthOverview>(`/analytics/month-overview?month=${month}`),
        api.get<CategorySpend[]>(`/analytics/spend-by-category?month=${month}`),
        api.get<GoalProgress[]>("/analytics/goals-progress"),
        api.get<Budget[]>(`/budgets?month=${month}`),
      ]);
      setOverview(ov);
      setSpend(sp);
      setGoals(gp);
      setBudgets(bu);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="muted">Loading dashboard…</p>;
  }

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      <section className="section">
        <h2>Month overview</h2>
        {overview ? (
          <div className="stat-row">
            <div className="stat">
              <span className="stat-label">Income</span>
              <span className="stat-value income">
                <Money cents={overview.income_cents} />
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Expenses</span>
              <span className="stat-value expense">
                <Money cents={overview.expense_cents} />
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Net</span>
              <span
                className={`stat-value ${overview.net_cents >= 0 ? "income" : "expense"}`}
              >
                <Money cents={overview.net_cents} />
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <div className="grid-2">
        <section className="section">
          <h2>Spend by category</h2>
          {spend.length === 0 ? (
            <EmptyState
              title="No expenses this month"
              hint="Add transactions to see the breakdown."
            />
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={spend}
                    dataKey="total_cents"
                    nameKey="category_name"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {spend.map((s) => (
                      <Cell key={s.category_id} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) =>
                      typeof value === "number"
                        ? [(value / 100).toFixed(2), "Amount"]
                        : [value, "Amount"]
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="legend">
                {spend.map((s) => (
                  <li key={s.category_id}>
                    <span
                      className="swatch"
                      style={{ background: s.color }}
                    />
                    {s.category_name} — <Money cents={s.total_cents} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

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
                    <span>{b.category?.name ?? "Category"}</span>
                    <span className="muted">
                      <Money cents={b.spent_cents} /> /{" "}
                      <Money cents={b.limit_cents} />
                    </span>
                  </div>
                  <ProgressBar
                    value={b.spent_cents}
                    max={b.limit_cents}
                    color={b.category?.color}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

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
              const color = GOAL_COLORS[i % GOAL_COLORS.length];
              const remaining = Math.max(g.target_amount - g.current_amount, 0);
              const pieData = [
                { name: "Saved", value: g.current_amount, fill: color },
                { name: "Remaining", value: remaining, fill: "var(--line)" },
              ].filter((d) => d.value > 0);

              // Empty progress still needs a full ring
              if (pieData.length === 0) {
                pieData.push({
                  name: "Remaining",
                  value: 1,
                  fill: "var(--line)",
                });
              }

              return (
                <div key={g.id} className="goal-pie">
                  <div className="chart-wrap goal-pie-chart">
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={40}
                          outerRadius={62}
                          paddingAngle={pieData.length > 1 ? 2 : 0}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {pieData.map((d) => (
                            <Cell key={d.name} fill={d.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            typeof value === "number"
                              ? [(value / 100).toFixed(2), "Amount"]
                              : [value, "Amount"]
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="goal-pie-center" aria-hidden>
                      {g.progress_pct}%
                    </div>
                  </div>
                  <div className="goal-pie-meta">
                    <strong>{g.name}</strong>
                    <span className="muted">
                      <Money cents={g.current_amount} /> /{" "}
                      <Money cents={g.target_amount} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
