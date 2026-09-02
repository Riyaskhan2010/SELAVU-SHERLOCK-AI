import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ServiceBreakdown } from "@/types";
import { formatCurrency, formatPercent } from "@/lib/utils";

interface Props { data: ServiceBreakdown[] }

const PALETTE = [
  "hsl(239,84%,67%)", "hsl(199,89%,48%)", "hsl(142,71%,45%)",
  "hsl(38,92%,50%)", "hsl(0,72%,51%)", "hsl(280,65%,60%)",
  "hsl(160,60%,45%)", "hsl(24,80%,55%)", "hsl(210,70%,55%)", "hsl(320,60%,55%)",
];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ServiceBreakdown;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-foreground font-medium mb-1">{d.service}</p>
      <p className="text-muted-foreground">{formatCurrency(d.cost)} ({formatPercent(d.percentage)})</p>
      {d.change_pct !== 0 && (
        <p className={d.change_pct > 0 ? "text-red-400" : "text-green-400"}>
          {d.change_pct > 0 ? "+" : ""}{d.change_pct.toFixed(1)}% vs prior
        </p>
      )}
    </div>
  );
};

export function ServiceBreakdownChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No data</div>;
  }

  const top = data.slice(0, 8);

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie
            data={top}
            dataKey="cost"
            nameKey="service"
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={65}
            paddingAngle={2}
            strokeWidth={0}
          >
            {top.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5">
        {top.slice(0, 6).map((s, i) => (
          <div key={s.service} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="text-xs text-muted-foreground flex-1 truncate">{s.service.replace("Compute / ", "").replace("Storage / ", "").replace("Database / ", "")}</span>
            <span className="text-xs font-medium text-foreground">{formatCurrency(s.cost, { compact: true })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
