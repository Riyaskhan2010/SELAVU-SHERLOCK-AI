import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { TeamBreakdown } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface Props { data: TeamBreakdown[] }

const PALETTE = [
  "hsl(239,84%,67%)", "hsl(199,89%,48%)", "hsl(142,71%,45%)",
  "hsl(38,92%,50%)", "hsl(280,65%,60%)", "hsl(160,60%,45%)",
  "hsl(0,72%,51%)", "hsl(24,80%,55%)",
];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as TeamBreakdown;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-foreground font-medium capitalize">{d.team}</p>
      <p className="text-muted-foreground">{formatCurrency(d.cost)} ({d.percentage.toFixed(1)}%)</p>
    </div>
  );
};

export function TeamBreakdownChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No team data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 4 }}>
        <XAxis
          type="number"
          tick={{ fill: "hsl(220,10%,50%)", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatCurrency(v, { compact: true })}
        />
        <YAxis
          dataKey="team"
          type="category"
          tick={{ fill: "hsl(220,10%,50%)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={68}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(224,20%,16%)" }} />
        <Bar dataKey="cost" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
