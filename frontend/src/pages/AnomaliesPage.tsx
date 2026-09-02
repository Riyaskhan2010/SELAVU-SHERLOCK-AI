import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, TrendingUp, ChevronRight, Filter, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/store/appStore";
import { anomaliesApi } from "@/services/api";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import type { Anomaly } from "@/types";

export function AnomaliesPage() {
  const { activeDatasetId } = useAppStore();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(false);
  const [severity, setSeverity] = useState("all");
  const [total, setTotal] = useState(0);

  const load = async () => {
    if (!activeDatasetId) return;
    setLoading(true);
    try {
      const res = await anomaliesApi.list(activeDatasetId, {
        severity: severity === "all" ? undefined : severity,
        page_size: 50,
      });
      setAnomalies(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [activeDatasetId, severity]);

  const severityCounts = anomalies.reduce((acc, a) => {
    acc[a.severity] = (acc[a.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (!activeDatasetId) {
    return <EmptyDataset />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Anomaly Detection</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hybrid detection: deterministic rules + statistical models
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["critical", "high", "medium", "low"] as const).map((s) => (
          <Card key={s} className={cn(
            s === "critical" && severityCounts[s] > 0 && "border-red-400/20",
            s === "high" && severityCounts[s] > 0 && "border-orange-400/20",
          )}>
            <CardContent className="p-4">
              <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{
                color: s === "critical" ? "#f87171" : s === "high" ? "#fb923c" : s === "medium" ? "#facc15" : "#4ade80"
              }}>{s}</p>
              <p className="text-2xl font-bold text-foreground">{severityCounts[s] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{total} anomalies</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : anomalies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No anomalies detected for this filter</p>
        </div>
      ) : (
        <div className="space-y-2">
          {anomalies.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <AnomalyRow anomaly={a} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnomalyRow({ anomaly }: { anomaly: Anomaly }) {
  const isPositive = anomaly.deviation_pct > 0;
  const sevVariant = anomaly.severity as "critical" | "high" | "medium" | "low";

  return (
    <Card className={cn(
      "hover:border-border/80 transition-colors",
      anomaly.severity === "critical" && "border-red-400/10",
      anomaly.severity === "high" && "border-orange-400/10",
    )}>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Severity indicator */}
          <div className={cn(
            "w-1 self-stretch rounded-full shrink-0",
            anomaly.severity === "critical" && "bg-red-400",
            anomaly.severity === "high" && "bg-orange-400",
            anomaly.severity === "medium" && "bg-yellow-400",
            anomaly.severity === "low" && "bg-green-400",
          )} />

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={sevVariant} className="text-[10px]">{anomaly.severity}</Badge>
              <span className="text-xs text-muted-foreground">{anomaly.date}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-primary font-mono">{anomaly.detection_method}</span>
            </div>
            <p className="text-sm font-medium text-foreground">{anomaly.service}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{anomaly.description}</p>
          </div>

          {/* Metrics */}
          <div className="text-right shrink-0 space-y-1">
            <div>
              <p className="text-xs text-muted-foreground">Actual</p>
              <p className="text-sm font-semibold text-foreground">{formatCurrency(anomaly.cost)}</p>
            </div>
          </div>
          <div className="text-right shrink-0 space-y-1">
            <div>
              <p className="text-xs text-muted-foreground">Expected</p>
              <p className="text-sm font-medium text-muted-foreground">{formatCurrency(anomaly.expected_cost)}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">Deviation</p>
            <p className={cn("text-sm font-bold", isPositive ? "text-red-400" : "text-green-400")}>
              {isPositive ? "+" : ""}{formatPercent(anomaly.deviation_pct)}
            </p>
          </div>

          {/* Score bar */}
          <div className="w-16 shrink-0">
            <p className="text-[10px] text-muted-foreground mb-1">Score</p>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  anomaly.severity === "critical" ? "bg-red-400" :
                    anomaly.severity === "high" ? "bg-orange-400" :
                      anomaly.severity === "medium" ? "bg-yellow-400" : "bg-green-400"
                )}
                style={{ width: `${Math.min(100, anomaly.anomaly_score * 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{(anomaly.anomaly_score * 100).toFixed(0)}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyDataset() {
  return (
    <div className="flex flex-col items-center justify-center h-[50vh] text-center">
      <AlertTriangle className="w-10 h-10 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">Select a dataset to view anomalies</p>
    </div>
  );
}
