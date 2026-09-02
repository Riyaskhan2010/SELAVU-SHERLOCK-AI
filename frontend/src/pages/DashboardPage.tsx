import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  DollarSign, TrendingUp, AlertTriangle, Zap,
  ArrowUpRight, ArrowDownRight, ChevronRight,
  Sparkles, RefreshCw, Upload, Database, FlaskConical, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CostTrendChart } from "@/components/charts/CostTrendChart";
import { ServiceBreakdownChart } from "@/components/charts/ServiceBreakdownChart";
import { TeamBreakdownChart } from "@/components/charts/TeamBreakdownChart";
import { useAppStore } from "@/store/appStore";
import { dashboardApi, findingsApi, datasetsApi } from "@/services/api";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import type { DashboardData, Finding } from "@/types";

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: "easeOut" },
};
const stagger = { animate: { transition: { staggerChildren: 0.07 } } };

// ─── Zero-value dashboard data for new users ─────────────────────────────────
const ZERO_DASHBOARD: DashboardData = {
  summary: {
    total_cost: 0,
    period_days: 0,
    daily_average: 0,
    cost_change_pct: 0,
    previous_period_cost: 0,
    potential_savings: 0,
    anomaly_count: 0,
    opportunity_count: 0,
  },
  service_breakdown: [],
  team_breakdown: [],
  daily_trend: [],
  ai_summary: "",
};

export function DashboardPage() {
  const { activeDatasetId, datasets, datasetsLoaded, openEvidencePanel, refreshDatasets, setActiveDataset } = useAppStore();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [topFindings, setTopFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleUploadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const name = file.name.replace(/\.[^.]+$/, "");
      const dataset = await datasetsApi.upload(file, name);
      await refreshDatasets();
      setActiveDataset(dataset.id);
    } catch (err: any) {
      console.error("Upload failed:", err?.response?.data?.detail || err?.message);
    } finally {
      setUploading(false);
    }
  };

  // Mark ready immediately so the dashboard renders instead of spinning
  useEffect(() => {
    const t = setTimeout(() => setLocalReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Also mark ready when datasetsLoaded becomes true
  useEffect(() => {
    if (datasetsLoaded) setLocalReady(true);
  }, [datasetsLoaded]);

  const isReady = localReady || datasetsLoaded;
  const hasNoDatasets = isReady && datasets.length === 0;
  const hasDatasets = isReady && datasets.length > 0;

  useEffect(() => {
    if (!activeDatasetId) {
      setDashboard(null);
      setTopFindings([]);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      dashboardApi.get(activeDatasetId),
      findingsApi.list(activeDatasetId, { page: 1, page_size: 5 }),
    ])
      .then(([dash, findings]) => {
        setDashboard(dash);
        setTopFindings(findings.items);
      })
      .catch((e) => {
        const msg = e?.response?.data?.detail || e.message || "Failed to load dashboard";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [activeDatasetId]);

  // ── Still loading from API — but only wait max 300ms ──────────────────
  if (!isReady) return <DashboardSkeleton />;

  // ── Loading selected dataset ────────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;

  // ── Error ───────────────────────────────────────────────────────────────
  if (error) return (
    <ErrorState message={error} onRetry={() => { setError(null); setLoading(true); }} />
  );

  // ── Determine what data to show ─────────────────────────────────────────
  // New user (no datasets) → zero-state dashboard with upload prompt banner
  // Has datasets but none selected → prompt to select
  // Has data → show real dashboard
  const displayData = dashboard ?? (hasNoDatasets ? ZERO_DASHBOARD : null);
  const isZeroState = hasNoDatasets || (!activeDatasetId && hasDatasets);

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">

      {/* Hidden file input — always in DOM so ref is always valid */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* ── Upload prompt banner for new users (non-blocking) ── */}
      {isZeroState && (
        <motion.div variants={fadeIn}>
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-secondary/50 border border-border">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 shrink-0">
                <Database className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No datasets yet</p>
                <p className="text-xs text-muted-foreground">
                  Upload a cost &amp; usage dataset to see real insights here.
                  Or explore the{" "}
                  <button
                    className="text-primary hover:underline"
                    onClick={() => navigate("/demo-data")}
                  >
                    Demo Data
                  </button>{" "}
                  to see how it works.
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => navigate("/demo-data")} className="h-8 text-xs">
                <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
                Demo Data
              </Button>
              <Button
                size="sm"
                onClick={handleUploadClick}
                className="h-8 text-xs"
                disabled={uploading}
                type="button"
              >
                {uploading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Uploading…</>
                  : <><Upload className="w-3.5 h-3.5 mr-1.5" />Upload dataset</>}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Dataset selector prompt ── */}
      {hasDatasets && !activeDatasetId && (
        <motion.div variants={fadeIn}>
          <div className="p-4 rounded-xl bg-secondary/50 border border-border text-center">
            <p className="text-sm text-muted-foreground">
              Select a dataset from the top bar to view its analysis.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── AI Summary (only when real data) ── */}
      {displayData && displayData.ai_summary && (
        <motion.div variants={fadeIn}>
          <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/15">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 shrink-0 mt-0.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-primary mb-0.5">AI Summary</p>
              <p className="text-sm text-foreground leading-relaxed">{displayData.ai_summary}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── KPI Cards — always visible, zero when no data ── */}
      <motion.div variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Spend"
          value={displayData ? formatCurrency(displayData.summary.total_cost, { compact: true }) : "$0"}
          sub={displayData && displayData.summary.period_days > 0
            ? `${displayData.summary.period_days}-day period`
            : "No data yet"}
          icon={DollarSign}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          change={displayData && !isZeroState ? displayData.summary.cost_change_pct : undefined}
        />
        <KpiCard
          label="Potential Savings"
          value={displayData ? formatCurrency(displayData.summary.potential_savings, { compact: true }) : "$0"}
          sub="per month, estimated"
          icon={TrendingUp}
          iconColor="text-green-400"
          iconBg="bg-green-400/10"
          highlight={!!displayData && displayData.summary.potential_savings > 0}
        />
        <KpiCard
          label="Anomalies"
          value={displayData ? displayData.summary.anomaly_count.toString() : "0"}
          sub="cost patterns flagged"
          icon={AlertTriangle}
          iconColor="text-orange-400"
          iconBg="bg-orange-400/10"
          alert={!!displayData && displayData.summary.anomaly_count > 0}
        />
        <KpiCard
          label="Opportunities"
          value={displayData ? displayData.summary.opportunity_count.toString() : "0"}
          sub="optimization findings"
          icon={Zap}
          iconColor="text-yellow-400"
          iconBg="bg-yellow-400/10"
        />
      </motion.div>

      {/* ── Charts row — always visible ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div variants={fadeIn} className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Cost Trend</CardTitle>
              {displayData && !isZeroState && displayData.summary.cost_change_pct !== 0 && (
                <span className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  displayData.summary.cost_change_pct > 0 ? "text-red-400" : "text-green-400"
                )}>
                  {displayData.summary.cost_change_pct > 0
                    ? <ArrowUpRight className="w-3.5 h-3.5" />
                    : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {formatPercent(Math.abs(displayData.summary.cost_change_pct))} vs prior period
                </span>
              )}
            </CardHeader>
            <CardContent>
              {isZeroState || !displayData || displayData.daily_trend.length === 0 ? (
                <EmptyChartState message="Upload a dataset to see your cost trend" />
              ) : (
                <CostTrendChart data={displayData.daily_trend} />
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeIn}>
          <Card className="h-full">
            <CardHeader><CardTitle>By Service</CardTitle></CardHeader>
            <CardContent>
              {isZeroState || !displayData || displayData.service_breakdown.length === 0 ? (
                <EmptyChartState message="No service data yet" compact />
              ) : (
                <ServiceBreakdownChart data={displayData.service_breakdown} />
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div variants={fadeIn} className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Top Optimization Opportunities</CardTitle>
              {topFindings.length > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-7"
                  onClick={() => navigate("/optimization")}>
                  View all <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {topFindings.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {isZeroState
                      ? "Upload a dataset to discover optimization opportunities"
                      : "No findings detected yet"}
                  </p>
                </div>
              ) : (
                topFindings.map((f) => (
                  <FindingRow key={f.id} finding={f}
                    onViewEvidence={() => openEvidencePanel(f)} />
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeIn}>
          <Card className="h-full">
            <CardHeader><CardTitle>By Team</CardTitle></CardHeader>
            <CardContent>
              {isZeroState || !displayData || displayData.team_breakdown.length === 0 ? (
                <EmptyChartState message="No team data yet" compact />
              ) : (
                <TeamBreakdownChart data={displayData.team_breakdown} />
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyChartState({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border bg-secondary/20",
      compact ? "h-32" : "h-48"
    )}>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, iconColor, iconBg, change, highlight, alert }: {
  label: string; value: string; sub: string;
  icon: React.ElementType; iconColor: string; iconBg: string;
  change?: number; highlight?: boolean; alert?: boolean;
}) {
  return (
    <motion.div variants={fadeIn}>
      <Card className={cn(highlight && "border-green-400/20", alert && "border-orange-400/20")}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg border", iconBg,
              highlight ? "border-green-400/20" : alert ? "border-orange-400/20" : "border-border"
            )}>
              <Icon className={cn("w-4 h-4", iconColor)} />
            </div>
            {change !== undefined && change !== 0 && (
              <span className={cn(
                "flex items-center text-[11px] font-medium",
                change > 0 ? "text-red-400" : "text-green-400"
              )}>
                {change > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(change).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-foreground tracking-tight">{value}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
          <div className="text-xs font-medium text-muted-foreground mt-2 uppercase tracking-wide">{label}</div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function FindingRow({ finding, onViewEvidence }: { finding: Finding; onViewEvidence: () => void }) {
  const pv = finding.priority as "critical" | "high" | "medium" | "low";
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all group cursor-default">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge variant={pv} className="text-[10px] px-1.5 py-0">{finding.priority}</Badge>
          <span className="text-xs text-muted-foreground truncate">{finding.service}</span>
        </div>
        <p className="text-sm font-medium text-foreground truncate">{finding.title}</p>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-green-400">
          {formatCurrency(finding.potential_saving, { compact: true })}
        </div>
        <div className="text-[11px] text-muted-foreground">potential/mo</div>
      </div>
      <Button variant="ghost" size="icon-sm"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onViewEvidence}>
        <ChevronRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="col-span-2 h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-[50vh] text-center">
      <AlertTriangle className="w-10 h-10 text-destructive mb-3" />
      <p className="text-sm text-foreground mb-2">Failed to load dashboard</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="w-3.5 h-3.5 mr-2" /> Retry
      </Button>
    </div>
  );
}
