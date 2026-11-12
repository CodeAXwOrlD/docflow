import axios, { AxiosInstance } from "axios";
import {
  AIConnection,
  AIConnectionCreatePayload,
  AIConnectionTestPayload,
  AIConnectionTestResponse,
  AIConnectionUpdatePayload,
  AIModelInfo,
  AIUsageResponse,
  AuthResponse,
  DocumentItem,
  DocumentListResponse,
  ListDocumentsParams,
  ProgressEvent,
  Stats,
  User,
} from "../types/document";
import { clearAuthSession, getAuthToken, setAuthSession } from "../lib/auth";

export class LiveDocumentService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(apiUrl?: string) {
    this.baseUrl = (apiUrl || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
    this.client = axios.create({
      baseURL: `${this.baseUrl}/api/v1`,
      timeout: 30000,
    });

    this.client.interceptors.request.use((config) => {
      const token = getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (res) => res,
      (error) => {
        if (error?.response?.status === 401 && getAuthToken()) {
          clearAuthSession();
        }
        return Promise.reject(error);
      }
    );
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/health`, { timeout: 4000 });
      return res.status === 200 && res.data?.status === "ok";
    } catch {
      return false;
    }
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────
  public async register(email: string, fullName: string, password: string): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>("/auth/register", {
      email,
      full_name: fullName,
      password,
    });
    setAuthSession(res.data.access_token, res.data.user);
    return res.data;
  }

  public async login(email: string, password: string): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>("/auth/login", { email, password });
    setAuthSession(res.data.access_token, res.data.user);
    return res.data;
  }

  public async getMe(): Promise<User> {
    const res = await this.client.get<User>("/auth/me");
    return res.data;
  }

  // ─── AI BYOK Settings ──────────────────────────────────────────────────────
  public async listAIConnections(): Promise<AIConnection[]> {
    const res = await this.client.get<AIConnection[]>("/ai/connections");
    return res.data;
  }

  public async createAIConnection(payload: AIConnectionCreatePayload): Promise<AIConnection> {
    const res = await this.client.post<AIConnection>("/ai/connections", payload);
    return res.data;
  }

  public async testAIConnection(payload: AIConnectionTestPayload): Promise<AIConnectionTestResponse> {
    const res = await this.client.post<AIConnectionTestResponse>("/ai/connections/test", payload);
    return res.data;
  }

  public async updateAIConnection(
    id: string,
    payload: AIConnectionUpdatePayload
  ): Promise<AIConnection> {
    const res = await this.client.patch<AIConnection>(`/ai/connections/${id}`, payload);
    return res.data;
  }

  public async deleteAIConnection(id: string): Promise<void> {
    await this.client.delete(`/ai/connections/${id}`);
  }

  public async listAIModels(provider?: string): Promise<Record<string, AIModelInfo[]>> {
    const res = await this.client.get<Record<string, AIModelInfo[]>>("/ai/models", {
      params: provider ? { provider } : undefined,
    });
    return res.data;
  }

  public async getAIUsage(limit: number = 25): Promise<AIUsageResponse> {
    const res = await this.client.get<AIUsageResponse>("/ai/usage", { params: { limit } });
    return res.data;
  }

  // ─── Documents ─────────────────────────────────────────────────────────────
  public async listDocuments(params: ListDocumentsParams = {}): Promise<DocumentListResponse> {
    const res = await this.client.get<DocumentListResponse>("/documents", { params });
    return res.data;
  }

  public async getDocument(id: string): Promise<DocumentItem> {
    const res = await this.client.get<DocumentItem>(`/documents/${id}`);
    return res.data;
  }

  public async updateReview(id: string, reviewedData: Record<string, unknown>): Promise<DocumentItem> {
    const res = await this.client.put<DocumentItem>(`/documents/${id}/review`, {
      reviewed_data: reviewedData,
    });
    return res.data;
  }

  public async finalizeDocument(id: string): Promise<DocumentItem> {
    const res = await this.client.post<DocumentItem>(`/documents/${id}/finalize`);
    return res.data;
  }

  public async retryDocument(id: string): Promise<DocumentItem> {
    const res = await this.client.post<DocumentItem>(`/documents/${id}/retry`);
    return res.data;
  }

  public async reprocessDocument(
    id: string,
    options?: { connectionId?: string; documentType?: "auto" | "invoice" }
  ): Promise<DocumentItem> {
    const res = await this.client.post<DocumentItem>(`/documents/${id}/reprocess`, {
      connection_id: options?.connectionId || undefined,
      document_type: options?.documentType || undefined,
    });
    return res.data;
  }

  public async deleteDocument(id: string): Promise<void> {
    await this.client.delete(`/documents/${id}`);
  }

  public async uploadDocuments(
    files: File[],
    options?: { documentType?: string; connectionId?: string }
  ): Promise<DocumentItem[]> {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (options?.documentType) {
      form.append("document_type", options.documentType);
    }
    if (options?.connectionId) {
      form.append("connection_id", options.connectionId);
    }
    const res = await this.client.post<DocumentItem[]>("/upload", form);
    return res.data;
  }

  public async getStats(): Promise<Stats> {
    const res = await this.client.get<Stats>("/stats");
    return res.data;
  }

  public subscribeToProgress(
    docId: string,
    callback: (event: ProgressEvent) => void
  ): () => void {
    let eventSource: EventSource | null = null;
    let cancelled = false;

    const connect = async () => {
      try {
        const tokenRes = await this.client.post<{ stream_token: string }>(
          `/documents/${docId}/stream-token`
        );
        if (cancelled) return;
        const url = `${this.baseUrl}/api/v1/documents/${docId}/stream?stream_token=${encodeURIComponent(
          tokenRes.data.stream_token
        )}`;
        eventSource = new EventSource(url);
        eventSource.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            callback({
              job_id: docId,
              event: parsed.event || "progress",
              progress: parsed.progress ?? 0,
              message: parsed.message || "",
              data: parsed.data,
            });
          } catch {
            // Ignore keepalives
          }
        };
        eventSource.onerror = () => {
          eventSource?.close();
        };
      } catch {
        // Stream token request failed
      }
    };

    connect();

    return () => {
      cancelled = true;
      eventSource?.close();
    };
  }

  private triggerBlobDownload(blob: Blob, filename: string) {
    if (typeof window === "undefined") return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  public async exportDocument(id: string, format: "json" | "csv"): Promise<void> {
    const res = await this.client.get(`/documents/${id}/export/${format}`, {
      responseType: "blob",
    });
    const disposition = String(res.headers["content-disposition"] || "");
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `docflow_export_${id}.${format}`;
    this.triggerBlobDownload(res.data, filename);
  }

  public async exportBatch(ids: string[], format: "json" | "csv"): Promise<void> {
    const res = await this.client.get(`/documents/export/batch`, {
      params: { ids: ids.join(","), format },
      responseType: "blob",
    });
    this.triggerBlobDownload(res.data, `docflow_batch_export.${format}`);
  }
}

export const liveDocumentService = new LiveDocumentService();
