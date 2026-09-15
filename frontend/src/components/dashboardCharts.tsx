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
  // Padding angles and rounded corners only work on donuts; on a solid pie they
  // pull every wedge's apex away from the center. Separate wedges with a stroke instead.
  const multi = data.length > 1;
  const donut = innerRadius > 0;
  const stroke = multi && !donut ? "var(--bg-elevated)" : "none";
  return (
    <ChartShell height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius={innerRadius}
          outerRadius={96}
          paddingAngle={multi && donut ? 3 : 0}
          stroke={stroke}
          strokeWidth={2}
          cornerRadius={multi && donut ? 6 : 0}
        >
          {data.map((row) => (
            <Cell key={row.name} fill={row.color} stroke={stroke} strokeWidth={2} />
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

function defaultValueLabel(row: ChartRow, locale?: string) {
  return formatMoney(row.value, row.currency_code ?? "USD", locale);
}

/** Concentric progress rings, largest value outermost. */
export function RadialChart({
  data,
  max,
  locale,
  formatValue,
  size = 220,
}: {
  data: ChartRow[];
  /** Value that fills a full ring; defaults to the largest value. */
  max?: number;
  locale?: string;
  formatValue?: (row: ChartRow) => string;
  size?: number;
}) {
  const rows = [...data].sort((a, b) => b.value - a.value);
  if (rows.length === 0) return null;
  const label = formatValue ?? ((row: ChartRow) => defaultValueLabel(row, locale));
  const scaleMax = max ?? Math.max(...rows.map((r) => r.value), 1);
  const center = size / 2;
  const outer = center - 2;
  const band = (outer - size * 0.14) / rows.length;
  const strokeWidth = Math.min(18, band * 0.72);

  return (
    <div className="radial-chart">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        {rows.map((row, i) => {
          const r = outer - band * i - strokeWidth / 2;
          const circumference = 2 * Math.PI * r;
          const pct = Math.min(1, Math.max(0, row.value / scaleMax));
          const dash = pct * circumference;
          return (
            <g key={`${row.name}-${i}`}>
              <title>{`${row.name}: ${label(row)}`}</title>
              <circle
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke="var(--progress-track)"
                strokeWidth={strokeWidth}
              />
              {pct > 0 ? (
                <circle
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke={row.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap={pct < 1 ? "round" : "butt"}
                  strokeDasharray={`${dash} ${circumference}`}
                  transform={`rotate(-90 ${center} ${center})`}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      <ul className="legend">
        {rows.map((row, i) => (
          <li key={`${row.name}-${i}`}>
            <span className="swatch" style={{ background: row.color }} />
            {row.name} — {label(row)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Dark text on light fills, white text on dark ones. */
function treemapLabelColor(fill: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(fill.trim());
  if (!match) return "#fff";
  const n = parseInt(match[1], 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.62 ? "#14181d" : "#fff";
}

function truncateLabel(text: string, width: number, charWidth: number) {
  const maxChars = Math.floor((width - 12) / charWidth);
  if (text.length <= maxChars) return text;
  return maxChars > 2 ? `${text.slice(0, maxChars - 1)}…` : "";
}

function TreemapNode(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  name?: string;
  value?: number;
  color?: string;
  currency_code?: string;
  locale?: string;
}) {
  const { x = 0, y = 0, width = 0, height = 0, depth = 0, name = "", color } = props;
  // Recharts also renders the root node (depth 0), which would paint the gaps between tiles.
  if (depth < 1 || width < 4 || height < 4) return null;
  const fill = color ?? "var(--accent)";
  const textColor = treemapLabelColor(fill);
  const title = truncateLabel(name, width, 7);
  const amount =
    typeof props.value === "number" && props.currency_code
      ? formatMoney(props.value, props.currency_code, props.locale)
      : "";
  const showAmount = Boolean(amount) && height > 44 && truncateLabel(amount, width, 6.5) === amount;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const textStyle = { fill: textColor, fontFamily: "var(--font-ui)", pointerEvents: "none" as const };

  return (
    <g>
      <title>{amount ? `${name}: ${amount}` : name}</title>
      <rect x={x} y={y} width={width} height={height} rx={6} fill={fill} stroke="none" />
      {title && height > 22 ? (
        <text
          x={cx}
          y={showAmount ? cy - 8 : cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fontWeight={600}
          style={textStyle}
        >
          {title}
        </text>
      ) : null}
      {showAmount ? (
        <text
          x={cx}
          y={cy + 9}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          style={{ ...textStyle, opacity: 0.85 }}
        >
          {amount}
        </text>
      ) : null}
    </g>
  );
}

export function ColoredTreemap({
  data,
  height = 260,
  locale,
}: {
  data: ChartRow[];
  height?: number;
  locale?: string;
}) {
  return (
    <ChartShell height={height}>
      <Treemap
        data={data}
        dataKey="value"
        aspectRatio={4 / 3}
        nodeGap={4}
        isAnimationActive={false}
        content={<TreemapNode locale={locale} />}
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
