import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, CheckCircle, AlertTriangle, TrendingDown, ArrowRight,
  Sparkles, Loader2, Info, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/store/appStore";
import { findingsApi, demoApi } from "@/services/api";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import type { Finding } from "@/types";

export function EvidencePanel({ isDemoMode = false }: { isDemoMode?: boolean }) {
  const { isEvidencePanelOpen, selectedFinding, closeEvidencePanel } = useAppStore();
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  useEffect(() => {
    if (isEvidencePanelOpen && selectedFinding) {
      setExplanation(selectedFinding.ai_explanation || null);
      if (!selectedFinding.ai_explanation) {
        fetchExplanation(selectedFinding.id);
      }
    }
  }, [isEvidencePanelOpen, selectedFinding?.id]);

  const fetchExplanation = async (id: number) => {
    setLoadingExplanation(true);
    try {
      const api = isDemoMode ? demoApi : findingsApi;
      const { explanation } = await api.explainFinding(id);
      setExplanation(explanation);
    } catch {
      setExplanation("AI explanation unavailable. Review evidence data above.");
    } finally {
      setLoadingExplanation(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isEvidencePanelOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-30"
            onClick={closeEvidencePanel}
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {isEvidencePanelOpen && selectedFinding && (
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 h-screen w-full max-w-lg z-40 bg-card border-l border-border shadow-2xl flex flex-col"
          >
            <PanelContent
              finding={selectedFinding}
              explanation={explanation}
              loadingExplanation={loadingExplanation}
              onClose={closeEvidencePanel}
            />
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function PanelContent({
  finding, explanation, loadingExplanation, onClose,
}: {
  finding: Finding;
  explanation: string | null;
  loadingExplanation: boolean;
  onClose: () => void;
}) {
  const calc = finding.savings_calculation as any;
  const priorityVariant = finding.priority as "critical" | "high" | "medium" | "low";

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={priorityVariant}>{finding.priority}</Badge>
            <Badge variant="outline" className="capitalize text-[10px]">
              {finding.finding_type.replace(/_/g, " ")}
            </Badge>
          </div>
          <h2 className="text-base font-semibold text-foreground leading-snug">{finding.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{finding.service}
            {finding.team && <> · <span className="capitalize">{finding.team}</span> team</>}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-5 py-4 space-y-5">

          {/* Cost / Savings summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary/50 rounded-xl p-3.5 border border-border">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Current Cost</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(finding.current_cost)}</p>
              <p className="text-[11px] text-muted-foreground">per month</p>
            </div>
            <div className="bg-green-400/5 rounded-xl p-3.5 border border-green-400/15">
              <p className="text-[10px] font-medium text-green-400 uppercase tracking-wide mb-1">Potential Savings</p>
              <p className="text-xl font-bold text-green-400">{formatCurrency(finding.potential_saving)}</p>
              <p className="text-[11px] text-muted-foreground">per month, estimated</p>
            </div>
          </div>

          {/* Annualized + Confidence */}
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Annualized Potential</p>
              <p className="text-sm font-semibold text-foreground">{formatCurrency(finding.annualized_saving)}/year</p>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Confidence</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Progress value={finding.confidence} className="w-20 h-1.5"
                  indicatorClassName={finding.confidence >= 85 ? "bg-green-400" : "bg-yellow-400"} />
                <span className="text-sm font-semibold text-foreground">{finding.confidence.toFixed(0)}%</span>
              </div>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Detection</p>
              <p className="text-xs text-foreground capitalize">{finding.detection_method.split(":").pop()?.replace(/_/g, " ")}</p>
            </div>
          </div>

          <Separator />

          {/* Evidence Metrics */}
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-primary" />
              Evidence
            </h3>
            <div className="space-y-2">
              {finding.evidence_metrics.map((m: any, i: number) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm",
                    m.flagged
                      ? "bg-orange-400/5 border-orange-400/20"
                      : "bg-secondary/30 border-border"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {m.flagged
                      ? <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      : <CheckCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <span className="text-muted-foreground">{m.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-semibold", m.flagged ? "text-orange-400" : "text-foreground")}>
                      {typeof m.observed_value === "number" && m.unit === "USD"
                        ? formatCurrency(m.observed_value)
                        : m.observed_value}
                      {m.unit && m.unit !== "USD" && ` ${m.unit}`}
                    </span>
                    {m.threshold !== undefined && m.threshold !== null && (
                      <span className="text-[11px] text-muted-foreground">
                        (threshold: {m.threshold}{m.unit && m.unit !== "USD" ? m.unit : ""})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Savings Calculation */}
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-green-400" />
              Savings Calculation
            </h3>
            <div className="bg-secondary/30 rounded-xl p-4 border border-border">
              <div className="flex items-center gap-3 text-sm">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Current</p>
                  <p className="font-semibold text-foreground">{formatCurrency(calc?.current_cost ?? finding.current_cost)}</p>
                </div>
                <div className="text-muted-foreground">−</div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Optimized</p>
                  <p className="font-semibold text-foreground">{formatCurrency(calc?.optimized_cost ?? 0)}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-[10px] text-green-400 uppercase tracking-wide mb-1">Potential Saving</p>
                  <p className="font-bold text-green-400">{formatCurrency(calc?.potential_saving ?? finding.potential_saving)}</p>
                </div>
              </div>
              {calc?.saving_pct && (
                <div className="mt-3 pt-3 border-t border-border">
                  <Progress value={calc.saving_pct} className="h-1.5" indicatorClassName="bg-green-400" />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatPercent(calc.saving_pct)} estimated reduction
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Assumption */}
          <div className="flex gap-2.5 p-3 rounded-lg bg-secondary/30 border border-border">
            <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Assumption</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{finding.assumption}</p>
            </div>
          </div>

          <Separator />

          {/* AI Explanation */}
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              AI Explanation
            </h3>
            <div className="bg-primary/5 rounded-xl p-4 border border-primary/15 min-h-[80px]">
              {loadingExplanation ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating explanation...
                </div>
              ) : explanation ? (
                <p className="text-sm text-foreground leading-relaxed">{explanation}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No explanation available.</p>
              )}
            </div>
          </div>

          {/* Recommendation */}
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Recommendation</h3>
            <p className="text-sm text-foreground leading-relaxed">{finding.recommendation}</p>
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border flex gap-2 shrink-0">
        <Button variant="subtle" size="sm" className="flex-1">
          Mark reviewed
        </Button>
        <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
          Close
        </Button>
      </div>
    </>
  );
}
