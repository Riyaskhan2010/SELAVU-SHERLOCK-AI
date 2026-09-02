import axios, { type AxiosInstance, type AxiosError } from "axios";
import type {
  User, Dataset, DatasetHistoryItem, CloudConnectorStatus,
  DashboardData, Finding, Anomaly, ChatMessage, ChatRequest,
  Conversation, ConversationDetail,
  PaginatedResponse,
} from "@/types";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

// ─── Axios instance ───────────────────────────────────────────────────────
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// Request interceptor — attach Firebase ID token
api.interceptors.request.use(async (config) => {
  // Try Firebase ID token first (new auth)
  const firebaseToken = sessionStorage.getItem("firebase_id_token");
  if (firebaseToken) {
    // Refresh the token if it's close to expiry (Firebase handles this automatically)
    try {
      const { firebaseAuth } = await import("@/lib/firebase");
      if (firebaseAuth.currentUser) {
        const fresh = await firebaseAuth.currentUser.getIdToken();
        sessionStorage.setItem("firebase_id_token", fresh);
        config.headers.Authorization = `Bearer ${fresh}`;
      } else {
        config.headers.Authorization = `Bearer ${firebaseToken}`;
      }
    } catch {
      config.headers.Authorization = `Bearer ${firebaseToken}`;
    }
    return config;
  }

  // Fallback: legacy custom token (existing sessions until they expire)
  const legacyToken = localStorage.getItem("access_token");
  if (legacyToken) {
    config.headers.Authorization = `Bearer ${legacyToken}`;
  }
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Only clear the OLD legacy custom-auth token.
      // NEVER clear the Firebase ID token — Firebase manages its own session.
      // Clearing it here was causing the AI Assistant (and all other endpoints)
      // to lose auth after any first 401 response.
      localStorage.removeItem("access_token");
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────
export const authApi = {
  // Registration and login are handled by Firebase SDK on the frontend.
  // This endpoint just returns the backend User record for the authenticated Firebase user.
  me: async (): Promise<User> => {
    const { data } = await api.get<User>("/auth/me");
    return data;
  },
};

// ─── Datasets ─────────────────────────────────────────────────────────────
export const datasetsApi = {
  list: async (): Promise<Dataset[]> => {
    const { data } = await api.get<Dataset[]>("/datasets");
    return data;
  },

  history: async (): Promise<DatasetHistoryItem[]> => {
    const { data } = await api.get<DatasetHistoryItem[]>("/datasets/history");
    return data;
  },

  get: async (id: number): Promise<Dataset> => {
    const { data } = await api.get<Dataset>(`/datasets/${id}`);
    return data;
  },

  /** Import a FOCUS-compatible file */
  importFocus: async (
    file: File, name: string, description?: string,
    onProgress?: (pct: number) => void,
  ): Promise<Dataset> => {
    return _uploadDataset("/datasets/import/focus", file, name, description, onProgress);
  },

  /** Upload a CSV file */
  importCsv: async (
    file: File, name: string, description?: string,
    onProgress?: (pct: number) => void,
  ): Promise<Dataset> => {
    return _uploadDataset("/datasets/import/csv", file, name, description, onProgress);
  },

  /** Import a GCP Billing export */
  importGcpBilling: async (
    file: File, name: string, description?: string,
    onProgress?: (pct: number) => void,
  ): Promise<Dataset> => {
    return _uploadDataset("/datasets/import/gcp_billing", file, name, description, onProgress);
  },

  /** Legacy upload — maps to csv_upload on backend */
  upload: async (
    file: File, name: string, description?: string,
    onProgress?: (pct: number) => void,
  ): Promise<Dataset> => {
    return _uploadDataset("/datasets/upload", file, name, description, onProgress);
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/datasets/${id}`);
  },

  analyze: async (id: number): Promise<{ task_id: string }> => {
    const { data } = await api.post<{ task_id: string }>(`/datasets/${id}/analyze`);
    return data;
  },
};

async function _uploadDataset(
  endpoint: string,
  file: File,
  name: string,
  description?: string,
  onProgress?: (pct: number) => void,
): Promise<Dataset> {
  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  if (description) form.append("description", description);
  const { data } = await api.post<Dataset>(endpoint, form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

// ─── Demo Data (shared read-only, not user-owned) ─────────────────────────
export const demoApi = {
  getDashboard: async (): Promise<DashboardData> => {
    const { data } = await api.get<DashboardData>("/demo/dashboard");
    return data;
  },

  getFindings: async (params?: {
    priority?: string; page?: number; page_size?: number;
  }): Promise<PaginatedResponse<Finding>> => {
    const { data } = await api.get<PaginatedResponse<Finding>>("/demo/findings", { params });
    return data;
  },

  getFinding: async (id: number): Promise<Finding> => {
    const { data } = await api.get<Finding>(`/demo/findings/${id}`);
    return data;
  },

  explainFinding: async (id: number): Promise<{ explanation: string }> => {
    const { data } = await api.post<{ explanation: string }>(`/demo/findings/${id}/explain`);
    return data;
  },

  getAnomalies: async (params?: {
    severity?: string; page?: number; page_size?: number;
  }): Promise<PaginatedResponse<Anomaly>> => {
    const { data } = await api.get<PaginatedResponse<Anomaly>>("/demo/anomalies", { params });
    return data;
  },
};
export const connectorsApi = {
  getAllStatuses: async (): Promise<CloudConnectorStatus[]> => {
    const { data } = await api.get<CloudConnectorStatus[]>("/connectors/status");
    return data;
  },

  configure: async (
    connectorType: string,
    config: Record<string, string>,
    displayName?: string,
  ): Promise<CloudConnectorStatus> => {
    const { data } = await api.put<CloudConnectorStatus>(
      `/connectors/${connectorType}/configure`,
      { config, display_name: displayName },
    );
    return data;
  },

  verify: async (connectorType: string): Promise<CloudConnectorStatus> => {
    const { data } = await api.post<CloudConnectorStatus>(
      `/connectors/${connectorType}/verify`,
    );
    return data;
  },

  disconnect: async (connectorType: string): Promise<void> => {
    await api.delete(`/connectors/${connectorType}`);
  },
};

// ─── Dashboard ────────────────────────────────────────────────────────────
export const dashboardApi = {
  get: async (datasetId: number): Promise<DashboardData> => {
    const { data } = await api.get<DashboardData>(`/analysis/dashboard/${datasetId}`);
    return data;
  },
};

// ─── Findings ─────────────────────────────────────────────────────────────
export const findingsApi = {
  list: async (
    datasetId: number,
    params?: { priority?: string; type?: string; page?: number; page_size?: number }
  ): Promise<PaginatedResponse<Finding>> => {
    const { data } = await api.get<PaginatedResponse<Finding>>(
      `/findings/${datasetId}`,
      { params }
    );
    return data;
  },

  get: async (id: number): Promise<Finding> => {
    const { data } = await api.get<Finding>(`/findings/detail/${id}`);
    return data;
  },

  getExplanation: async (id: number): Promise<{ explanation: string }> => {
    const { data } = await api.post<{ explanation: string }>(`/findings/${id}/explain`);
    return data;
  },

  // Alias so EvidencePanel can call the same method name regardless of mode
  explainFinding: async (id: number): Promise<{ explanation: string }> => {
    const { data } = await api.post<{ explanation: string }>(`/findings/${id}/explain`);
    return data;
  },
};

// ─── Anomalies ────────────────────────────────────────────────────────────
export const anomaliesApi = {
  list: async (
    datasetId: number,
    params?: { severity?: string; page?: number; page_size?: number }
  ): Promise<PaginatedResponse<Anomaly>> => {
    const { data } = await api.get<PaginatedResponse<Anomaly>>(
      `/anomalies/${datasetId}`,
      { params }
    );
    return data;
  },
};

// ─── AI Chat ──────────────────────────────────────────────────────────────
export const chatApi = {
  send: async (request: ChatRequest): Promise<ChatMessage> => {
    const { data } = await api.post<ChatMessage>("/ai/chat", request, {
      timeout: 60000,
    });
    return data;
  },

  getHistory: async (conversationId: string): Promise<ChatMessage[]> => {
    const { data } = await api.get<ChatMessage[]>(`/ai/chat/${conversationId}`);
    return data;
  },
};

// ─── Conversations (persistent chat history) ──────────────────────────────
export const conversationsApi = {
  list: async (): Promise<Conversation[]> => {
    const { data } = await api.get<Conversation[]>("/assistant/conversations");
    return data;
  },

  create: async (title?: string, datasetId?: number): Promise<Conversation> => {
    const { data } = await api.post<Conversation>("/assistant/conversations", {
      title: title ?? "New Conversation",
      dataset_id: datasetId ?? null,
    });
    return data;
  },

  get: async (id: number): Promise<ConversationDetail> => {
    const { data } = await api.get<ConversationDetail>(`/assistant/conversations/${id}`);
    return data;
  },

  updateTitle: async (id: number, title: string): Promise<Conversation> => {
    const { data } = await api.patch<Conversation>(
      `/assistant/conversations/${id}/title`,
      { title }
    );
    return data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/assistant/conversations/${id}`);
  },
};

export default api;
