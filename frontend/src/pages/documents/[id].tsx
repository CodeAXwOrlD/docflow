import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Layout from "@/components/Layout";
import StatusBadge from "@/components/ui/StatusBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import DeleteModal from "@/components/ui/DeleteModal";
import {
  getDocument, 
  updateReview, 
  finalizeDocument, 
  retryDocument,
  deleteDocument,
  exportDocument, 
  getSSEUrl,
  Document, 
  ProgressEvent, 
  formatFileSize,
} from "@/lib/api";
import { formatDistanceToNow, format } from "date-fns";
import { 
  ArrowLeft, 
  Download, 
  RotateCcw, 
  CheckCircle2, 
  Trash2, 
  Sparkles, 
  Edit3, 
  Save, 
  X, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  Activity, 
  Check, 
  Clock, 
  Calendar, 
  Cpu,
  Layers,
  AlertTriangle,
  Bot
} from "lucide-react";

const STAGE_ORDER = [
  "job_started", 
  "document_received", 
  "document_parsing_started",
  "document_parsing_completed", 
  "field_extraction_started",
  "field_extraction_completed", 
  "storing_result", 
  "job_completed",
];

const STAGE_LABELS: Record<string, string> = {
  job_started: "Job Picked Up by Worker",
  document_received: "Document Validated & Ingested",
  document_parsing_started: "Parsing Document Structure",
  document_parsing_completed: "Text Content Extracted",
  field_extraction_started: "Structured Field Extraction",
  field_extraction_completed: "Schema Normalization Complete",
  storing_result: "Saving to PostgreSQL & Cache",
  job_completed: "Processing Succeeded",
  job_failed: "Pipeline Execution Failed",
};

export default function DocumentDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  const fetchDoc = async () => {
    if (!id) return;
    try {
      const res = await getDocument(id);
      setDoc(res.data);
      const d = res.data.reviewed_data || res.data.extracted_data;
      if (d) setEditData(d as Record<string, unknown>);
    } catch {
      toast.error("Document not found");
      router.push("/");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    fetchDoc();

    const connectSSE = () => {
      if (sseRef.current) sseRef.current.close();
      const es = new EventSource(getSSEUrl(id));
      sseRef.current = es;
      es.onmessage = (e) => {
        try {
          const event: ProgressEvent = JSON.parse(e.data);
          if (event.event === "connected") return;
          setEvents((prev) => {
            const exists = prev.find((p) => p.event === event.event);
            if (exists) return prev;
            return [...prev, event];
          });
          if (event.event === "job_completed" || event.event === "job_failed") {
            setTimeout(fetchDoc, 500);
            es.close();
          }
        } catch {}
      };
      es.onerror = () => es.close();
    };

    connectSSE();
    const interval = setInterval(fetchDoc, 4000);
    return () => {
      sseRef.current?.close();
      clearInterval(interval);
    };
  }, [id]);

  const handleSaveReview = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateReview(id, editData);
      toast.success("Review changes saved!");
      setEditing(false);
      fetchDoc();
    } catch {
      toast.error("Failed to save review");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!id) return;
    try {
      await finalizeDocument(id);
      toast.success("Document finalized!");
      fetchDoc();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Finalization failed";
      toast.error(msg);
    }
  };

  const handleRetry = async () => {
    if (!id) return;
    try {
      await retryDocument(id);
      toast.success("Job re-dispatched to Celery!");
      setEvents([]);
      fetchDoc();
    } catch {
      toast.error("Retry request failed");
    }
  };

  const handleConfirmDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteDocument(id);
      toast.success("Document deleted permanently");
      router.push("/");
    } catch {
      toast.error("Deletion failed");
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 max-w-5xl mx-auto">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-slate-900/50 animate-pulse border border-slate-800" />
          ))}
        </div>
      </Layout>
    );
  }

  if (!doc) return null;

  const currentData = (doc.reviewed_data || doc.extracted_data) as Record<string, unknown> | null;
  const completedStages = events.map((e) => e.event);
  const isActive = doc.status === "queued" || doc.status === "processing";

  return (
    <Layout>
      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={showDeleteModal}
        onClose={() => !isDeleting && setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        itemName={doc.original_filename}
        itemMeta={`${doc.file_type.toUpperCase()} • ${formatFileSize(doc.file_size)} • Task ID: ${doc.celery_task_id || "N/A"}`}
        isDeleting={isDeleting}
      />

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top bar with back button */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="flex items-center gap-2">
            <StatusBadge status={doc.status} />
          </div>
        </div>

        {/* HERO TITLE & ACTION BAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl border border-indigo-500/15 bg-[#0d1020] shadow-xl">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold font-heading text-white truncate max-w-2xl mb-2">
              {doc.original_filename}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                {doc.file_type.toUpperCase()}
              </span>
              <span>{formatFileSize(doc.file_size)}</span>
              <span>•</span>
              <span>Ingested {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</span>
              {doc.retry_count > 0 && (
                <span className="text-amber-400 font-semibold">• Retried {doc.retry_count}x</span>
              )}
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Retry Button */}
            {doc.status === "failed" && (
              <button
                onClick={handleRetry}
                className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry Processing
              </button>
            )}

            {/* Finalize Button */}
            {doc.status === "completed" && doc.is_reviewed && (
              <button
                onClick={handleFinalize}
                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Finalize Document
              </button>
            )}

            {/* Export JSON / CSV */}
            {(doc.status === "completed" || doc.status === "finalized") && currentData && (
              <>
                <a
                  href={exportDocument(doc.id, "json")}
                  download
                  className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5" /> JSON
                </a>
                <a
                  href={exportDocument(doc.id, "csv")}
                  download
                  className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </a>
              </>
            )}

            {/* Delete button triggering DeleteModal */}
            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
              title="Delete Document"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2-COLUMN BENTO GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN (1/3): PIPELINE STEPPER & METADATA */}
          <div className="space-y-6">
            {/* Live Progress Card */}
            <div className="p-5 rounded-2xl border border-indigo-500/15 bg-[#0e1224] shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Execution Pipeline
                </span>
                <span className="text-lg font-bold font-mono text-indigo-400">
                  {doc.progress}%
                </span>
              </div>
              <ProgressBar progress={doc.progress} status={doc.status} size="md" />

              {/* STAGE TIMELINE */}
              <div className="mt-6 space-y-3">
                {STAGE_ORDER.map((stage, idx) => {
                  const done = completedStages.includes(stage) || (doc.status === "completed" || doc.status === "finalized");
                  const active = isActive && doc.current_stage === stage;
                  const isFailed = doc.status === "failed" && idx === completedStages.length;

                  return (
                    <div key={stage} className="flex items-start gap-3 text-xs">
                      <div className="flex flex-col items-center mt-0.5">
                        <div
                          className={`
                            w-4 h-4 rounded-full flex items-center justify-center transition-all
                            ${
                              done
                                ? "bg-emerald-500 text-black"
                                : active
                                ? "bg-indigo-600 ring-4 ring-indigo-500/25 animate-pulse"
                                : isFailed
                                ? "bg-red-500 text-white"
                                : "border border-slate-700 bg-slate-900"
                            }
                          `}
                        >
                          {done ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : null}
                        </div>
                        {idx < STAGE_ORDER.length - 1 && (
                          <div className={`w-0.5 h-4 my-1 ${done ? "bg-emerald-500/40" : "bg-slate-800"}`} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className={`font-medium ${done ? "text-slate-200" : active ? "text-indigo-400 font-semibold" : "text-slate-400"}`}>
                          {STAGE_LABELS[stage] || stage}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TECHNICAL SYSTEM METADATA */}
            <div className="p-5 rounded-2xl border border-slate-800 bg-[#0e1224] shadow-lg text-xs space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                System Diagnostics
              </span>

              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Internal File ID</span>
                <span className="font-mono text-slate-300 truncate max-w-[150px]">{doc.id}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">Celery Task ID</span>
                <span className="font-mono text-slate-300 truncate max-w-[150px]">
                  {doc.celery_task_id || "Unassigned"}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                <span className="text-slate-400">MIME Type</span>
                <span className="font-mono text-slate-300">{doc.mime_type || "N/A"}</span>
              </div>

              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">Review Status</span>
                <span className={doc.is_reviewed ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"}>
                  {doc.is_reviewed ? "Verified by Reviewer" : "Unreviewed Draft"}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (2/3): EXTRACTED SCHEMA & AI INSIGHTS BENTO */}
          <div className="lg:col-span-2 space-y-6">
            {/* AI COPILOT & INSIGHTS BENTO CARD */}
            <div className="p-6 rounded-2xl border border-purple-500/25 bg-gradient-to-b from-[#140f28] to-[#0c0e1b] shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      AI Document Intelligence & Insights
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-purple-500/20 border border-purple-500/40 text-purple-300">
                        COPILOT READY
                      </span>
                    </h3>
                    <p className="text-[11px] text-purple-200/70">
                      Automated classification and document synthesis powered by DocFlow pipeline.
                    </p>
                  </div>
                </div>
              </div>

              {currentData ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl border border-purple-500/15 bg-purple-950/20">
                    <span className="text-[11px] font-medium text-purple-300 block mb-1">Detected Category</span>
                    <span className="text-sm font-bold text-white">
                      {(currentData.category as string) || "General Document"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl border border-purple-500/15 bg-purple-950/20">
                    <span className="text-[11px] font-medium text-purple-300 block mb-1">Estimated Read Time / Words</span>
                    <span className="text-sm font-bold text-white">
                      {(currentData.word_count as number) || 0} words (~{Math.max(1, Math.round(((currentData.word_count as number) || 0) / 200))} min read)
                    </span>
                  </div>

                  <div className="sm:col-span-2 p-3.5 rounded-xl border border-purple-500/15 bg-purple-950/20">
                    <span className="text-[11px] font-medium text-purple-300 block mb-1">Executive Summary</span>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {(currentData.summary as string) || "No text summary available."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  Document is currently parsing. AI insights will appear once extraction is complete.
                </div>
              )}
            </div>

            {/* EXTRACTED SCHEMA / JSON VIEWER & REVIEW EDITOR */}
            <div className="p-6 rounded-2xl border border-indigo-500/15 bg-[#0c0e1b] shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">Structured Output Data</h3>
                </div>

                <div className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <button
                        onClick={() => setEditing(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveReview}
                        disabled={saving}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {saving ? "Saving..." : "Save Review"}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditing(true)}
                      className="px-3.5 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Extracted Fields
                    </button>
                  )}
                </div>
              </div>

              {/* EDITOR OR JSON PREVIEW */}
              {editing ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Reviewers can edit the extracted JSON schema directly before finalizing the document.
                  </p>
                  <textarea
                    rows={16}
                    value={JSON.stringify(editData, null, 2)}
                    onChange={(e) => {
                      try {
                        setEditData(JSON.parse(e.target.value));
                      } catch {}
                    }}
                    className="w-full p-4 rounded-xl bg-black/70 border border-slate-800 text-xs font-mono text-indigo-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800/80 bg-black/60 p-4 max-h-[500px] overflow-auto">
                  <pre className="text-xs font-mono text-indigo-300 leading-relaxed">
                    {currentData ? JSON.stringify(currentData, null, 2) : "// Awaiting worker results..."}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
