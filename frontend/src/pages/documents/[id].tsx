import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import toast from "react-hot-toast";
import Layout from "@/components/Layout";
import StatusBadge from "@/components/ui/StatusBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import {
  getDocument, updateReview, finalizeDocument, retryDocument,
  exportDocument, retryDocument as retryDoc, getSSEUrl,
  Document, ProgressEvent, formatFileSize,
} from "@/lib/api";
import { formatDistanceToNow, format } from "date-fns";

const STAGE_ORDER = [
  "job_started", "document_received", "document_parsing_started",
  "document_parsing_completed", "field_extraction_started",
  "field_extraction_completed", "storing_result", "job_completed",
];

const STAGE_LABELS: Record<string, string> = {
  job_started: "Job Started",
  document_received: "Document Received",
  document_parsing_started: "Parsing Started",
  document_parsing_completed: "Parsing Completed",
  field_extraction_started: "Field Extraction Started",
  field_extraction_completed: "Field Extraction Done",
  storing_result: "Storing Result",
  job_completed: "Job Completed",
  job_failed: "Job Failed",
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

  // SSE for live progress
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
    // Also poll for doc updates
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
      toast.success("Review saved!");
      setEditing(false);
      fetchDoc();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!id) return;
    try {
      await finalizeDocument(id);
      toast.success("Document finalized! 🎉");
      fetchDoc();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Finalization failed";
      toast.error(msg);
    }
  };

  const handleRetry = async () => {
    if (!id) return;
    try {
      await retryDoc(id);
      toast.success("Retrying…");
      setEvents([]);
      fetchDoc();
      setTimeout(() => {
        const es = new EventSource(getSSEUrl(id));
        sseRef.current = es;
        es.onmessage = (e) => {
          try {
            const event: ProgressEvent = JSON.parse(e.data);
            if (event.event === "connected") return;
            setEvents((prev) => [...prev.filter((p) => p.event !== event.event), event]);
            if (event.event === "job_completed" || event.event === "job_failed") {
              setTimeout(fetchDoc, 500);
              es.close();
            }
          } catch {}
        };
      }, 1000);
    } catch {
      toast.error("Retry failed");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="shimmer h-24 rounded-xl" />)}
        </div>
      </Layout>
    );
  }

  if (!doc) return null;

  const currentData = doc.reviewed_data || doc.extracted_data;
  const completedStages = events.map((e) => e.event);
  const isActive = doc.status === "queued" || doc.status === "processing";

  return (
    <Layout>
      <div
        className="px-4 py-4 sm:px-6 md:px-8"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-card)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(8px)",
        }}
      >
        <h1 style={{
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif",
          color: "var(--text-primary)",
          margin: 0,
        }}>
          Document Details
        </h1>
      </div>
      <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
        {/* Back */}
        <Link href="/" className="btn btn-ghost text-xs mb-4 sm:mb-6 inline-flex" style={{ minHeight: 44 }}>
          ← Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 md:mb-8">
          <div className="min-w-0">
            <h1
              className="text-xl sm:text-2xl font-bold mb-2 break-all"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {doc.original_filename}
            </h1>
            <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
              <StatusBadge status={doc.status} />
              <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                {doc.file_type} · {formatFileSize(doc.file_size)}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Created {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
              </span>
              {doc.retry_count > 0 && (
                <span className="badge" style={{ color: "#f59e0b", borderColor: "rgba(245,158,11,0.3)" }}>
                  Retry #{doc.retry_count}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            {doc.status === "failed" && (
              <button className="btn btn-danger" onClick={handleRetry} style={{ minHeight: 44 }}>⟳ Retry</button>
            )}
            {(doc.status === "completed" || doc.status === "finalized") && currentData && (
              <>
                <a href={exportDocument(doc.id, "json")} className="btn btn-ghost text-xs" download style={{ minHeight: 44 }}>
                  ↓ JSON
                </a>
                <a href={exportDocument(doc.id, "csv")} className="btn btn-ghost text-xs" download style={{ minHeight: 44 }}>
                  ↓ CSV
                </a>
              </>
            )}
            {doc.status === "completed" && doc.is_reviewed && (
              <button className="btn btn-success" onClick={handleFinalize} style={{ minHeight: 44 }}>
                ✓ Finalize
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left: Progress Timeline */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            {/* Progress bar */}
            <div className="card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  Progress
                </span>
                <span className="text-lg font-bold font-mono" style={{ color: "var(--accent-light)" }}>
                  {doc.progress}%
                </span>
              </div>
              <ProgressBar progress={doc.progress} status={doc.status} />
              {doc.current_stage && (
                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  {doc.current_stage.replace(/_/g, " ")}
                </p>
              )}
            </div>

            {/* Stage timeline */}
            <div className="card p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
                Processing Stages
              </p>
              <div className="flex flex-col">
                {STAGE_ORDER.map((stage, idx) => {
                  const done = completedStages.includes(stage) ||
                    (doc.status === "completed" || doc.status === "finalized");
                  const active = isActive && doc.current_stage === stage;
                  const isFailed = doc.status === "failed" && idx === completedStages.length;
                  const color = isFailed ? "#ef4444" : done ? "#22c55e" : active ? "#6366f1" : "var(--text-muted)";
                  return (
                    <div key={stage} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={`stage-dot ${active ? "blink" : ""}`}
                          style={{ borderColor: color, background: done ? color : "transparent" }}
                        />
                        {idx < STAGE_ORDER.length - 1 && (
                          <div
                            className="stage-line"
                            style={{ background: done ? "#22c55e" : "var(--border)" }}
                          />
                        )}
                      </div>
                      <div className="pb-4">
                        <p
                          className="text-xs font-medium"
                          style={{ color: done || active ? "var(--text-primary)" : "var(--text-muted)" }}
                        >
                          {STAGE_LABELS[stage]}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {doc.status === "failed" && (
                  <div className="flex gap-3">
                    <div className="stage-dot" style={{ borderColor: "#ef4444", background: "#ef4444" }} />
                    <p className="text-xs font-medium" style={{ color: "#ef4444" }}>Job Failed</p>
                  </div>
                )}
              </div>
            </div>

            {/* Error message */}
            {doc.error_message && (
              <div
                className="card p-4"
                style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}
              >
                <p className="text-xs font-semibold mb-1" style={{ color: "#ef4444" }}>Error</p>
                <p className="text-xs font-mono break-all" style={{ color: "#f87171" }}>{doc.error_message}</p>
              </div>
            )}

            {/* Metadata */}
            <div className="card p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
                Metadata
              </p>
              {[
                ["ID", doc.id.slice(0, 8) + "…"],
                ["Task ID", doc.celery_task_id?.slice(0, 8) + "…" || "—"],
                ["Created", format(new Date(doc.created_at), "MMM d, HH:mm")],
                ["Updated", format(new Date(doc.updated_at), "MMM d, HH:mm")],
                ...(doc.completed_at ? [["Completed", format(new Date(doc.completed_at), "MMM d, HH:mm")]] : []),
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{k}</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Extracted Data + Review */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {isActive && !currentData ? (
              <div className="card p-6 sm:p-8 text-center">
                <div className="text-4xl mb-4 spin-slow inline-block">⚙</div>
                <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Processing…</p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Live progress updates via SSE
                </p>
              </div>
            ) : currentData ? (
              <div className="card p-4 sm:p-5">
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      Extracted Data
                    </p>
                    {doc.is_reviewed && (
                      <span className="badge mt-1" style={{ color: "#22c55e", borderColor: "rgba(34,197,94,0.3)" }}>
                        ✓ Reviewed
                      </span>
                    )}
                  </div>
                  {(doc.status === "completed" || doc.status === "finalized") && (
                    <button
                      className={`btn ${editing ? "btn-ghost" : "btn-primary"} text-xs`}
                      onClick={() => {
                        if (editing) {
                          setEditData(currentData as Record<string, unknown>);
                        }
                        setEditing(!editing);
                      }}
                      style={{ minHeight: 44 }}
                    >
                      {editing ? "✕ Cancel" : "✎ Edit"}
                    </button>
                  )}
                </div>

                {/* Fields */}
                <div className="flex flex-col gap-3">
                  {Object.entries(editing ? editData : (currentData as Record<string, unknown>)).map(([key, value]) => (
                    <div key={key}>
                      <label
                        className="block text-xs font-semibold mb-1 uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {key.replace(/_/g, " ")}
                      </label>
                      {editing ? (
                        typeof value === "object" ? (
                          <textarea
                            className="input font-mono text-xs w-full"
                            rows={3}
                            value={JSON.stringify(value, null, 2)}
                            onChange={(e) => {
                              try {
                                setEditData((prev) => ({ ...prev, [key]: JSON.parse(e.target.value) }));
                              } catch {
                                setEditData((prev) => ({ ...prev, [key]: e.target.value }));
                              }
                            }}
                            style={{ minHeight: 44 }}
                          />
                        ) : (
                          <input
                            className="input text-sm w-full"
                            value={String(value ?? "")}
                            onChange={(e) => setEditData((prev) => ({ ...prev, [key]: e.target.value }))}
                            style={{ minHeight: 44 }}
                          />
                        )
                      ) : (
                        <div
                          className="rounded-lg px-3 py-2 text-sm font-mono"
                          style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", wordBreak: "break-all", overflowX: "auto" }}
                        >
                          {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "—")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Save button */}
                {editing && (
                  <div className="flex flex-col sm:flex-row gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                    <button className="btn btn-primary" onClick={handleSaveReview} disabled={saving} style={{ minHeight: 44 }}>
                      {saving ? "Saving…" : "✓ Save Review"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setEditing(false); setEditData(currentData as Record<string, unknown>); }} style={{ minHeight: 44 }}>
                      Cancel
                    </button>
                  </div>
                )}

                {/* Finalize prompt */}
                {doc.status === "completed" && doc.is_reviewed && !editing && (
                  <div
                    className="mt-4 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)" }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#4ade80" }}>Ready to finalize</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Review complete. Lock this document as finalized.
                      </p>
                    </div>
                    <button className="btn btn-success" onClick={handleFinalize} style={{ minHeight: 44 }}>
                      ✓ Finalize
                    </button>
                  </div>
                )}

                {/* Not reviewed prompt */}
                {doc.status === "completed" && !doc.is_reviewed && !editing && (
                  <div
                    className="mt-4 p-4 rounded-lg"
                    style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)" }}
                  >
                    <p className="text-sm font-semibold mb-1" style={{ color: "var(--accent-light)" }}>
                      Review required
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Click Edit to review and save the extracted data before finalizing.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {/* Live SSE events log */}
            {events.length > 0 && (
              <div className="card p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
                  Live Events (SSE)
                </p>
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                  {[...events].reverse().map((ev, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 sm:gap-3 py-2 px-3 rounded-lg text-xs"
                      style={{ background: "var(--bg-secondary)", fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      <span
                        className="w-8 text-right font-bold flex-shrink-0"
                        style={{ color: "var(--accent-light)" }}
                      >
                        {ev.progress}%
                      </span>
                      <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text-secondary)" }}>
                        {ev.message}
                      </span>
                      <span className="hidden sm:inline flex-shrink-0" style={{ color: "var(--text-muted)" }}>{ev.event}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
