import { DepositAccrualRing } from "./DepositCard";
import {
  ChartLegend,
  ColoredPie,
  ColoredTreemap,
  GroupedVerticalBarChart,
  HorizontalBarChart,
  HorizontalGroupedBarChart,
  LineAreaChart,
  RadialChart,
  StackedVerticalBarChart,
  VerticalBarChart,
  type ChartRow,
} from "./dashboardCharts";
import { Money, ProgressBar } from "./ui";
import type {
  Budget,
  CategorySpend,
  CreditDebt,
  CurrencyOverview,
  Deposit,
  GoalProgress,
  MoneyLocationOverview,
  MonthOverview,
  PocketOverview,
} from "../types";
import { chartFill } from "../utils";

const GOAL_COLORS = [
  "#2f6b4f",
  "#4a8f6a",
  "#c4a35a",
  "#5b7c99",
  "#a65d57",
  "#7a6b8a",
];

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

function spendRows(
  data: CategorySpend[],
  spendCurrency: string,
  resolvedTheme: "light" | "dark",
): ChartRow[] {
  return [...data]
    .sort((a, b) => b.total_cents - a.total_cents)
    .map((s) => ({
      name: spendCurrency ? s.category_name : `${s.category_name} (${s.currency_code})`,
      value: s.total_cents,
      color: chartFill(s.color, resolvedTheme),
      currency_code: s.currency_code,
    }));
}

function SpendLegend({
  data,
  spendCurrency,
  resolvedTheme,
}: {
  data: CategorySpend[];
  spendCurrency: string;
  resolvedTheme: "light" | "dark";
}) {
  return (
    <ul className="legend">
      {data.map((s) => (
        <li key={`${s.category_id}-${s.currency_code}`}>
          <span
            className="swatch"
            style={{ background: chartFill(s.color, resolvedTheme) }}
          />
          {s.category_name}
          {!spendCurrency ? ` (${s.currency_code})` : ""} —{" "}
          <Money cents={s.total_cents} currency={s.currency_code} />
        </li>
      ))}
    </ul>
  );
}

export function OverviewView({
  view,
  overview,
  locale,
}: {
  view: string;
  overview: MonthOverview;
  locale?: string;
}) {
  const currency = overview.currencies[0]?.currency_code ?? "USD";
  const chartData = overview.currencies.map((c) => ({
    name: c.currency_code,
    income: c.income_cents,
    expense: c.expense_cents,
    net: c.net_cents,
  }));

  if (view === "bar") {
    return (
      <GroupedVerticalBarChart
        data={chartData}
        keys={[
          { key: "income", fill: "var(--income)", name: "Income" },
          { key: "expense", fill: "var(--expense)", name: "Expenses" },
          { key: "net", fill: "var(--accent)", name: "Net" },
        ]}
        currency={currency}
        locale={locale}
      />
    );
  }

  if (view === "stacked") {
    return (
      <StackedVerticalBarChart
        data={chartData}
        keys={[
          { key: "income", fill: "var(--income)", name: "Income" },
          { key: "expense", fill: "var(--expense)", name: "Expenses" },
        ]}
        currency={currency}
        locale={locale}
      />
    );
  }

  if (view === "horizontal_bar") {
    return (
      <HorizontalGroupedBarChart
        data={chartData}
        keys={[
          { key: "income", fill: "var(--income)", name: "Income" },
          { key: "expense", fill: "var(--expense)", name: "Expenses" },
          { key: "net", fill: "var(--accent)", name: "Net" },
        ]}
        currency={currency}
        locale={locale}
      />
    );
  }

  if (view === "area" || view === "line") {
    return (
      <LineAreaChart
        mode={view}
        data={chartData}
        keys={[
          { key: "income", fill: "var(--income)", name: "Income" },
          { key: "expense", fill: "var(--expense)", name: "Expenses" },
          { key: "net", fill: "var(--accent)", name: "Net" },
        ]}
        currency={currency}
        locale={locale}
      />
    );
  }

  if (view === "pie" || view === "donut") {
    const rows: ChartRow[] = overview.currencies.flatMap((c) => [
      {
        name: `${c.currency_code} income`,
        value: c.income_cents,
        color: "var(--income)",
        currency_code: c.currency_code,
      },
      {
        name: `${c.currency_code} expenses`,
        value: c.expense_cents,
        color: "var(--expense)",
        currency_code: c.currency_code,
      },
    ]);
    return (
      <>
        <ColoredPie
          data={rows}
          innerRadius={view === "donut" ? 52 : 0}
          locale={locale}
        />
        <ChartLegend items={rows} />
      </>
    );
  }

  if (view === "radial") {
    const rows: ChartRow[] = overview.currencies.map((c, i) => ({
      name: c.currency_code,
      value: Math.max(c.income_cents, c.expense_cents, 1),
      color: GOAL_COLORS[i % GOAL_COLORS.length],
      currency_code: c.currency_code,
    }));
    return <RadialChart data={rows} />;
  }

  if (view === "treemap") {
    const rows: ChartRow[] = overview.currencies.map((c, i) => ({
      name: c.currency_code,
      value: c.expense_cents + c.income_cents,
      color: GOAL_COLORS[i % GOAL_COLORS.length],
      currency_code: c.currency_code,
    }));
    return <ColoredTreemap data={rows} />;
  }

  return (
    <div className="currency-overview-stack">
      {overview.currencies.map((c: CurrencyOverview) => (
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
  );
}

export function SpendCategoryView({
  view,
  data,
  spendCurrency,
  locale,
  resolvedTheme,
}: {
  view: string;
  data: CategorySpend[];
  spendCurrency: string;
  locale: string;
  resolvedTheme: "light" | "dark";
}) {
  const rows = spendRows(data, spendCurrency, resolvedTheme);
  const currency = rows[0]?.currency_code ?? "USD";

  if (view === "bar") {
    return (
      <HorizontalBarChart
        data={rows}
        locale={locale}
        currency={currency}
      />
    );
  }

  if (view === "bar_vertical") {
    return (
      <VerticalBarChart
        data={rows}
        locale={locale}
        currency={currency}
      />
    );
  }

  if (view === "radial") {
    return <RadialChart data={rows} />;
  }

  if (view === "treemap") {
    return <ColoredTreemap data={rows} />;
  }

  if (view === "area" || view === "line") {
    return (
      <LineAreaChart
        mode={view}
        data={rows.map((r) => ({ name: r.name, value: r.value }))}
        keys={[{ key: "value", fill: "var(--accent)", name: "Spend" }]}
        currency={currency}
        locale={locale}
      />
    );
  }

  if (view === "pie" || view === "donut") {
    return (
      <>
        <ColoredPie
          data={rows}
          innerRadius={view === "donut" ? 58 : 0}
          locale={locale}
        />
        <SpendLegend
          data={data}
          spendCurrency={spendCurrency}
          resolvedTheme={resolvedTheme}
        />
      </>
    );
  }

  return (
    <>
      <ColoredPie data={rows} innerRadius={58} locale={locale} />
      <SpendLegend
        data={data}
        spendCurrency={spendCurrency}
        resolvedTheme={resolvedTheme}
      />
    </>
  );
}

export function BudgetsView({
  view,
  budgets,
  resolvedTheme,
}: {
  view: string;
  budgets: Budget[];
  resolvedTheme: "light" | "dark";
}) {
  const chartData = budgets.map((b) => ({
    name: `${b.category?.name ?? "Category"} (${b.currency_code})`,
    spent: b.spent_cents,
    limit: b.limit_cents,
    remaining: Math.max(0, b.limit_cents - b.spent_cents),
    color: b.category?.color
      ? chartFill(b.category.color, resolvedTheme)
      : "var(--accent)",
    currency_code: b.currency_code,
    pct: b.limit_cents > 0 ? (b.spent_cents / b.limit_cents) * 100 : 0,
  }));

  if (view === "bar_chart") {
    return (
      <HorizontalGroupedBarChart
        data={chartData}
        keys={[
          { key: "limit", fill: "var(--line)", name: "Limit" },
          { key: "spent", fill: "var(--accent)", name: "Spent" },
        ]}
        currency={chartData[0]?.currency_code ?? "USD"}
      />
    );
  }

  if (view === "bar_vertical") {
    return (
      <VerticalBarChart
        data={chartData.map((r) => ({
          name: r.name,
          value: r.spent,
          color: r.color,
          currency_code: r.currency_code,
        }))}
        currency={chartData[0]?.currency_code ?? "USD"}
      />
    );
  }

  if (view === "stacked") {
    return (
      <StackedVerticalBarChart
        data={chartData}
        keys={[
          { key: "spent", fill: "var(--accent)", name: "Spent" },
          { key: "remaining", fill: "var(--line)", name: "Remaining" },
        ]}
        currency={chartData[0]?.currency_code ?? "USD"}
      />
    );
  }

  if (view === "radial") {
    const rows: ChartRow[] = chartData.map((r) => ({
      name: r.name,
      value: r.pct,
      color: r.color,
    }));
    return <RadialChart data={rows} />;
  }

  if (view === "pie" || view === "donut") {
    const rows: ChartRow[] = chartData.map((r) => ({
      name: r.name,
      value: r.spent,
      color: r.color,
      currency_code: r.currency_code,
    }));
    return (
      <>
        <ColoredPie
          data={rows}
          innerRadius={view === "donut" ? 52 : 0}
        />
        <ChartLegend items={rows} />
      </>
    );
  }

  if (view === "table") {
    return (
      <table className="table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Currency</th>
            <th className="num">Spent</th>
            <th className="num">Limit</th>
          </tr>
        </thead>
        <tbody>
          {budgets.map((b) => (
            <tr key={b.id}>
              <td>{b.category?.name ?? "Category"}</td>
              <td>{b.currency_code}</td>
              <td className="num">
                <Money cents={b.spent_cents} currency={b.currency_code} />
              </td>
              <td className="num">
                <Money cents={b.limit_cents} currency={b.currency_code} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
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
  );
}

export function CategoryBreakdownView({
  view,
  spend,
  resolvedTheme,
}: {
  view: string;
  spend: CategorySpend[];
  resolvedTheme: "light" | "dark";
}) {
  const sorted = [...spend].sort((a, b) => b.total_cents - a.total_cents);
  const rows: ChartRow[] = sorted.map((s) => ({
    name: `${s.category_name} (${s.currency_code})`,
    value: s.total_cents,
    color: chartFill(s.color, resolvedTheme),
    currency_code: s.currency_code,
  }));

  if (view === "bar") {
    return (
      <HorizontalBarChart
        data={rows}
        currency={rows[0]?.currency_code ?? "USD"}
      />
    );
  }

  if (view === "bar_vertical") {
    return (
      <VerticalBarChart
        data={rows}
        currency={rows[0]?.currency_code ?? "USD"}
      />
    );
  }

  if (view === "pie" || view === "donut") {
    return (
      <>
        <ColoredPie
          data={rows}
          innerRadius={view === "donut" ? 52 : 0}
        />
        <ChartLegend items={rows} />
      </>
    );
  }

  if (view === "radial") {
    return <RadialChart data={rows} />;
  }

  if (view === "treemap") {
    return <ColoredTreemap data={rows} />;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Currency</th>
          <th className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((s) => (
          <tr key={`${s.category_id}-${s.currency_code}`}>
            <td>
              <span
                className="swatch inline"
                style={{ background: chartFill(s.color, resolvedTheme) }}
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
  );
}

function goalRows(goals: GoalProgress[], resolvedTheme: "light" | "dark") {
  return goals.map((g, i) => ({
    goal: g,
    color: chartFill(GOAL_COLORS[i % GOAL_COLORS.length], resolvedTheme),
    row: {
      name: g.name,
      value: g.current_amount,
      color: chartFill(GOAL_COLORS[i % GOAL_COLORS.length], resolvedTheme),
      currency_code: g.currency_code,
      pct: g.progress_pct,
    } satisfies ChartRow,
  }));
}

export function GoalsView({
  view,
  goals,
  resolvedTheme,
}: {
  view: string;
  goals: GoalProgress[];
  resolvedTheme: "light" | "dark";
}) {
  const mapped = goalRows(goals, resolvedTheme);
  const rows = mapped.map((m) => m.row);

  if (view === "bars") {
    return (
      <ul className="progress-list">
        {mapped.map(({ goal, color }) => (
          <li key={goal.id}>
            <div className="row-between">
              <span>{goal.name}</span>
              <span className="muted">
                <Money cents={goal.current_amount} currency={goal.currency_code} /> /{" "}
                <Money cents={goal.target_amount} currency={goal.currency_code} />
              </span>
            </div>
            <ProgressBar
              value={goal.current_amount}
              max={goal.target_amount}
              color={color}
            />
          </li>
        ))}
      </ul>
    );
  }

  if (view === "bar_vertical") {
    return (
      <VerticalBarChart
        data={rows}
        currency={rows[0]?.currency_code ?? "USD"}
      />
    );
  }

  if (view === "pie" || view === "donut") {
    return (
      <>
        <ColoredPie
          data={rows}
          innerRadius={view === "donut" ? 52 : 0}
        />
        <ChartLegend items={rows} />
      </>
    );
  }

  if (view === "radial") {
    return (
      <RadialChart
        data={rows.map((r) => ({
          ...r,
          value: (r as ChartRow & { pct?: number }).pct ?? r.value,
        }))}
      />
    );
  }

  if (view === "treemap") {
    return <ColoredTreemap data={rows} />;
  }

  return (
    <div className="goal-pies">
      {mapped.map(({ goal, color }) => (
        <div key={goal.id} className="goal-pie">
          <GoalProgressRing percent={goal.progress_pct} color={color} />
          <div className="goal-pie-meta">
            <strong>{goal.name}</strong>
            <span className="muted">
              <Money cents={goal.current_amount} currency={goal.currency_code} /> /{" "}
              <Money cents={goal.target_amount} currency={goal.currency_code} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DepositsView({
  view,
  deposits,
  resolvedTheme,
}: {
  view: string;
  deposits: Deposit[];
  resolvedTheme: "light" | "dark";
}) {
  const rows: ChartRow[] = deposits.map((d, i) => ({
    name: d.name,
    value: d.principal_cents,
    color: chartFill(GOAL_COLORS[i % GOAL_COLORS.length], resolvedTheme),
    currency_code: d.currency_code,
    pct: d.term_progress_pct,
  }));

  if (view === "bars") {
    return (
      <ul className="progress-list">
        {deposits.map((d, i) => {
          const color = chartFill(GOAL_COLORS[i % GOAL_COLORS.length], resolvedTheme);
          return (
            <li key={d.id}>
              <div className="row-between">
                <span>{d.name}</span>
                <span className="muted">{Math.round(d.term_progress_pct)}%</span>
              </div>
              <ProgressBar value={d.term_progress_pct} max={100} color={color} />
            </li>
          );
        })}
      </ul>
    );
  }

  if (view === "list") {
    return (
      <ul className="deposit-list">
        {deposits.map((d) => {
          const accrued = d.type === "bank" ? d.accrued_interest_cents : 0;
          return (
            <li key={d.id} className="deposit-list-item">
              <div className="row-between">
                <strong>{d.name}</strong>
                <span className="muted">{Math.round(d.term_progress_pct)}% term</span>
              </div>
              <span className="muted small">
                <Money cents={d.principal_cents} currency={d.currency_code} />
                {accrued > 0 ? (
                  <>
                    {" "}
                    · accrued{" "}
                    <Money cents={accrued} currency={d.currency_code} />
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  if (view === "bar_chart") {
    return (
      <HorizontalBarChart
        data={rows}
        currency={rows[0]?.currency_code ?? "USD"}
      />
    );
  }

  if (view === "bar_vertical") {
    return (
      <VerticalBarChart
        data={rows}
        currency={rows[0]?.currency_code ?? "USD"}
      />
    );
  }

  if (view === "pie" || view === "donut") {
    return (
      <>
        <ColoredPie
          data={rows}
          innerRadius={view === "donut" ? 52 : 0}
        />
        <ChartLegend items={rows} />
      </>
    );
  }

  if (view === "radial") {
    return (
      <RadialChart
        data={rows.map((r) => ({
          ...r,
          value: (r as ChartRow & { pct?: number }).pct ?? r.value,
        }))}
      />
    );
  }

  if (view === "treemap") {
    return <ColoredTreemap data={rows} />;
  }

  return (
    <div className="goal-pies">
      {deposits.map((d) => {
        const accrued = d.type === "bank" ? d.accrued_interest_cents : 0;
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
  );
}

export function CreditsDebtsView({
  view,
  items,
  resolvedTheme,
}: {
  view: string;
  items: CreditDebt[];
  resolvedTheme: "light" | "dark";
}) {
  const rows: ChartRow[] = items.map((item, i) => ({
    name: item.name,
    value: item.remaining_cents,
    color: chartFill(
      item.direction === "credit"
        ? "#2f6b4f"
        : item.direction === "debt"
          ? "#a65d57"
          : GOAL_COLORS[i % GOAL_COLORS.length],
      resolvedTheme,
    ),
    currency_code: item.currency_code,
    pct: item.progress_pct,
  }));

  if (view === "bars") {
    return (
      <ul className="progress-list">
        {items.map((item) => {
          const color = chartFill(
            item.direction === "credit" ? "#2f6b4f" : "#a65d57",
            resolvedTheme,
          );
          return (
            <li key={item.id}>
              <div className="row-between">
                <span>{item.name}</span>
                <span className="muted">{Math.round(item.progress_pct)}%</span>
              </div>
              <ProgressBar
                value={item.paid_cents}
                max={item.principal_cents + item.accrued_interest_cents}
                color={color}
              />
            </li>
          );
        })}
      </ul>
    );
  }

  if (view === "list") {
    return (
      <ul className="deposit-list">
        {items.map((item) => (
          <li key={item.id} className="deposit-list-item">
            <div className="row-between">
              <strong>{item.name}</strong>
              <span className="muted">
                {item.direction === "credit" ? "Owed to you" : "You owe"}
              </span>
            </div>
            <span className="muted small">
              <Money cents={item.remaining_cents} currency={item.currency_code} />
              {" remaining · "}
              {Math.round(item.progress_pct)}% paid
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (view === "bar_chart") {
    return (
      <HorizontalBarChart
        data={rows}
        currency={rows[0]?.currency_code ?? "USD"}
      />
    );
  }

  if (view === "bar_vertical") {
    return (
      <VerticalBarChart
        data={rows}
        currency={rows[0]?.currency_code ?? "USD"}
      />
    );
  }

  if (view === "pie" || view === "donut") {
    return (
      <>
        <ColoredPie
          data={rows}
          innerRadius={view === "donut" ? 52 : 0}
        />
        <ChartLegend items={rows} />
      </>
    );
  }

  if (view === "radial") {
    return (
      <RadialChart
        data={rows.map((r) => ({
          ...r,
          value: (r as ChartRow & { pct?: number }).pct ?? r.value,
        }))}
      />
    );
  }

  if (view === "treemap") {
    return <ColoredTreemap data={rows} />;
  }

  return (
    <div className="goal-pies">
      {items.map((item) => {
        const color = item.direction === "credit" ? "#2f6b4f" : "#a65d57";
        return (
          <div key={item.id} className="goal-pie">
            <GoalProgressRing percent={item.progress_pct} color={color} />
            <div className="goal-pie-meta">
              <strong>{item.name}</strong>
              <span className="muted">
                <Money cents={item.remaining_cents} currency={item.currency_code} /> remaining
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PocketView({ pocket }: { pocket: PocketOverview }) {
  return (
    <div className="pocket-grid">
      {pocket.currencies.map((c) => {
        const positive = c.net_cents >= 0;
        return (
          <article
            key={c.currency_code}
            className={`pocket-card${positive ? "" : " is-negative"}`}
          >
            <span className="pocket-card-currency">{c.currency_code}</span>
            <p
              className={`pocket-card-amount${positive ? "" : " negative"}`}
            >
              <Money cents={c.net_cents} currency={c.currency_code} />
            </p>
            <div className="pocket-card-split">
              <div className="pocket-split-item">
                <span className="stat-label">Cash</span>
                <span
                  className={`pocket-split-value${
                    (c.cash_net_cents ?? 0) >= 0 ? "" : " negative"
                  }`}
                >
                  <Money cents={c.cash_net_cents ?? 0} currency={c.currency_code} />
                </span>
              </div>
              <div className="pocket-split-item">
                <span className="stat-label">Card</span>
                <span
                  className={`pocket-split-value${
                    (c.card_net_cents ?? 0) >= 0 ? "" : " negative"
                  }`}
                >
                  <Money cents={c.card_net_cents ?? 0} currency={c.currency_code} />
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function MoneyLocationView({
  view,
  overview,
  locale,
}: {
  view: string;
  overview: MoneyLocationOverview;
  locale: string;
}) {
  const currency = overview.currencies[0]?.currency_code ?? "USD";
  const chartData = overview.currencies.map((c) => ({
    name: c.currency_code,
    cash_income: c.cash.income_cents,
    cash_expense: c.cash.expense_cents,
    card_income: c.card.income_cents,
    card_expense: c.card.expense_cents,
  }));
  const keys = [
    { key: "cash_income", fill: "#2f6b4f", name: "Cash income" },
    { key: "cash_expense", fill: "#a65d57", name: "Cash expenses" },
    { key: "card_income", fill: "#4a8f6a", name: "Card income" },
    { key: "card_expense", fill: "#c4a35a", name: "Card expenses" },
  ];

  if (view === "bar") {
    return (
      <GroupedVerticalBarChart
        data={chartData}
        keys={keys}
        currency={currency}
        locale={locale}
      />
    );
  }

  if (view === "horizontal_bar") {
    return (
      <HorizontalGroupedBarChart
        data={chartData}
        keys={keys}
        currency={currency}
        locale={locale}
      />
    );
  }

  if (view === "stacked") {
    return (
      <StackedVerticalBarChart
        data={chartData}
        keys={keys}
        currency={currency}
        locale={locale}
      />
    );
  }

  return (
    <div className="currency-overview-stack">
      {overview.currencies.map((c) => (
        <div key={c.currency_code} className="currency-overview-block">
          <h3 className="currency-heading">{c.currency_code}</h3>
          <div className="stat-row money-location-stats">
            <div className="stat">
              <span className="stat-label">Cash income</span>
              <span className="stat-value income">
                <Money cents={c.cash.income_cents} currency={c.currency_code} />
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Cash expenses</span>
              <span className="stat-value expense">
                <Money cents={c.cash.expense_cents} currency={c.currency_code} />
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Card income</span>
              <span className="stat-value income">
                <Money cents={c.card.income_cents} currency={c.currency_code} />
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Card expenses</span>
              <span className="stat-value expense">
                <Money cents={c.card.expense_cents} currency={c.currency_code} />
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
