import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  History, Trash2, ExternalLink, Loader2, AlertCircle,
  FileText, Calendar, Database, TrendingUp, AlertTriangle,
  Zap, RefreshCw, ChevronRight, CheckCircle, Clock,
  BarChart2, Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/store/appStore";
import { datasetsApi } from "@/services/api";
import { formatCurrency, cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import type { DatasetHistoryItem } from "@/types";

export function DatasetHistoryPage() {
  const { setActiveDataset, activeDatasetId, removeDataset } = useAppStore();
  const [items, setItems] = useState<DatasetHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const data = await datasetsApi.history();
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleOpen = (item: DatasetHistoryItem) => {
    setActiveDataset(item.id);
    navigate("/dashboard");
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await datasetsApi.delete(id);
      removeDataset(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Dataset History
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All your uploaded datasets with their saved analysis results
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary bar */}
      {!loading && items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <StatCard
            label="Total Datasets"
            value={items.length.toString()}
            icon={Database}
            color="text-primary"
          />
          <StatCard
            label="Total Spend"
            value={formatCurrency(items.reduce((s, i) => s + i.total_cost, 0), { compact: true })}
            icon={BarChart2}
            color="text-foreground"
          />
          <StatCard
            label="Total Potential Savings"
            value={formatCurrency(items.reduce((s, i) => s + i.potential_savings, 0), { compact: true })}
            icon={TrendingUp}
            color="text-green-400"
          />
          <StatCard
            label="Total Findings"
            value={items.reduce((s, i) => s + i.opportunity_count, 0).toString()}
            icon={Zap}
            color="text-yellow-400"
          />
        </motion.div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyHistory />
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
              >
                <HistoryCard
                  item={item}
                  isActive={item.id === activeDatasetId}
                  isDeleting={deletingId === item.id}
                  confirmDelete={confirmDeleteId === item.id}
                  onOpen={() => handleOpen(item)}
                  onDelete={() => handleDelete(item.id)}
                  onRequestDelete={() => setConfirmDeleteId(item.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onNavigate={(path) => {
                    setActiveDataset(item.id);
                    navigate(path);
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── HistoryCard ──────────────────────────────────────────────────────────────

function HistoryCard({
  item, isActive, isDeleting, confirmDelete,
  onOpen, onDelete, onRequestDelete, onCancelDelete, onNavigate,
}: {
  item: DatasetHistoryItem;
  isActive: boolean;
  isDeleting: boolean;
  confirmDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onNavigate: (path: string) => void;
}) {
  const isReady = item.status === "ready";
  const dateRange = item.date_range_start && item.date_range_end
    ? `${item.date_range_start} → ${item.date_range_end}`
    : null;

  const statusConfig = {
    ready: { label: "Ready", icon: CheckCircle, color: "text-green-400", badge: "success" as const },
    processing: { label: "Processing", icon: Loader2, color: "text-yellow-400", badge: "warning" as const },
    error: { label: "Error", icon: AlertCircle, color: "text-red-400", badge: "destructive" as const },
    pending: { label: "Pending", icon: Clock, color: "text-muted-foreground", badge: "outline" as const },
  };
  const sc = statusConfig[item.status] ?? statusConfig.pending;
  const StatusIcon = sc.icon;

  return (
    <Card className={cn(
      "transition-colors",
      isActive && "border-primary/30 bg-primary/5",
      !isActive && "hover:border-border/80",
    )}>
      <CardContent className="p-5">
        {/* Top row: name + actions */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              "flex items-center justify-center w-9 h-9 rounded-lg border shrink-0 mt-0.5",
              isActive ? "bg-primary/15 border-primary/30" : "bg-secondary border-border"
            )}>
              <Database className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <h3 className="text-sm font-semibold text-foreground">{item.name}</h3>
                {isActive && (
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">Active</Badge>
                )}
                {item.source_name && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {item.source_name}
                  </Badge>
                )}
                <Badge variant={sc.badge} className="text-[10px] px-1.5 py-0 flex items-center gap-1">
                  <StatusIcon className={cn("w-2.5 h-2.5", item.status === "processing" && "animate-spin")} />
                  {sc.label}
                </Badge>
              </div>
              {item.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
              )}
              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                {item.source_filename && (
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {item.source_filename}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Uploaded {format(parseISO(item.created_at), "MMM d, yyyy 'at' h:mm a")}
                </span>
                {dateRange && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {dateRange}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {isReady && (
              <Button variant="subtle" size="sm" onClick={onOpen} className="h-7 text-xs">
                Open
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            )}
            {!confirmDelete ? (
              <Button
                variant="ghost" size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={onRequestDelete}
                disabled={isDeleting}
              >
                {isDeleting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </Button>
            ) : (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-1.5">
                <span className="text-xs text-destructive">Delete?</span>
                <Button size="sm" variant="destructive" className="h-6 text-[11px] px-2" onClick={onDelete}>
                  Yes
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={onCancelDelete}>
                  No
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <MiniStat label="Records" value={item.row_count.toLocaleString()} />
          <MiniStat label="Total Spend" value={formatCurrency(item.total_cost, { compact: true })} />
          <MiniStat
            label="Potential Savings"
            value={formatCurrency(item.potential_savings, { compact: true })}
            valueClass="text-green-400"
          />
          <MiniStat label="Annualized" value={formatCurrency(item.annualized_savings, { compact: true })} />
        </div>

        {/* Findings summary row */}
        <div className="flex items-center gap-4 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            <span>{item.anomaly_count} anomalies</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            <span>{item.opportunity_count} opportunities</span>
          </div>

          {isReady && (
            <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
              {[
                { label: "Cost Analysis", path: "/cost-analysis" },
                { label: "Anomalies", path: "/anomalies" },
                { label: "Optimization", path: "/optimization" },
                { label: "AI Assistant", path: "/ai-assistant" },
              ].map(({ label, path }) => (
                <button
                  key={path}
                  onClick={() => onNavigate(path)}
                  className="text-[11px] text-primary hover:underline px-1"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MiniStat({ label, value, valueClass }: {
  label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="bg-secondary/40 rounded-lg p-2.5 border border-border">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className={cn("text-sm font-semibold text-foreground", valueClass)}>{value}</p>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("w-3.5 h-3.5", color)} />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
        <p className={cn("text-lg font-bold", color)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyHistory() {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center mb-4">
        <History className="w-7 h-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">No dataset history</h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-xs">
        Upload your first cost dataset to start building your history. Every dataset and its analysis is saved here permanently.
      </p>
      <Button onClick={() => navigate("/data-sources")}>
        Upload a dataset
      </Button>
    </motion.div>
  );
}
