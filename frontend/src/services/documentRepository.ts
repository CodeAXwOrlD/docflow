import {
  AppMode,
  BackendHealth,
  DocumentItem,
  DocumentListResponse,
  ListDocumentsParams,
  ProgressEvent,
  Stats,
} from "../types/document";
import { demoDocumentService } from "./demoDocumentService";
import { liveDocumentService } from "./liveDocumentService";

class DocumentRepository {
  private mode: AppMode = "demo";
  private health: BackendHealth = "checking";
  private modeListeners: Set<(mode: AppMode) => void> = new Set();
  private healthListeners: Set<(health: BackendHealth) => void> = new Set();
  private hasInitialized: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.initClientMode();
    }
  }

  private initClientMode() {
    if (this.hasInitialized) return;
    this.hasInitialized = true;

    try {
      const savedMode = localStorage.getItem("docflow_app_mode");
      if (savedMode === "live" || savedMode === "demo") {
        this.mode = savedMode;
      } else {
        const envDemo = process.env.NEXT_PUBLIC_DEMO_MODE;
        this.mode = envDemo === "false" ? "live" : "demo";
      }
    } catch {
      this.mode = "demo";
    }

    this.checkBackendHealth();
  }

  public getMode(): AppMode {
    return this.mode;
  }

  public setMode(mode: AppMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("docflow_app_mode", mode);
      } catch {
        // Safe fallback
      }
    }
    this.modeListeners.forEach((cb) => {
      try {
        cb(mode);
      } catch {
        // Ignore listener error
      }
    });

    if (mode === "live") {
      this.checkBackendHealth();
    }
  }

  public getBackendHealth(): BackendHealth {
    return this.health;
  }

  public async checkBackendHealth(): Promise<BackendHealth> {
    this.setHealth("checking");
    const isHealthy = await liveDocumentService.checkHealth();
    const nextHealth: BackendHealth = isHealthy ? "healthy" : "offline";
    this.setHealth(nextHealth);
    return nextHealth;
  }

  private setHealth(health: BackendHealth) {
    if (this.health === health) return;
    this.health = health;
    this.healthListeners.forEach((cb) => {
      try {
        cb(health);
      } catch {
        // Ignore listener error
      }
    });
  }

  public subscribeModeChange(cb: (mode: AppMode) => void): () => void {
    this.modeListeners.add(cb);
    return () => {
      this.modeListeners.delete(cb);
    };
  }

  public subscribeHealthChange(cb: (health: BackendHealth) => void): () => void {
    this.healthListeners.add(cb);
    return () => {
      this.healthListeners.delete(cb);
    };
  }

  public async listDocuments(params?: ListDocumentsParams): Promise<DocumentListResponse> {
    if (this.mode === "demo") {
      return demoDocumentService.listDocuments(params);
    }
    try {
      return await liveDocumentService.listDocuments(params);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (!status) {
        this.setHealth("offline");
      }
      throw err;
    }
  }

  public async getDocument(id: string): Promise<DocumentItem> {
    if (this.mode === "demo" || id.startsWith("doc-demo-") || id.startsWith("doc-sim-")) {
      return demoDocumentService.getDocument(id);
    }
    try {
      return await liveDocumentService.getDocument(id);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (!status) {
        this.setHealth("offline");
      }
      throw err;
    }
  }

  public async updateReview(id: string, reviewedData: Record<string, unknown>): Promise<DocumentItem> {
    if (this.mode === "demo" || id.startsWith("doc-demo-") || id.startsWith("doc-sim-")) {
      return demoDocumentService.updateReview(id, reviewedData);
    }
    return liveDocumentService.updateReview(id, reviewedData);
  }

  public async finalizeDocument(id: string): Promise<DocumentItem> {
    if (this.mode === "demo" || id.startsWith("doc-demo-") || id.startsWith("doc-sim-")) {
      return demoDocumentService.finalizeDocument(id);
    }
    return liveDocumentService.finalizeDocument(id);
  }

  public async retryDocument(id: string): Promise<DocumentItem> {
    if (this.mode === "demo" || id.startsWith("doc-demo-") || id.startsWith("doc-sim-")) {
      return demoDocumentService.retryDocument(id);
    }
    return liveDocumentService.retryDocument(id);
  }

  public async reprocessDocument(
    id: string,
    options?: { connectionId?: string; documentType?: "auto" | "invoice" }
  ): Promise<DocumentItem> {
    if (this.mode === "demo" || id.startsWith("doc-demo-") || id.startsWith("doc-sim-")) {
      return demoDocumentService.reprocessDocument(id);
    }
    return liveDocumentService.reprocessDocument(id, options);
  }

  public async deleteDocument(id: string): Promise<void> {
    if (this.mode === "demo" || id.startsWith("doc-demo-") || id.startsWith("doc-sim-")) {
      return demoDocumentService.deleteDocument(id);
    }
    return liveDocumentService.deleteDocument(id);
  }

  public async uploadDocuments(
    files: File[],
    options?: { documentType?: string; connectionId?: string }
  ): Promise<DocumentItem[]> {
    if (this.mode === "demo") {
      return demoDocumentService.uploadDocuments(files);
    }
    return liveDocumentService.uploadDocuments(files, options);
  }

  public async getStats(): Promise<Stats> {
    if (this.mode === "demo") {
      return demoDocumentService.getStats();
    }
    try {
      return await liveDocumentService.getStats();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (!status) {
        this.setHealth("offline");
      }
      return { queued: 0, processing: 0, completed: 0, failed: 0, finalized: 0 };
    }
  }

  public subscribeToProgress(
    docId: string,
    callback: (event: ProgressEvent) => void
  ): () => void {
    if (this.mode === "demo" || docId.startsWith("doc-demo-") || docId.startsWith("doc-sim-")) {
      return demoDocumentService.subscribeToProgress(docId, callback);
    }
    return liveDocumentService.subscribeToProgress(docId, callback);
  }

  public async exportDocument(id: string, format: "json" | "csv"): Promise<void> {
    if (this.mode === "demo" || id.startsWith("doc-demo-") || id.startsWith("doc-sim-")) {
      demoDocumentService.exportDocument(id, format);
      return;
    }
    await liveDocumentService.exportDocument(id, format);
  }

  public async exportBatch(ids: string[], format: "json" | "csv"): Promise<void> {
    if (this.mode === "demo") {
      demoDocumentService.exportBatch(ids, format);
      return;
    }
    await liveDocumentService.exportBatch(ids, format);
  }

  public resetDemoData(): void {
    demoDocumentService.resetToSeed();
  }
}

export const documentRepository = new DocumentRepository();
