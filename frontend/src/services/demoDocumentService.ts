import {
  DocumentItem,
  DocumentListResponse,
  ListDocumentsParams,
  ProgressEvent,
  Stats,
} from "../types/document";
import { SEEDED_DEMO_DOCUMENTS } from "./demoData";

const STORAGE_KEY = "docflow_demo_documents_v1";

export class DemoDocumentService {
  private inMemoryDocs: DocumentItem[] = [];
  private activeSimulations: Map<string, NodeJS.Timeout[]> = new Map();
  private listeners: Map<string, Array<(event: ProgressEvent) => void>> = new Map();

  constructor() {
    this.initStorage();
  }

  private initStorage() {
    if (typeof window === "undefined") {
      this.inMemoryDocs = JSON.parse(JSON.stringify(SEEDED_DEMO_DOCUMENTS));
      return;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.inMemoryDocs = JSON.parse(stored);
      } else {
        this.resetToSeed();
      }
    } catch {
      // In-memory fallback if localStorage is disabled or throws
      this.inMemoryDocs = JSON.parse(JSON.stringify(SEEDED_DEMO_DOCUMENTS));
    }
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.inMemoryDocs));
    } catch {
      // Storage quota or security error: continue with in-memory state
    }
  }

  public resetToSeed(): void {
    this.inMemoryDocs = JSON.parse(JSON.stringify(SEEDED_DEMO_DOCUMENTS));
    this.persist();
  }

  public async listDocuments(
    params: ListDocumentsParams = {}
  ): Promise<DocumentListResponse> {
    const {
      page = 1,
      page_size = 15,
      status,
      search,
      sort_by = "created_at",
      sort_order = "desc",
    } = params;

    let filtered = [...this.inMemoryDocs];

    if (status && status !== "all") {
      filtered = filtered.filter(
        (d) => d.status.toLowerCase() === status.toLowerCase()
      );
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((d) => {
        const nameMatch = d.original_filename.toLowerCase().includes(q);
        const typeMatch = d.file_type.toLowerCase().includes(q);
        const stageMatch = d.current_stage?.toLowerCase().includes(q);
        const categoryMatch =
          typeof d.extracted_data?.category === "string" &&
          d.extracted_data.category.toLowerCase().includes(q);
        const titleMatch =
          typeof d.extracted_data?.title === "string" &&
          d.extracted_data.title.toLowerCase().includes(q);
        return nameMatch || typeMatch || stageMatch || categoryMatch || titleMatch;
      });
    }

    filtered.sort((a, b) => {
      let valA: unknown = a[sort_by as keyof DocumentItem];
      let valB: unknown = b[sort_by as keyof DocumentItem];

      if (sort_by === "created_at" || sort_by === "updated_at") {
        const timeA = new Date(valA as string).getTime() || 0;
        const timeB = new Date(valB as string).getTime() || 0;
        return sort_order === "asc" ? timeA - timeB : timeB - timeA;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return sort_order === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return sort_order === "asc" ? valA - valB : valB - valA;
      }

      return 0;
    });

    const total = filtered.length;
    const startIndex = (page - 1) * page_size;
    const items = filtered.slice(startIndex, startIndex + page_size);

    return {
      items,
      total,
      page,
      page_size,
    };
  }

  public async getDocument(id: string): Promise<DocumentItem> {
    const doc = this.inMemoryDocs.find((d) => d.id === id);
    if (!doc) {
      throw new Error(`Demo document not found: ${id}`);
    }
    return JSON.parse(JSON.stringify(doc));
  }

  public async updateReview(
    id: string,
    reviewedData: Record<string, unknown>
  ): Promise<DocumentItem> {
    const doc = this.inMemoryDocs.find((d) => d.id === id);
    if (!doc) throw new Error("Document not found");
    if (doc.status !== "completed" && doc.status !== "finalized") {
      throw new Error("Document must be completed before reviewing");
    }

    doc.reviewed_data = { ...reviewedData };
    doc.is_reviewed = true;
    doc.updated_at = new Date().toISOString();
    this.persist();
    return JSON.parse(JSON.stringify(doc));
  }

  public async finalizeDocument(id: string): Promise<DocumentItem> {
    const doc = this.inMemoryDocs.find((d) => d.id === id);
    if (!doc) throw new Error("Document not found");
    if (!doc.is_reviewed) {
      throw new Error("Document must be reviewed before finalization");
    }

    doc.status = "finalized";
    doc.updated_at = new Date().toISOString();
    this.persist();
    return JSON.parse(JSON.stringify(doc));
  }

  public async retryDocument(id: string): Promise<DocumentItem> {
    const doc = this.inMemoryDocs.find((d) => d.id === id);
    if (!doc) throw new Error("Document not found");
    if (doc.status !== "failed") {
      throw new Error("Only failed jobs can be retried");
    }

    doc.status = "processing";
    doc.progress = 5;
    doc.current_stage = "job_started";
    doc.error_message = null;
    doc.retry_count += 1;
    doc.updated_at = new Date().toISOString();
    this.persist();

    // Trigger deterministic stage simulation
    this.simulatePipelineExecution(doc.id, true);

    return JSON.parse(JSON.stringify(doc));
  }

  public async reprocessDocument(id: string): Promise<DocumentItem> {
    const doc = this.inMemoryDocs.find((d) => d.id === id);
    if (!doc) throw new Error("Document not found");

    doc.status = "processing";
    doc.progress = 5;
    doc.current_stage = "job_started";
    doc.error_message = null;
    doc.is_reviewed = false;
    doc.reviewed_data = null;
    doc.retry_count += 1;
    doc.updated_at = new Date().toISOString();
    this.persist();

    this.simulatePipelineExecution(doc.id, false);
    return JSON.parse(JSON.stringify(doc));
  }

  public async deleteDocument(id: string): Promise<void> {
    const index = this.inMemoryDocs.findIndex((d) => d.id === id);
    if (index === -1) throw new Error("Document not found");

    // Clear any running simulation timers
    if (this.activeSimulations.has(id)) {
      this.activeSimulations.get(id)?.forEach(clearTimeout);
      this.activeSimulations.delete(id);
    }

    this.inMemoryDocs.splice(index, 1);
    this.persist();
  }

  public async uploadDocuments(files: File[]): Promise<DocumentItem[]> {
    const created: DocumentItem[] = [];

    for (const file of files) {
      const ext = "." + (file.name.split(".").pop() || "txt").toLowerCase();
      const id = `doc-sim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newDoc: DocumentItem = {
        id,
        filename: `sim_${id}${ext}`,
        original_filename: file.name,
        file_size: file.size,
        file_type: ext,
        mime_type: file.type || "application/octet-stream",
        status: "processing",
        celery_task_id: `sim-celery-${id}`,
        progress: 10,
        current_stage: "job_started",
        error_message: null,
        retry_count: 0,
        is_reviewed: false,
        is_synthetic: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
        extracted_data: null,
      };

      this.inMemoryDocs.unshift(newDoc);
      created.push(newDoc);
      this.simulatePipelineExecution(newDoc.id, false);
    }

    this.persist();
    return created;
  }

  public async getStats(): Promise<Stats> {
    const stats: Stats = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      finalized: 0,
    };

    for (const doc of this.inMemoryDocs) {
      const s = doc.status;
      if (stats[s] !== undefined) {
        stats[s] = (stats[s] || 0) + 1;
      }
    }
    return stats;
  }

  public subscribeToProgress(
    docId: string,
    callback: (event: ProgressEvent) => void
  ): () => void {
    if (!this.listeners.has(docId)) {
      this.listeners.set(docId, []);
    }
    this.listeners.get(docId)?.push(callback);

    return () => {
      const arr = this.listeners.get(docId) || [];
      this.listeners.set(
        docId,
        arr.filter((cb) => cb !== callback)
      );
    };
  }

  private emitProgress(docId: string, event: ProgressEvent) {
    const arr = this.listeners.get(docId) || [];
    arr.forEach((cb) => {
      try {
        cb(event);
      } catch {
        // Safe dispatch
      }
    });
  }

  private simulatePipelineExecution(docId: string, isRetry: boolean) {
    // Clear any previous simulation
    if (this.activeSimulations.has(docId)) {
      this.activeSimulations.get(docId)?.forEach(clearTimeout);
    }

    const stages: Array<{
      stage: string;
      progress: number;
      delayMs: number;
      message: string;
    }> = [
      {
        stage: "document_received",
        progress: 20,
        delayMs: 800,
        message: "Payload validated & buffered into queue",
      },
      {
        stage: "document_parsing_started",
        progress: 40,
        delayMs: 1800,
        message: "Parsing structural boundaries and layout",
      },
      {
        stage: "document_parsing_completed",
        progress: 60,
        delayMs: 3000,
        message: "Text blocks and tables identified",
      },
      {
        stage: "field_extraction_started",
        progress: 75,
        delayMs: 4200,
        message: "Extracting normalized entity schema",
      },
      {
        stage: "field_extraction_completed",
        progress: 90,
        delayMs: 5200,
        message: "Validating integrity rules and confidence metrics",
      },
      {
        stage: "job_completed",
        progress: 100,
        delayMs: 6200,
        message: "Ingestion pipeline finished successfully",
      },
    ];

    const timeouts: NodeJS.Timeout[] = [];

    stages.forEach(({ stage, progress, delayMs, message }) => {
      const t = setTimeout(() => {
        const doc = this.inMemoryDocs.find((d) => d.id === docId);
        if (!doc) return;

        doc.current_stage = stage;
        doc.progress = progress;
        doc.updated_at = new Date().toISOString();

        if (stage === "job_completed") {
          doc.status = "completed";
          doc.completed_at = new Date().toISOString();
          doc.extracted_data = isRetry
            ? {
                title: "Encrypted Banking Statement (Decrypted via Session Pass)",
                category: "Financial / Invoice",
                account_holder: "DocFlow Operating Treasury LLC",
                reconciliation_status: "MATCHED",
                statement_date: "2024-06-30",
                opening_balance_usd: 142500.0,
                closing_balance_usd: 178920.5,
                net_change_usd: 36420.5,
                verification_signature: "SHA256-RECOVERED-SIGNATURE",
                summary:
                  "Simulated automated recovery pass successfully parsed ledger items after security key provision.",
              }
            : {
                title: doc.original_filename.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
                category: "General Ingested Document",
                status: "extracted",
                file_metadata: {
                  filename: doc.original_filename,
                  file_size_bytes: doc.file_size,
                  file_type: doc.file_type,
                },
                extracted_fields: {
                  ingestion_mode: "Simulated Browser Sandbox",
                  detected_language: "English (US)",
                  estimated_page_count: Math.max(1, Math.round(doc.file_size / 45000)),
                },
                summary:
                  "Deterministic browser demo extraction completed. For live OCR and multi-format parsing, run the Celery worker cluster.",
              };
        }

        this.persist();

        this.emitProgress(docId, {
          job_id: docId,
          event: stage,
          progress,
          message,
          data: doc.extracted_data || undefined,
        });
      }, delayMs);

      timeouts.push(t);
    });

    this.activeSimulations.set(docId, timeouts);
  }

  public exportDocument(id: string, format: "json" | "csv"): void {
    const doc = this.inMemoryDocs.find((d) => d.id === id);
    if (!doc) throw new Error("Document not found");

    const data = doc.reviewed_data || doc.extracted_data;
    if (!data) {
      throw new Error("No extracted data available to export");
    }

    let mimeType = "application/json";
    let content = "";
    const filename = `${doc.original_filename.replace(/\.[^/.]+$/, "")}_export.${format}`;

    if (format === "json") {
      content = JSON.stringify(data, null, 2);
      mimeType = "application/json";
    } else {
      mimeType = "text/csv;charset=utf-8;";
      const rows: string[] = ['"Field","Value"'];
      for (const [key, val] of Object.entries(data)) {
        const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
        const safeKey = key.replace(/"/g, '""');
        const safeVal = valStr.replace(/"/g, '""');
        rows.push(`"${safeKey}","${safeVal}"`);
      }
      content = rows.join("\n");
    }

    if (typeof window !== "undefined") {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  public exportBatch(ids: string[], format: "json" | "csv"): void {
    const selected = this.inMemoryDocs.filter(
      (d) => ids.includes(d.id) && (d.reviewed_data || d.extracted_data)
    );
    if (selected.length === 0) {
      throw new Error("No processed documents selected to export");
    }

    let content = "";
    let mimeType = "application/json";
    if (format === "json") {
      content = JSON.stringify(
        selected.map((d) => ({
          document_id: d.id,
          filename: d.original_filename,
          status: d.status,
          data: d.reviewed_data || d.extracted_data,
        })),
        null,
        2
      );
    } else {
      mimeType = "text/csv;charset=utf-8;";
      const rows: string[] = ['"Document","Field","Value"'];
      for (const d of selected) {
        const data = d.reviewed_data || d.extracted_data || {};
        for (const [key, val] of Object.entries(data)) {
          const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
          rows.push(
            `"${d.original_filename.replace(/"/g, '""')}","${key.replace(/"/g, '""')}","${valStr.replace(/"/g, '""')}"`
          );
        }
      }
      content = rows.join("\n");
    }

    if (typeof window !== "undefined") {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `docflow_batch_export.${format}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }
}

export const demoDocumentService = new DemoDocumentService();
