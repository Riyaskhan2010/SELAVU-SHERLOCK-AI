// ─── Auth ──────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  email: string;
  full_name: string;
  firebase_uid?: string;
  is_active: boolean;
  created_at: string;
}

// ─── Dataset ───────────────────────────────────────────────────────────────
export type DatasetStatus = "pending" | "processing" | "ready" | "error";

export type SourceType =
  | "focus"
  | "csv_upload"
  | "aws_cloudwatch"
  | "azure_monitor"
  | "gcp_monitoring"
  | "gcp_billing";

export type ConnectorStatus =
  | "not_connected"
  | "configuration_required"
  | "connected"
  | "error";

export interface Dataset {
  id: number;
  name: string;
  description?: string;
  status: DatasetStatus;
  source_type: SourceType;
  source_name?: string;
  source_filename?: string;
  row_count: number;
  total_cost: number;
  date_range_start?: string;
  date_range_end?: string;
  created_at: string;
  updated_at: string;
}

export interface DatasetHistoryItem extends Dataset {
  opportunity_count: number;
  anomaly_count: number;
  potential_savings: number;
  annualized_savings: number;
}

export interface CloudConnectorStatus {
  connector_type: SourceType;
  status: ConnectorStatus;
  display_name?: string;
  last_verified_at?: string;
  last_error?: string;
}

// ─── Cost Records ─────────────────────────────────────────────────────────
export interface CostRecord {
  id: number;
  dataset_id: number;
  date: string;
  service: string;
  resource_id?: string;
  resource_name?: string;
  team?: string;
  environment?: string;
  region?: string;
  cost: number;
  usage_quantity?: number;
  usage_unit?: string;
  tags?: Record<string, string>;
}

// ─── Analysis ─────────────────────────────────────────────────────────────
export interface CostSummary {
  total_cost: number;
  period_days: number;
  daily_average: number;
  cost_change_pct: number;
  previous_period_cost: number;
  potential_savings: number;
  anomaly_count: number;
  opportunity_count: number;
}

export interface ServiceBreakdown {
  service: string;
  cost: number;
  percentage: number;
  change_pct: number;
}

export interface TeamBreakdown {
  team: string;
  cost: number;
  percentage: number;
}

export interface DailyTrend {
  date: string;
  cost: number;
  is_anomaly: boolean;
  anomaly_score?: number;
}

export interface DashboardData {
  summary: CostSummary;
  service_breakdown: ServiceBreakdown[];
  team_breakdown: TeamBreakdown[];
  daily_trend: DailyTrend[];
  ai_summary: string;
}

// ─── Findings ─────────────────────────────────────────────────────────────
export type FindingType =
  | "underutilization"
  | "cost_spike"
  | "idle_resource"
  | "rightsizing"
  | "scheduling"
  | "reserved_instance"
  | "data_transfer"
  | "storage_optimization"
  | "anomaly";

export type Priority = "critical" | "high" | "medium" | "low";

export interface EvidenceMetric {
  label: string;
  observed_value: string | number;
  unit?: string;
  threshold?: string | number;
  flagged: boolean;
}

export interface SavingsCalculation {
  current_cost: number;
  optimized_cost: number;
  potential_saving: number;
  saving_pct: number;
  annualized_saving: number;
  assumption: string;
}

export interface Finding {
  id: number;
  dataset_id: number;
  finding_type: FindingType;
  title: string;
  description: string;
  service: string;
  resource_id?: string;
  resource_name?: string;
  team?: string;
  priority: Priority;
  confidence: number;
  current_cost: number;
  potential_saving: number;
  annualized_saving: number;
  evidence_metrics: EvidenceMetric[];
  savings_calculation: SavingsCalculation;
  assumption: string;
  ai_explanation?: string;
  recommendation: string;
  is_anomaly: boolean;
  anomaly_score?: number;
  detection_method: string;
  created_at: string;
}

// ─── Anomaly ─────────────────────────────────────────────────────────────
export interface Anomaly {
  id: number;
  date: string;
  service: string;
  team?: string;
  cost: number;
  expected_cost: number;
  deviation_pct: number;
  anomaly_score: number;
  severity: "critical" | "high" | "medium" | "low";
  detection_method: string;
  description: string;
  finding_id?: number;
}

// ─── AI Chat ─────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: string[];
  conversation_id?: string;
}

export interface ChatRequest {
  message: string;
  dataset_id?: number;
  conversation_id?: string;
}

// ─── Chat History ─────────────────────────────────────────────────────────
export interface Conversation {
  id: number;
  title: string;
  dataset_id?: number | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message?: string | null;
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
}

export interface ConversationMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// ─── Upload ───────────────────────────────────────────────────────────────
export interface UploadProgress {
  stage: "uploading" | "validating" | "processing" | "analyzing" | "done" | "error";
  progress: number;
  message: string;
  error?: string;
}

// ─── API Response ────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
