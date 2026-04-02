import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 30000,
});

export interface Document {
  id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  file_type: string;
  mime_type?: string;
  status: "queued" | "processing" | "completed" | "failed" | "finalized" | "cancelled";
  celery_task_id?: string;
  progress: number;
  current_stage?: string;
  error_message?: string;
  retry_count: number;
  extracted_data?: Record<string, unknown>;
  reviewed_data?: Record<string, unknown>;
  is_reviewed: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface DocumentListResponse {
  items: Document[];
  total: number;
  page: number;
  page_size: number;
}

export interface ProgressEvent {
  job_id: string;
  event: string;
  progress: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface Stats {
  queued?: number;
  processing?: number;
  completed?: number;
  failed?: number;
  finalized?: number;
}

// API calls
export const uploadDocuments = (files: File[]) => {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  // Do NOT set Content-Type header — let the browser set it with the correct multipart boundary
  return api.post<Document[]>("/upload", form);
};

export const listDocuments = (params: {
  page?: number;
  page_size?: number;
  status?: string;
  search?: string;
  sort_by?: string;
  sort_order?: string;
}) => api.get<DocumentListResponse>("/documents", { params });

export const getDocument = (id: string) => api.get<Document>(`/documents/${id}`);

export const getProgress = (id: string) => api.get<ProgressEvent>(`/documents/${id}/progress`);

export const updateReview = (id: string, reviewed_data: Record<string, unknown>) =>
  api.put<Document>(`/documents/${id}/review`, { reviewed_data });

export const finalizeDocument = (id: string) => api.post<Document>(`/documents/${id}/finalize`);

export const retryDocument = (id: string) => api.post<Document>(`/documents/${id}/retry`);

export const deleteDocument = (id: string) => api.delete(`/documents/${id}`);

export const exportDocument = (id: string, format: "json" | "csv") =>
  `${API_URL}/api/v1/documents/${id}/export/${format}`;

export const getStats = () => api.get<Stats>("/stats");

export const getSSEUrl = (id: string) =>
  `${API_URL}/api/v1/documents/${id}/stream`;

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const STATUS_COLORS: Record<string, string> = {
  queued: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  processing: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  failed: "text-red-400 bg-red-400/10 border-red-400/30",
  finalized: "text-violet-400 bg-violet-400/10 border-violet-400/30",
  cancelled: "text-gray-400 bg-gray-400/10 border-gray-400/30",
};

export const STATUS_ICONS: Record<string, string> = {
  queued: "⏳",
  processing: "⚙️",
  completed: "✅",
  failed: "❌",
  finalized: "🏆",
  cancelled: "🚫",
};
