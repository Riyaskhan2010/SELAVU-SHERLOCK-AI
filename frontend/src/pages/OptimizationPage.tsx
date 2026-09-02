import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Zap, ChevronRight, Filter, TrendingDown, RefreshCw, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/store/appStore";
import { findingsApi } from "@/services/api";
import { formatCurrency, cn } from "@/lib/utils";
import type { Finding } from "@/types";

export function OptimizationPage() {
  const { activeDatasetId, openEvidencePanel } = useAppStore();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(false);
  const [priority, setPriority] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const load = async () => {
    if (!activeDatasetId) return;
    setLoading(true);
    try {
      const res = await findingsApi.list(activeDatasetId, {
        priority: priority === "all" ? undefined : priority,
        type: type === "all" ? undefined : type,
        page_size: 50,
      });
      setFindings(res.items);
      setTotal(res.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [activeDatasetId, priority, type]);

  const filtered = findings.filter((f) =>
    !search || f.title.toLowerCase().includes(search.toLowerCase()) ||
    f.service.toLowerCase().includes(search.toLowerCase())
  );

  const totalSavings = filtered.reduce((s, f) => s + f.potential_saving, 0);
  const annualizedTotal = filtered.reduce((s, f) => s + f.annualized_saving, 0);

  if (!activeDatasetId) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <Zap className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Select a dataset to view optimization opportunities</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Optimization Opportunities</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Each finding is backed by evidence and a traceable savings calculation
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Savings summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-green-400/15">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium text-green-400 uppercase tracking-wide mb-1">Monthly Potential</p>
            <p className="text-2xl font-bold text-green-400">{formatCurrency(totalSavings, { compact: true })}</p>
            <p className="text-xs text-muted-foreground">estimated potential savings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Annualized</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(annualizedTotal, { compact: true })}</p>
            <p className="text-xs text-muted-foreground">projected yearly impact</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search findings..."
            className="h-8 pl-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="underutilization">Underutilization</SelectItem>
            <SelectItem value="cost_spike">Cost spike</SelectItem>
            <SelectItem value="idle_resource">Idle resource</SelectItem>
            <SelectItem value="anomaly">Anomaly</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} findings</span>
      </div>

      {/* Findings list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
            >
              <FindingCard finding={f} onViewEvidence={() => openEvidencePanel(f)} />
            </motion.div>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <TrendingDown className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No findings match your filters</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FindingCard({ finding, onViewEvidence }: { finding: Finding; onViewEvidence: () => void }) {
  const priorityVariant = finding.priority as "critical" | "high" | "medium" | "low";
  const calc = finding.savings_calculation as any;

  return (
    <Card className={cn(
      "group hover:border-border/80 transition-colors",
      finding.priority === "critical" && "border-red-400/15",
      finding.priority === "high" && "border-orange-400/10",
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Priority bar */}
          <div className={cn(
            "w-0.5 self-stretch rounded-full shrink-0",
            finding.priority === "critical" ? "bg-red-400" :
              finding.priority === "high" ? "bg-orange-400" :
                finding.priority === "medium" ? "bg-yellow-400" : "bg-green-400",
          )} />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant={priorityVariant} className="text-[10px]">{finding.priority}</Badge>
              <Badge variant="outline" className="text-[10px] capitalize">
                {finding.finding_type.replace(/_/g, " ")}
              </Badge>
              {finding.team && (
                <span className="text-[10px] text-muted-foreground capitalize">{finding.team}</span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">{finding.title}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{finding.description}</p>

            {/* Evidence preview */}
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                <span className="text-foreground font-medium">{finding.service}</span>
              </span>
              {finding.evidence_metrics.find((m: any) => m.label.toLowerCase().includes("cpu")) && (
                <span className="text-muted-foreground">
                  Avg CPU:{" "}
                  <span className="text-orange-400 font-medium">
                    {(finding.evidence_metrics.find((m: any) => m.label.toLowerCase().includes("average cpu")) as any)?.observed_value}%
                  </span>
                </span>
              )}
              <span className="text-muted-foreground">
                Confidence: <span className="text-foreground font-medium">{finding.confidence.toFixed(0)}%</span>
              </span>
            </div>

            {/* Savings bar */}
            {calc?.saving_pct > 0 && (
              <div className="mt-3">
                <Progress
                  value={calc.saving_pct}
                  className="h-1"
                  indicatorClassName="bg-green-400"
                />
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="text-right shrink-0 space-y-1">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Current cost</p>
              <p className="text-sm font-medium text-foreground">{formatCurrency(finding.current_cost)}/mo</p>
            </div>
            <div>
              <p className="text-[10px] text-green-400 uppercase">Potential saving</p>
              <p className="text-base font-bold text-green-400">{formatCurrency(finding.potential_saving)}/mo</p>
            </div>
            <Button
              variant="subtle"
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={onViewEvidence}
            >
              View Evidence
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
