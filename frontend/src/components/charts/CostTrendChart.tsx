import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { DailyTrend } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface Props {
  data: DailyTrend[];
  height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload as DailyTrend;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1">
        {label ? format(parseISO(label), "MMM d, yyyy") : ""}
      </p>
      <p className="text-foreground font-semibold">{formatCurrency(item.cost)}</p>
      {item.is_anomaly && (
        <p className="text-orange-400 mt-1 flex items-center gap-1">
          ⚠ Anomaly detected
          {item.anomaly_score && <span className="text-muted-foreground">({(item.anomaly_score * 100).toFixed(0)}%)</span>}
        </p>
      )}
    </div>
  );
};

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (!payload?.is_anomaly) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="#f97316" stroke="#f9731633" strokeWidth={6} />
    </g>
  );
};

export function CostTrendChart({ data, height = 220 }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
        No trend data available
      </div>
    );
  }

  // Thin out labels for readability
  const tickEvery = Math.max(1, Math.floor(data.length / 8));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(239,84%,67%)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="hsl(239,84%,67%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="hsl(224,20%,16%)"
        />
        <XAxis
          dataKey="date"
          tick={{ fill: "hsl(220,10%,50%)", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v, i) => {
            if (i % tickEvery !== 0) return "";
            try { return format(parseISO(v), "MMM d"); } catch { return v; }
          }}
          interval={0}
        />
        <YAxis
          tick={{ fill: "hsl(220,10%,50%)", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatCurrency(v, { compact: true })}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(239,84%,67%)", strokeWidth: 1, strokeDasharray: "4 4" }} />
        <Area
          type="monotone"
          dataKey="cost"
          stroke="hsl(239,84%,67%)"
          strokeWidth={2}
          fill="url(#costGrad)"
          dot={<CustomDot />}
          activeDot={{ r: 4, fill: "hsl(239,84%,67%)", stroke: "hsl(224,28%,8%)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
