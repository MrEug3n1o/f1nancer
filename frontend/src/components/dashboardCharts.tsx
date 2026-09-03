import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { formatMoney } from "../utils";

export const CHART_TOOLTIP_STYLE = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  color: "var(--ink)",
  boxShadow: "var(--shadow)",
};

const TOOLTIP_LABEL_STYLE = {
  color: "var(--ink)",
  fontWeight: 600,
  marginBottom: 4,
};

const TOOLTIP_ITEM_STYLE = {
  color: "var(--muted)",
  paddingTop: 2,
};

const BAR_ACTIVE = {
  opacity: 0.82,
  stroke: "var(--line)",
  strokeWidth: 1,
};

function moneyTooltipValue(value: unknown, currency: string, locale?: string) {
  return typeof value === "number"
    ? formatMoney(value, currency, locale)
    : String(value ?? "");
}

export function BarChartTooltip({
  currency = "USD",
  locale,
}: {
  currency?: string;
  locale?: string;
}) {
  return (
    <Tooltip
      cursor={false}
      contentStyle={CHART_TOOLTIP_STYLE}
      labelStyle={TOOLTIP_LABEL_STYLE}
      itemStyle={TOOLTIP_ITEM_STYLE}
      formatter={(value, name, item) => {
        const code =
          (item?.payload as { currency_code?: string } | undefined)?.currency_code ??
          currency;
        return [moneyTooltipValue(value, code, locale), name];
      }}
    />
  );
}

export function ChartTooltip({
  locale,
  currency = "USD",
}: {
  locale?: string;
  currency?: string;
}) {
  return (
    <Tooltip
      cursor={false}
      contentStyle={CHART_TOOLTIP_STYLE}
      labelStyle={TOOLTIP_LABEL_STYLE}
      itemStyle={TOOLTIP_ITEM_STYLE}
      formatter={(value, _name, item) => {
        const code =
          (item?.payload as ChartRow | undefined)?.currency_code ?? currency;
        return [moneyTooltipValue(value, code, locale), "Amount"];
      }}
    />
  );
}

export type ChartRow = {
  name: string;
  value: number;
  color: string;
  currency_code?: string;
  [key: string]: string | number | undefined;
};

export function moneyTick(value: number, currency: string, locale?: string) {
  return formatMoney(value, currency, locale);
}

export function ChartShell({
  height,
  children,
}: {
  height: number;
  children: ReactNode;
}) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function ColoredPie({
  data,
  innerRadius = 0,
  height = 260,
  locale,
  valueKey = "value",
  nameKey = "name",
}: {
  data: ChartRow[];
  innerRadius?: number;
  height?: number;
  locale?: string;
  valueKey?: string;
  nameKey?: string;
}) {
  return (
    <ChartShell height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius={innerRadius}
          outerRadius={96}
          paddingAngle={data.length > 1 ? 3 : 0}
          stroke="none"
          cornerRadius={data.length > 1 ? 6 : 0}
        >
          {data.map((row) => (
            <Cell key={row.name} fill={row.color} stroke="none" />
          ))}
        </Pie>
        <Tooltip
          cursor={false}
          contentStyle={CHART_TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          formatter={(value, _name, item) => {
            const code =
              (item?.payload as ChartRow | undefined)?.currency_code ?? "USD";
            return [moneyTooltipValue(value, code, locale), "Amount"];
          }}
        />
      </PieChart>
    </ChartShell>
  );
}

export function HorizontalBarChart({
  data,
  valueKey = "value",
  height,
  locale,
  currency = "USD",
}: {
  data: ChartRow[];
  valueKey?: string;
  height?: number;
  locale?: string;
  currency?: string;
}) {
  const h = height ?? Math.max(220, data.length * 36);
  return (
    <ChartShell height={h}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(v) => moneyTick(Number(v), currency, locale)}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={130}
          tick={{ fill: "var(--ink)", fontSize: 11 }}
        />
        <BarChartTooltip currency={currency} locale={locale} />
        <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} activeBar={BAR_ACTIVE}>
          {data.map((row) => (
            <Cell key={row.name} fill={row.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}

export function VerticalBarChart({
  data,
  valueKey = "value",
  height = 260,
  locale,
  currency = "USD",
  stackedKeys,
}: {
  data: ChartRow[];
  valueKey?: string;
  height?: number;
  locale?: string;
  currency?: string;
  stackedKeys?: { key: string; fill: string; name: string }[];
}) {
  return (
    <ChartShell height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis
          dataKey="name"
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          interval={0}
          angle={data.length > 4 ? -25 : 0}
          textAnchor={data.length > 4 ? "end" : "middle"}
          height={data.length > 4 ? 56 : 30}
        />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(v) => moneyTick(Number(v), currency, locale)}
        />
        <BarChartTooltip currency={currency} locale={locale} />
        {stackedKeys ? (
          stackedKeys.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="stack"
              fill={s.fill}
              name={s.name}
              radius={[4, 4, 0, 0]}
              activeBar={BAR_ACTIVE}
            />
          ))
        ) : (
          <Bar dataKey={valueKey} radius={[4, 4, 0, 0]} activeBar={BAR_ACTIVE}>
            {data.map((row) => (
              <Cell key={row.name} fill={row.color} />
            ))}
          </Bar>
        )}
        {stackedKeys ? <Legend /> : null}
      </BarChart>
    </ChartShell>
  );
}

export function GroupedVerticalBarChart({
  data,
  keys,
  height = 260,
  locale,
  currency = "USD",
}: {
  data: Record<string, string | number>[];
  keys: { key: string; fill: string; name: string }[];
  height?: number;
  locale?: string;
  currency?: string;
}) {
  return (
    <ChartShell height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 12 }} />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(v) => moneyTick(Number(v), currency, locale)}
        />
        <BarChartTooltip currency={currency} locale={locale} />
        <Legend />
        {keys.map((k) => (
          <Bar
            key={k.key}
            dataKey={k.key}
            fill={k.fill}
            name={k.name}
            radius={[4, 4, 0, 0]}
            activeBar={BAR_ACTIVE}
          />
        ))}
      </BarChart>
    </ChartShell>
  );
}

export function StackedVerticalBarChart({
  data,
  keys,
  height = 260,
  locale,
  currency = "USD",
}: {
  data: Record<string, string | number>[];
  keys: { key: string; fill: string; name: string }[];
  height?: number;
  locale?: string;
  currency?: string;
}) {
  return (
    <ChartShell height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 12 }} />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(v) => moneyTick(Number(v), currency, locale)}
        />
        <BarChartTooltip currency={currency} locale={locale} />
        <Legend />
        {keys.map((k) => (
          <Bar
            key={k.key}
            dataKey={k.key}
            stackId="s"
            fill={k.fill}
            name={k.name}
            activeBar={BAR_ACTIVE}
          />
        ))}
      </BarChart>
    </ChartShell>
  );
}

export function HorizontalGroupedBarChart({
  data,
  keys,
  height,
  locale,
  currency = "USD",
}: {
  data: Record<string, string | number>[];
  keys: { key: string; fill: string; name: string }[];
  height?: number;
  locale?: string;
  currency?: string;
}) {
  const h = height ?? Math.max(220, data.length * 40);
  return (
    <ChartShell height={h}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(v) => moneyTick(Number(v), currency, locale)}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={130}
          tick={{ fill: "var(--ink)", fontSize: 11 }}
        />
        <BarChartTooltip currency={currency} locale={locale} />
        <Legend />
        {keys.map((k) => (
          <Bar
            key={k.key}
            dataKey={k.key}
            fill={k.fill}
            name={k.name}
            radius={[0, 4, 4, 0]}
            activeBar={BAR_ACTIVE}
          />
        ))}
      </BarChart>
    </ChartShell>
  );
}

export function LineAreaChart({
  data,
  keys,
  mode,
  height = 260,
  locale,
  currency = "USD",
}: {
  data: Record<string, string | number>[];
  keys: { key: string; fill: string; name: string }[];
  mode: "line" | "area";
  height?: number;
  locale?: string;
  currency?: string;
}) {
  const Chart = mode === "area" ? AreaChart : LineChart;
  return (
    <ChartShell height={height}>
      <Chart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 12 }} />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(v) => moneyTick(Number(v), currency, locale)}
        />
        <Tooltip
          cursor={{ stroke: "var(--line)", strokeWidth: 1, strokeDasharray: "4 4" }}
          contentStyle={CHART_TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          formatter={(value, name) => [
            moneyTooltipValue(value, currency, locale),
            name,
          ]}
        />
        <Legend />
        {keys.map((k) =>
          mode === "area" ? (
            <Area
              key={k.key}
              type="monotone"
              dataKey={k.key}
              stroke={k.fill}
              fill={k.fill}
              fillOpacity={0.25}
              name={k.name}
            />
          ) : (
            <Line
              key={k.key}
              type="monotone"
              dataKey={k.key}
              stroke={k.fill}
              strokeWidth={2}
              dot={{ r: 3 }}
              name={k.name}
            />
          ),
        )}
      </Chart>
    </ChartShell>
  );
}

export function RadialChart({
  data,
  height = 280,
}: {
  data: ChartRow[];
  height?: number;
}) {
  return (
    <ChartShell height={height}>
      <RadialBarChart
        innerRadius="18%"
        outerRadius="95%"
        data={data}
        startAngle={180}
        endAngle={0}
      >
        <RadialBar
          background={{ fill: "var(--stat-bg)" }}
          dataKey="value"
          cornerRadius={6}
        >
          {data.map((row) => (
            <Cell key={row.name} fill={row.color} />
          ))}
        </RadialBar>
        <Tooltip
          cursor={false}
          contentStyle={CHART_TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        <Legend />
      </RadialBarChart>
    </ChartShell>
  );
}

function TreemapNode(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  fill?: string;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name, fill } = props;
  if (width < 4 || height < 4) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="var(--bg-elevated)"
        strokeWidth={2}
        rx={4}
      />
      {width > 48 && height > 24 ? (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={11}
        >
          {name}
        </text>
      ) : null}
    </g>
  );
}

export function ColoredTreemap({ data, height = 260 }: { data: ChartRow[]; height?: number }) {
  return (
    <ChartShell height={height}>
      <Treemap
        data={data}
        dataKey="value"
        aspectRatio={4 / 3}
        stroke="var(--bg-elevated)"
        content={<TreemapNode />}
      />
    </ChartShell>
  );
}

export function ChartLegend({ items }: { items: ChartRow[] }) {
  return (
    <ul className="legend">
      {items.map((row) => (
        <li key={row.name}>
          <span className="swatch" style={{ background: row.color }} />
          {row.name}
        </li>
      ))}
    </ul>
  );
}
