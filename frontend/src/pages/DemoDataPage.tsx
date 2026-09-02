import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  DollarSign, TrendingUp, AlertTriangle, Zap,
  ArrowUpRight, ArrowDownRight, Sparkles, RefreshCw,
  FlaskConical, ChevronRight, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CostTrendChart } from "@/components/charts/CostTrendChart";
import { ServiceBreakdownChart } from "@/components/charts/ServiceBreakdownChart";
import { TeamBreakdownChart } from "@/components/charts/TeamBreakdownChart";
import { EvidencePanel } from "@/components/evidence/EvidencePanel";
import { useAppStore } from "@/store/appStore";
import { demoApi } from "@/services/api";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import type { DashboardData, Finding } from "@/types";

const fadeIn = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: "easeOut" },
};
const stagger = { animate: { transition: { staggerChildren: 0.06 } } };

export function DemoDataPage() {
  const { openEvidencePanel } = useAppStore();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dash, findingsRes] = await Promise.all([
        demoApi.getDashboard(),
        demoApi.getFindings({ page: 1, page_size: 8 }),
      ]);
      setDashboard(dash);
      setFindings(findingsRes.items as Finding[]);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || "Failed to load demo data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <DemoSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!dashboard) return null;

  const { summary, service_breakdown, team_breakdown, daily_trend, ai_summary } = dashboard;
  const isUp = summary.cost_change_pct > 0;

  return (
    <>
      <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">
        {/* Demo banner */}
        <motion.div variants={fadeIn}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 border border-primary/25">
                <FlaskConical className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold text-foreground">Demo Data</h1>
                  <Badge variant="default" className="text-[10px] px-1.5 py-0 uppercase tracking-wide">
                    Demo
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Explore how Selavu Sherlock AI analyzes cloud cost and usage data.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 rounded-lg bg-secondary/50 border border-border">
                <Info className="w-3.5 h-3.5" />
                Read-only · Not your data
              </div>
              <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7">
                <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </motion.div>

        {/* AI Summary */}
        <motion.div variants={fadeIn}>
          <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/15">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 shrink-0 mt-0.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-primary mb-0.5">AI Summary</p>
              <p className="text-sm text-foreground leading-relaxed">{ai_summary}</p>
            </div>
          </div>
        </motion.div>

        {/* KPI Cards */}
        <motion.div variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Spend"
            value={formatCurrency(summary.total_cost, { compact: true })}
            sub={`${summary.period_days}-day period`}
            icon={DollarSign}
            iconColor="text-primary"
            iconBg="bg-primary/10"
            change={summary.cost_change_pct}
          />
          <KpiCard
            label="Potential Savings"
            value={formatCurrency(summary.potential_savings, { compact: true })}
            sub="per month, estimated"
            icon={TrendingUp}
            iconColor="text-green-400"
            iconBg="bg-green-400/10"
            highlight
          />
          <KpiCard
            label="Anomalies"
            value={summary.anomaly_count.toString()}
            sub="cost patterns flagged"
            icon={AlertTriangle}
            iconColor="text-orange-400"
            iconBg="bg-orange-400/10"
            alert={summary.anomaly_count > 0}
          />
          <KpiCard
            label="Opportunities"
            value={summary.opportunity_count.toString()}
            sub="optimization findings"
            icon={Zap}
            iconColor="text-yellow-400"
            iconBg="bg-yellow-400/10"
          />
        </motion.div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div variants={fadeIn} className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Cost Trend</CardTitle>
                <span className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  isUp ? "text-red-400" : "text-green-400"
                )}>
                  {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {formatPercent(Math.abs(summary.cost_change_pct))} vs prior period
                </span>
              </CardHeader>
              <CardContent>
                <CostTrendChart data={daily_trend} />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeIn}>
            <Card className="h-full">
              <CardHeader><CardTitle>By Service</CardTitle></CardHeader>
              <CardContent>
                <ServiceBreakdownChart data={service_breakdown} />
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Top findings */}
          <motion.div variants={fadeIn} className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Top Optimization Opportunities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {findings.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No findings detected
                  </p>
                ) : (
                  findings.slice(0, 6).map((f) => (
                    <FindingRow
                      key={f.id}
                      finding={f}
                      onViewEvidence={() => openEvidencePanel(f)}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Team breakdown */}
          <motion.div variants={fadeIn}>
            <Card className="h-full">
              <CardHeader><CardTitle>By Team</CardTitle></CardHeader>
              <CardContent>
                <TeamBreakdownChart data={team_breakdown} />
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>

      {/* Evidence panel — reuses the existing component wired to the app store */}
      <EvidencePanel isDemoMode />
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
            {change !== undefined && (
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
      <Button
        variant="ghost" size="icon-sm"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onViewEvidence}
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function DemoSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-14 w-full rounded-xl" />
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
      <p className="text-sm text-foreground mb-2">Failed to load demo data</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="w-3.5 h-3.5 mr-2" /> Retry
      </Button>
    </div>
  );
}
