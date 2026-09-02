import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Upload, CheckCircle, AlertCircle, Loader2, History,
  ChevronRight, RefreshCw, Cloud, FileCode, FileSpreadsheet,
  Settings, WifiOff, Wifi, AlertTriangle, X, Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/store/appStore";
import { datasetsApi, connectorsApi } from "@/services/api";
import { cn } from "@/lib/utils";
import type { CloudConnectorStatus, SourceType } from "@/types";

// ─── Source definitions ───────────────────────────────────────────────────────

const SOURCES = {
  standardized: [
    {
      id: "focus" as SourceType,
      name: "FOCUS",
      description: "Import standardized cost and usage data using the FOCUS schema.",
      category: "Standardized Cost & Usage Data",
      icon: FileCode,
      action: "import" as const,
      accepts: { "text/csv": [".csv"], "application/json": [".json"] },
      acceptLabel: "CSV or JSON",
    },
  ],
  userdata: [
    {
      id: "csv_upload" as SourceType,
      name: "CSV Upload",
      description: "Upload your own cost and usage dataset.",
      category: "User Data",
      icon: FileSpreadsheet,
      action: "upload" as const,
      accepts: { "text/csv": [".csv"] },
      acceptLabel: "CSV",
    },
  ],
  monitoring: [
    {
      id: "aws_cloudwatch" as SourceType,
      name: "AWS CloudWatch",
      description: "Connect AWS monitoring metrics for utilization-aware cost analysis.",
      category: "Cloud Monitoring",
      icon: Cloud,
      action: "connect" as const,
    },
    {
      id: "azure_monitor" as SourceType,
      name: "Azure Monitor",
      description: "Connect Azure monitoring metrics for resource utilization analysis.",
      category: "Cloud Monitoring",
      icon: Cloud,
      action: "connect" as const,
    },
    {
      id: "gcp_monitoring" as SourceType,
      name: "Google Cloud Monitoring",
      description: "Connect Google Cloud monitoring metrics for utilization analysis.",
      category: "Cloud Monitoring",
      icon: Cloud,
      action: "connect" as const,
    },
  ],
  billing: [
    {
      id: "gcp_billing" as SourceType,
      name: "Google Cloud Billing Export",
      description: "Import Google Cloud billing export data for cost analysis.",
      category: "Cloud Billing",
      icon: FileCode,
      action: "import" as const,
      accepts: { "text/csv": [".csv"], "application/json": [".json"] },
      acceptLabel: "CSV or JSON",
    },
  ],
};

// ─── Main page ────────────────────────────────────────────────────────────────

export function DataSourcesPage() {
  const { refreshDatasets, setActiveDataset } = useAppStore();
  const [connectorStatuses, setConnectorStatuses] = useState<CloudConnectorStatus[]>([]);
  const [activeImport, setActiveImport] = useState<SourceType | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    refreshDatasets();
    connectorsApi.getAllStatuses()
      .then(setConnectorStatuses)
      .catch(console.error);
  }, []);

  const getConnectorStatus = (type: SourceType): CloudConnectorStatus | undefined =>
    connectorStatuses.find((c) => c.connector_type === type);

  const handleImportSuccess = async (datasetId: number) => {
    setActiveImport(null);
    await refreshDatasets();
    setActiveDataset(datasetId);
    // Stay on Data Sources page — do NOT navigate away
  };

  const handleConnectorStatusUpdate = (updated: CloudConnectorStatus) => {
    setConnectorStatuses((prev) =>
      prev.map((c) => c.connector_type === updated.connector_type ? updated : c)
    );
  };

  return (
    <div className="max-w-3xl space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Data Sources</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Import cost and usage data or connect cloud monitoring services.
        </p>
      </div>

      {/* ── Section: Standardized Data ── */}
      <Section label="Standardized Data">
        {SOURCES.standardized.map((src) => (
          <ImportSourceCard
            key={src.id}
            source={src}
            isActive={activeImport === src.id}
            onActivate={() => setActiveImport(activeImport === src.id ? null : src.id)}
            onSuccess={handleImportSuccess}
          />
        ))}
      </Section>

      {/* ── Section: User Data ── */}
      <Section label="User Data">
        {SOURCES.userdata.map((src) => (
          <ImportSourceCard
            key={src.id}
            source={src}
            isActive={activeImport === src.id}
            onActivate={() => setActiveImport(activeImport === src.id ? null : src.id)}
            onSuccess={handleImportSuccess}
          />
        ))}
      </Section>

      {/* ── Section: Cloud Monitoring ── */}
      <Section label="Cloud Monitoring">
        {SOURCES.monitoring.map((src) => (
          <ConnectorCard
            key={src.id}
            source={src}
            connectorStatus={getConnectorStatus(src.id)}
            onStatusUpdate={handleConnectorStatusUpdate}
          />
        ))}
      </Section>

      {/* ── Section: Cloud Billing ── */}
      <Section label="Cloud Billing">
        {SOURCES.billing.map((src) => (
          <ImportSourceCard
            key={src.id}
            source={src}
            isActive={activeImport === src.id}
            onActivate={() => setActiveImport(activeImport === src.id ? null : src.id)}
            onSuccess={handleImportSuccess}
          />
        ))}
      </Section>

      <Separator />

      {/* Dataset History link */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Dataset History</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            View all imported datasets and their analysis results
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/history")}>
          <History className="w-3.5 h-3.5 mr-1.5" />
          View Dataset History
          <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ─── Import source card (FOCUS, CSV, GCP Billing) ─────────────────────────────

type ImportSource = {
  id: SourceType;
  name: string;
  description: string;
  icon: React.ElementType;
  action: "import" | "upload";
  accepts: Record<string, string[]>;
  acceptLabel: string;
};

function ImportSourceCard({
  source, isActive, onActivate, onSuccess,
}: {
  source: ImportSource;
  isActive: boolean;
  onActivate: () => void;
  onSuccess: (datasetId: number) => void;
}) {
  const Icon = source.icon;
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      setName(accepted[0].name.replace(/\.[^.]+$/, ""));
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: source.accepts,
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024, // 100 MB
    disabled: uploading,
  });

  const handleSubmit = async () => {
    if (!file || !name.trim()) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      let dataset;
      if (source.id === "focus") {
        dataset = await datasetsApi.importFocus(file, name.trim(), undefined, setProgress);
      } else if (source.id === "gcp_billing") {
        dataset = await datasetsApi.importGcpBilling(file, name.trim(), undefined, setProgress);
      } else {
        dataset = await datasetsApi.importCsv(file, name.trim(), undefined, setProgress);
      }
      setProgress(100);
      onSuccess(dataset.id);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const buttonLabel = source.action === "import" ? "Import" : "Upload Dataset";

  return (
    <Card className={cn(
      "transition-colors",
      isActive && "border-primary/30",
    )}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary border border-border shrink-0">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{source.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {source.description}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={isActive ? "outline" : "default"}
            className="shrink-0 h-8"
            onClick={onActivate}
            disabled={uploading}
          >
            {isActive ? (
              <><X className="w-3.5 h-3.5 mr-1.5" />Cancel</>
            ) : (
              buttonLabel
            )}
          </Button>
        </div>

        {/* Expanded import panel */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-4 space-y-3">
                {/* Drop zone */}
                <div
                  {...getRootProps()}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all",
                    isDragActive ? "border-primary bg-primary/5" :
                    file ? "border-green-400/40 bg-green-400/5" :
                    "border-border hover:border-primary/30 hover:bg-secondary/30",
                    uploading && "pointer-events-none opacity-60",
                  )}
                >
                  <input {...getInputProps()} />
                  {file ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <CheckCircle className="w-6 h-6 text-green-400" />
                      <p className="text-sm font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(0)} KB
                      </p>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                        onClick={(e) => { e.stopPropagation(); setFile(null); setName(""); }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                      <p className="text-sm text-foreground">
                        {isDragActive ? "Drop here" : "Drag & drop or click to browse"}
                      </p>
                      <p className="text-xs text-muted-foreground">{source.acceptLabel} · max 100 MB</p>
                    </div>
                  )}
                </div>

                {/* Name input */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Dataset name</Label>
                  <Input
                    placeholder="e.g. August 2024 Cloud Costs"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={uploading}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Progress */}
                {uploading && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Importing and analyzing…</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-1" />
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 text-xs text-destructive p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  disabled={!file || !name.trim() || uploading}
                  size="sm"
                  className="w-full h-8 text-xs"
                >
                  {uploading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Processing…</>
                    : <><Upload className="w-3.5 h-3.5 mr-1.5" />{buttonLabel}</>}
                </Button>

                {/* Schema reference for CSV/FOCUS */}
                {(source.id === "csv_upload" || source.id === "focus") && (
                  <SchemaReference sourceId={source.id} />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ─── Connector card (AWS / Azure / GCP Monitoring) ────────────────────────────

type ConnectorSource = {
  id: SourceType;
  name: string;
  description: string;
  icon: React.ElementType;
  action: "connect";
};

function ConnectorCard({
  source, connectorStatus, onStatusUpdate,
}: {
  source: ConnectorSource;
  connectorStatus: CloudConnectorStatus | undefined;
  onStatusUpdate: (s: CloudConnectorStatus) => void;
}) {
  const Icon = source.icon;
  const [showConfig, setShowConfig] = useState(false);
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const status = connectorStatus?.status ?? "not_connected";
  const lastError = connectorStatus?.last_error;

  const statusConfig = {
    not_connected: {
      label: "Not Connected",
      icon: WifiOff,
      color: "text-muted-foreground",
      badge: "outline" as const,
    },
    configuration_required: {
      label: "Configuration Required",
      icon: Settings,
      color: "text-yellow-400",
      badge: "warning" as const,
    },
    connected: {
      label: "Connected",
      icon: Wifi,
      color: "text-green-400",
      badge: "success" as const,
    },
    error: {
      label: "Error",
      icon: AlertTriangle,
      color: "text-red-400",
      badge: "destructive" as const,
    },
  };
  const sc = statusConfig[status];
  const StatusIcon = sc.icon;

  const configPlaceholders: Record<string, Record<string, string>> = {
    aws_cloudwatch: { region: "us-east-1", account_id: "123456789012" },
    azure_monitor: { subscription_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", resource_group: "my-rg" },
    gcp_monitoring: { project_id: "my-gcp-project" },
  };
  const placeholders = configPlaceholders[source.id] ?? {};

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      if (Object.keys(configFields).length > 0) {
        await connectorsApi.configure(source.id, configFields);
      }
      const result = await connectorsApi.verify(source.id);
      onStatusUpdate(result as CloudConnectorStatus);
      if (result.status === "error") {
        setVerifyError(result.last_error || "Connection failed");
      } else {
        setShowConfig(false);
      }
    } catch (e: any) {
      setVerifyError(e.response?.data?.detail || e.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await connectorsApi.disconnect(source.id);
      onStatusUpdate({
        connector_type: source.id,
        status: "not_connected",
        display_name: source.name,
      });
      setShowConfig(false);
    } catch (e) { console.error(e); }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary border border-border shrink-0">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{source.name}</p>
                <Badge variant={sc.badge} className="text-[10px] px-1.5 py-0 flex items-center gap-1">
                  <StatusIcon className="w-2.5 h-2.5" />
                  {sc.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {source.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {status === "connected" && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                onClick={handleDisconnect}>
                Disconnect
              </Button>
            )}
            <Button
              size="sm"
              variant={showConfig ? "outline" : "default"}
              className="h-8"
              onClick={() => setShowConfig(!showConfig)}
            >
              {showConfig ? (
                <><X className="w-3.5 h-3.5 mr-1.5" />Cancel</>
              ) : (
                "Connect"
              )}
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {showConfig && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-4 space-y-3">
                {/* Credentials notice */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
                  <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Credentials (API keys, access tokens) must be configured as environment
                    variables in the backend — they are never submitted through this form.
                    Only non-secret configuration is entered here.
                  </p>
                </div>

                {/* Non-secret config fields */}
                {Object.entries(placeholders).map(([key, placeholder]) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs capitalize">{key.replace(/_/g, " ")}</Label>
                    <Input
                      placeholder={placeholder}
                      value={configFields[key] ?? ""}
                      onChange={(e) =>
                        setConfigFields((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="h-8 text-xs"
                      disabled={verifying}
                    />
                  </div>
                ))}

                {/* Error from last verify */}
                {(verifyError || lastError) && (
                  <div className="flex items-start gap-2 text-xs text-destructive p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{verifyError || lastError}</span>
                  </div>
                )}

                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={handleVerify}
                  disabled={verifying}
                >
                  {verifying
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Verifying…</>
                    : <>Test Connection</>}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ─── Schema reference (CSV / FOCUS) ──────────────────────────────────────────

function SchemaReference({ sourceId }: { sourceId: SourceType }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-secondary/20 space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {sourceId === "focus" ? "FOCUS Schema" : "Required Columns"}
      </p>
      <div className="flex flex-wrap gap-1">
        {["date", "service", "cost"].map((c) => (
          <code key={c} className="text-[11px] text-primary bg-primary/10 rounded px-1.5 py-0.5 font-mono">
            {c}
          </code>
        ))}
        <span className="text-[11px] text-muted-foreground self-center mx-1">+optional:</span>
        {["team", "resource_id", "cpu_utilization_avg", "usage_quantity", "region"].map((c) => (
          <code key={c} className="text-[11px] text-muted-foreground bg-secondary rounded px-1.5 py-0.5 font-mono">
            {c}
          </code>
        ))}
      </div>
      <div className="font-mono text-[11px] text-muted-foreground bg-background rounded p-2 overflow-x-auto">
        <div className="text-primary">date,service,cost,team,resource_id,cpu_utilization_avg</div>
        <div>2024-09-01,Compute / EC2,142.50,platform,i-0abc123,8.2</div>
        <div>2024-09-02,Database / RDS,98.75,backend,db-prod-01,32.1</div>
      </div>
    </div>
  );
}
