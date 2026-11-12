import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import toast from "react-hot-toast";
import Layout from "@/components/Layout";
import StatusBadge from "@/components/ui/StatusBadge";
import DeleteModal from "@/components/ui/DeleteModal";
import StageTracker from "@/components/ui/StageTracker";
import SchemaInspector from "@/components/ui/SchemaInspector";
import {
  getDocument,
  updateReview,
  finalizeDocument,
  retryDocument,
  reprocessDocument,
  deleteDocument,
  exportDocument,
  subscribeToProgress,
  Document,
  ProgressEvent,
  formatFileSize,
  getAppMode,
} from "@/lib/api";
import { AIConnection } from "@/types/document";
import { getStoredUser } from "@/lib/auth";
import { liveDocumentService } from "@/services/liveDocumentService";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowLeft,
  Download,
  RotateCcw,
  Trash2,
  Sparkles,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

export default function DocumentDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [connections, setConnections] = useState<AIConnection[]>([]);
  const [reprocessConnId, setReprocessConnId] = useState<string>("");

  const fetchDoc = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getDocument(id);
      setDoc(data);
      setNotFound(false);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!router.isReady || !id) return;
    fetchDoc();

    if (getAppMode() === "live" && getStoredUser()) {
      liveDocumentService
        .listAIConnections()
        .then((list) => {
          const active = list.filter((c) => c.is_active);
          setConnections(active);
          const def = active.find((c) => c.is_default) || active[0];
          if (def) setReprocessConnId(def.id);
        })
        .catch(() => {});
    }

    const unsub = subscribeToProgress(id, (event: ProgressEvent) => {
      setDoc((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          progress: event.progress,
          current_stage: event.event,
          extracted_data: (event.data as Record<string, unknown>) || prev.extracted_data,
          status:
            event.progress === 100
              ? "completed"
              : event.event === "job_failed"
              ? "failed"
              : prev.status,
          error_message: event.event === "job_failed" ? event.message : prev.error_message,
        };
      });
    });

    return () => {
      unsub();
    };
  }, [router.isReady, id, fetchDoc]);

  const handleSaveReview = async (updatedData: Record<string, unknown>) => {
    if (!id) return;
    const updated = await updateReview(id, updatedData);
    setDoc(updated);
  };

  const handleFinalize = async () => {
    if (!id) return;
    setIsFinalizing(true);
    try {
      const updated = await finalizeDocument(id);
      setDoc(updated);
      toast.success("Document finalized");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Finalization failed";
      toast.error(msg);
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleRetry = async () => {
    if (!id) return;
    setRetrying(true);
    try {
      const updated = await retryDocument(id);
      setDoc(updated);
      toast.success("Queued for reprocessing");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Retry failed";
      toast.error(msg);
    } finally {
      setRetrying(false);
    }
  };

  const handleReprocess = async () => {
    if (!id) return;
    setReprocessing(true);
    try {
      const updated = await reprocessDocument(id, {
        connectionId: reprocessConnId || undefined,
      });
      setDoc(updated);
      toast.success("Document queued for fresh AI extraction");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || (err instanceof Error ? err.message : "Reprocess failed"));
    } finally {
      setReprocessing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteDocument(id);
      toast.success("Document deleted");
      router.push("/documents");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deletion failed";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async (formatType: "json" | "csv") => {
    if (!id) return;
    try {
      await exportDocument(id, formatType);
      toast.success(`Exported as ${formatType.toUpperCase()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-16 text-center text-xs text-slate-500 space-y-3">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-slate-200 rounded-full animate-spin mx-auto" />
          <div>Loading…</div>
        </div>
      </Layout>
    );
  }

  if (notFound || !doc) {
    return (
      <Layout>
        <div className="surface-card p-12 text-center space-y-4 max-w-md mx-auto my-12">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <h2 className="text-sm font-semibold text-white">Document not found</h2>
          <p className="text-xs text-slate-500">
            This document may have been deleted or belongs to a different account.
          </p>
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-white text-slate-900 hover:bg-slate-100 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to documents</span>
          </Link>
        </div>
      </Layout>
    );
  }

  const isCompletedOrFinalized = doc.status === "completed" || doc.status === "finalized";

  return (
    <Layout>
      <Head>
        <title>{`${doc.original_filename} — DocFlow`}</title>
        <meta
          name="description"
          content={`Extracted data and processing details for ${doc.original_filename}.`}
        />
      </Head>

      <DeleteModal
        isOpen={showDeleteModal}
        onClose={() => !isDeleting && setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        itemName={doc.original_filename}
        itemMeta={`${doc.file_type.toUpperCase()} · ${formatFileSize(doc.file_size)} · ${doc.id.slice(0, 8)}`}
        isDeleting={isDeleting}
      />

      <div className="space-y-5">
        {doc.is_synthetic && (
          <div className="px-4 py-3 rounded-xl bg-cyan-950/40 border border-cyan-800/40 flex items-center gap-2.5 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <span className="text-cyan-300/90">
              This is a sample document. You can edit values, verify fields, save reviews, and export — all locally.
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <Link
              href="/documents"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Documents
            </Link>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
                <FileText className="w-4 h-4 text-slate-400" />
              </div>
              <h1 className="text-lg font-semibold text-white tracking-tight font-heading">
                {doc.original_filename}
              </h1>
              <StatusBadge status={doc.status} />
              {doc.is_synthetic && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/[0.05] text-slate-400 border border-white/[0.06]">
                  sample
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isCompletedOrFinalized && (
              <>
                <button
                  onClick={() => handleExport("json")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] transition-colors cursor-pointer"
                >
                  <Download className="w-3 h-3 text-cyan-400" />
                  JSON
                </button>
                <button
                  onClick={() => handleExport("csv")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] transition-colors cursor-pointer"
                >
                  <Download className="w-3 h-3 text-emerald-400" />
                  CSV
                </button>

                {connections.length > 1 && (
                  <select
                    value={reprocessConnId}
                    onChange={(e) => setReprocessConnId(e.target.value)}
                    className="surface-input text-xs py-1.5 cursor-pointer"
                  >
                    {connections.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#0b1123]">
                        {c.provider.toUpperCase()} · {c.model}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  onClick={handleReprocess}
                  disabled={reprocessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 text-violet-400 ${reprocessing ? "animate-spin" : ""}`} />
                  {reprocessing ? "Reprocessing…" : "Reprocess"}
                </button>
              </>
            )}

            {doc.status === "failed" && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-400 text-black transition-all cursor-pointer"
              >
                <RotateCcw className={`w-3 h-3 ${retrying ? "animate-spin" : ""}`} />
                {retrying ? "Retrying…" : "Retry"}
              </button>
            )}

            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 border border-white/[0.07] transition-colors cursor-pointer"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="surface-card p-4">
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Type</div>
            <div className="text-sm font-semibold text-white mt-1">{doc.file_type.toUpperCase()}</div>
            <div className="text-[11px] text-slate-600 mt-0.5">{formatFileSize(doc.file_size)}</div>
          </div>

          <div className="surface-card p-4">
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Added</div>
            <div className="text-sm font-semibold text-white mt-1">
              {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              {format(new Date(doc.created_at), "MMM d, yyyy HH:mm")}
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">AI Provider</div>
            <div className="text-sm font-semibold text-white mt-1">
              {doc.ai_provider ? doc.ai_provider.toUpperCase() : "—"}
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
              {doc.ai_model || `Retries: ${doc.retry_count}`}
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Review</div>
            <div className="text-sm font-semibold text-white mt-1 flex items-center gap-1.5">
              {doc.status === "finalized" ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-violet-400" />
                  <span className="text-violet-300">Finalized</span>
                </>
              ) : doc.is_reviewed ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300">Reviewed</span>
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-400">Pending</span>
                </>
              )}
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">Human verification</div>
          </div>
        </div>

        <StageTracker
          status={doc.status}
          currentStage={doc.current_stage}
          progress={doc.progress}
          errorMessage={doc.error_message}
        />

        <SchemaInspector
          extractedData={doc.extracted_data}
          reviewedData={doc.reviewed_data}
          isReviewed={doc.is_reviewed}
          status={doc.status}
          onSaveReview={handleSaveReview}
          onFinalize={handleFinalize}
          isFinalizing={isFinalizing}
        />
      </div>
    </Layout>
  );
}
