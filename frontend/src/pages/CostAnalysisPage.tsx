import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { useAppStore } from "@/store/appStore";
import { dashboardApi } from "@/services/api";
import { formatCurrency, cn } from "@/lib/utils";
import type { DashboardData } from "@/types";

const PALETTE = [
  "hsl(239,84%,67%)", "hsl(199,89%,48%)", "hsl(142,71%,45%)",
  "hsl(38,92%,50%)", "hsl(0,72%,51%)", "hsl(280,65%,60%)",
  "hsl(160,60%,45%)", "hsl(24,80%,55%)", "hsl(210,70%,55%)", "hsl(320,60%,55%)",
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};

export function CostAnalysisPage() {
  const { activeDatasetId } = useAppStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!activeDatasetId) return;
    setLoading(true);
    try {
      const d = await dashboardApi.get(activeDatasetId);
      setData(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [activeDatasetId]);

  if (!activeDatasetId) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <TrendingUp className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Select a dataset to view cost analysis</p>
      </div>
    );
  }

  if (loading || !data) {
    return <div className="space-y-4">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
    </div>;
  }

  // Aggregate daily trend by week
  const weeklyData = (() => {
    const map: Record<string, number> = {};
    data.daily_trend.forEach((d) => {
      try {
        const week = format(parseISO(d.date), "MMM 'W'W");
        map[week] = (map[week] || 0) + d.cost;
      } catch { }
    });
    return Object.entries(map).map(([week, cost]) => ({ week, cost }));
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Cost Analysis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.summary.period_days}-day period · {formatCurrency(data.summary.total_cost)} total
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="trend">
        <TabsList>
          <TabsTrigger value="trend">Daily Trend</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>

        <TabsContent value="trend">
          <Card>
            <CardHeader>
              <CardTitle>Daily Cost Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data.daily_trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(224,20%,16%)" />
                  <XAxis dataKey="date"
                    tick={{ fill: "hsl(220,10%,50%)", fontSize: 10 }}
                    tickLine={false} axisLine={false}
                    tickFormatter={(v, i) => i % 7 === 0 ? format(parseISO(v), "MMM d") : ""}
                    interval={0}
                  />
                  <YAxis tick={{ fill: "hsl(220,10%,50%)", fontSize: 10 }}
                    tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatCurrency(v, { compact: true })} width={60}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="cost" stroke="hsl(239,84%,67%)"
                    strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Cost" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly">
          <Card>
            <CardHeader><CardTitle>Weekly Cost</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={weeklyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(224,20%,16%)" />
                  <XAxis dataKey="week" tick={{ fill: "hsl(220,10%,50%)", fontSize: 10 }}
                    tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(220,10%,50%)", fontSize: 10 }}
                    tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatCurrency(v, { compact: true })} width={60} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(224,20%,16%)" }} />
                  <Bar dataKey="cost" radius={[4, 4, 0, 0]} name="Cost">
                    {weeklyData.map((_, i) => (
                      <Cell key={i} fill={`hsl(239,84%,${55 + i * 2}%)`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services">
          <Card>
            <CardHeader><CardTitle>Cost by Service</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  data={data.service_breakdown.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(224,20%,16%)" />
                  <XAxis type="number"
                    tick={{ fill: "hsl(220,10%,50%)", fontSize: 10 }}
                    tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatCurrency(v, { compact: true })}
                  />
                  <YAxis dataKey="service" type="category"
                    tick={{ fill: "hsl(220,10%,50%)", fontSize: 10 }}
                    tickLine={false} axisLine={false} width={150}
                    tickFormatter={(v) => v.split(" / ").pop() || v}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(224,20%,16%)" }} />
                  <Bar dataKey="cost" radius={[0, 4, 4, 0]} maxBarSize={24} name="Cost">
                    {data.service_breakdown.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams">
          <Card>
            <CardHeader><CardTitle>Cost by Team</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.team_breakdown} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(224,20%,16%)" />
                  <XAxis dataKey="team" tick={{ fill: "hsl(220,10%,50%)", fontSize: 11 }}
                    tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(220,10%,50%)", fontSize: 10 }}
                    tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatCurrency(v, { compact: true })} width={60} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(224,20%,16%)" }} />
                  <Bar dataKey="cost" radius={[4, 4, 0, 0]} maxBarSize={40} name="Cost">
                    {data.team_breakdown.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Service table */}
      <Card>
        <CardHeader><CardTitle>Service Detail</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1">
            <div className="grid grid-cols-4 gap-4 px-3 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              <span>Service</span>
              <span className="text-right">Cost</span>
              <span className="text-right">Share</span>
              <span className="text-right">vs Prior</span>
            </div>
            {data.service_breakdown.map((s, i) => (
              <motion.div
                key={s.service}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="grid grid-cols-4 gap-4 px-3 py-2.5 rounded-lg hover:bg-secondary/40 transition-colors text-sm"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="text-foreground truncate">{s.service}</span>
                </div>
                <span className="text-right font-medium text-foreground">{formatCurrency(s.cost)}</span>
                <div className="flex items-center justify-end gap-2">
                  <div className="w-16 h-1 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${s.percentage}%` }} />
                  </div>
                  <span className="text-muted-foreground text-xs w-10 text-right">{s.percentage.toFixed(1)}%</span>
                </div>
                <span className={cn(
                  "text-right text-xs font-medium",
                  s.change_pct > 0 ? "text-red-400" : s.change_pct < 0 ? "text-green-400" : "text-muted-foreground"
                )}>
                  {s.change_pct > 0 ? "+" : ""}{s.change_pct.toFixed(1)}%
                </span>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
