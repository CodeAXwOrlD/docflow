import {
  DocumentItem,
  DocumentListResponse,
  ProgressEvent,
  Stats,
  JobStatus,
  AppMode,
  BackendHealth,
  ListDocumentsParams,
} from "../types/document";
import { documentRepository } from "../services/documentRepository";

export type { DocumentItem as Document, DocumentListResponse, ProgressEvent, Stats, JobStatus, AppMode, BackendHealth };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const listDocuments = (params?: ListDocumentsParams) =>
  documentRepository.listDocuments(params);

export const getDocument = (id: string) =>
  documentRepository.getDocument(id);

export const updateReview = (id: string, reviewed_data: Record<string, unknown>) =>
  documentRepository.updateReview(id, reviewed_data);

export const finalizeDocument = (id: string) =>
  documentRepository.finalizeDocument(id);

export const retryDocument = (id: string) =>
  documentRepository.retryDocument(id);

export const reprocessDocument = (
  id: string,
  options?: { connectionId?: string; documentType?: "auto" | "invoice" }
) => documentRepository.reprocessDocument(id, options);

export const deleteDocument = (id: string) =>
  documentRepository.deleteDocument(id);

export const uploadDocuments = (
  files: File[],
  options?: { documentType?: string; connectionId?: string }
) => documentRepository.uploadDocuments(files, options);

export const getStats = () =>
  documentRepository.getStats();

export const exportDocument = (id: string, format: "json" | "csv") =>
  documentRepository.exportDocument(id, format);

export const exportBatchDocuments = (ids: string[], format: "json" | "csv") =>
  documentRepository.exportBatch(ids, format);

export const getAppMode = (): AppMode =>
  documentRepository.getMode();

export const setAppMode = (mode: AppMode) =>
  documentRepository.setMode(mode);

export const getBackendHealth = (): BackendHealth =>
  documentRepository.getBackendHealth();

export const checkBackendHealth = () =>
  documentRepository.checkBackendHealth();

export const resetDemoData = () =>
  documentRepository.resetDemoData();

export const subscribeModeChange = (cb: (mode: AppMode) => void) =>
  documentRepository.subscribeModeChange(cb);

export const subscribeHealthChange = (cb: (health: BackendHealth) => void) =>
  documentRepository.subscribeHealthChange(cb);

export const subscribeToProgress = (
  docId: string,
  cb: (event: ProgressEvent) => void
) => documentRepository.subscribeToProgress(docId, cb);

export const getSSEUrl = (id: string) =>
  `${API_URL}/api/v1/documents/${id}/stream`;

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const parseServerDate = (dateStr: string | Date | undefined): Date => {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const s = String(dateStr).trim();
  if (!s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(`${s}Z`);
  }
  return new Date(s);
};

export const STATUS_COLORS: Record<string, string> = {
  queued: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  processing: "text-sky-400 bg-sky-400/10 border-sky-400/30",
  completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  failed: "text-rose-400 bg-rose-400/10 border-rose-400/30",
  finalized: "text-violet-400 bg-violet-400/10 border-violet-400/30",
  cancelled: "text-slate-400 bg-slate-400/10 border-slate-400/30",
};

export const STATUS_ICONS: Record<string, string> = {
  queued: "⏳",
  processing: "⚙️",
  completed: "✅",
  failed: "❌",
  finalized: "🏆",
  cancelled: "🚫",
};
