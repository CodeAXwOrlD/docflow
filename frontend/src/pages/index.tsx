import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import Layout from "@/components/Layout";
import StatusBadge from "@/components/ui/StatusBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import { listDocuments, retryDocument, deleteDocument, Document, DocumentListResponse, formatFileSize } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

const FILE_ICONS: Record<string, string> = {
  ".pdf": "📄", ".txt": "📝", ".md": "📝", ".csv": "📊",
  ".xlsx": "📊", ".docx": "📋", ".doc": "📋", ".json": "🗃️",
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DocumentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await listDocuments({
        page, page_size: 15,
        status: status || undefined,
        search: debouncedSearch || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setData(res.data);
    } catch {
      toast.error("Failed to fetch documents");
    } finally {
      setLoading(false);
    }
  }, [page, status, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    fetchDocs();
    const interval = setInterval(fetchDocs, 3000);
    return () => clearInterval(interval);
  }, [fetchDocs]);

  const handleRetry = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await retryDocument(id);
      toast.success("Job retried!");
      fetchDocs();
    } catch {
      toast.error("Retry failed");
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      await deleteDocument(id);
      toast.success("Document deleted");
      fetchDocs();
    } catch {
      toast.error("Deletion failed");
    }
  };

  const totalPages = data ? Math.ceil(data.total / 15) : 1;

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
          Dashboard
        </h1>
      </div>
      <div className="p-4 sm:p-6 md:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 md:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Document Jobs
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {data?.total ?? "–"} total documents
            </p>
          </div>
          <Link href="/upload" className="btn btn-primary" style={{ minHeight: 44 }}>
            <span>↑</span> Upload
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-6">
          <input
            className="input w-full sm:w-56"
            placeholder="Search by filename…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ minHeight: 44 }}
          />
          <div className="flex gap-3 w-full sm:w-auto">
            <select
              className="input flex-1 sm:flex-none sm:w-40"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              style={{ minHeight: 44 }}
            >
              <option value="">All statuses</option>
              {["queued", "processing", "completed", "failed", "finalized"].map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <select
              className="input flex-1 sm:flex-none sm:w-40"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ minHeight: 44 }}
            >
              <option value="created_at">Date</option>
              <option value="original_filename">Name</option>
              <option value="file_size">Size</option>
              <option value="status">Status</option>
            </select>
            <button
              className="btn btn-ghost px-3"
              onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
              title="Toggle sort order"
              style={{ minHeight: 44, minWidth: 44 }}
            >
              {sortOrder === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>

        {/* Desktop Table / Mobile Cards */}
        <div className="card overflow-hidden">
          {loading && !data ? (
            <div className="flex flex-col gap-2 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="shimmer h-14 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              {/* Desktop table view */}
              <div className="hidden md:block">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Size</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-16" style={{ color: "var(--text-muted)" }}>
                          No documents found. <Link href="/upload" style={{ color: "var(--accent-light)" }}>Upload one →</Link>
                        </td>
                      </tr>
                    ) : (
                      data?.items.map((doc) => (
                        <tr
                          key={doc.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/documents/${doc.id}`)}
                        >
                          <td>
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{FILE_ICONS[doc.file_type] || "📎"}</span>
                              <div>
                                <p className="font-medium truncate max-w-xs" style={{ color: "var(--text-primary)" }}>
                                  {doc.original_filename}
                                </p>
                                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                  {doc.file_type} · retry #{doc.retry_count}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td><StatusBadge status={doc.status} /></td>
                          <td style={{ minWidth: 140 }}>
                            <ProgressBar progress={doc.progress} status={doc.status} height={4} />
                            {doc.current_stage && (
                              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                                {doc.current_stage.replace(/_/g, " ")}
                              </p>
                            )}
                          </td>
                          <td className="font-mono text-xs">{formatFileSize(doc.file_size)}</td>
                          <td className="text-xs">
                            {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                          </td>
                          <td>
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/documents/${doc.id}`}
                                className="btn btn-ghost text-xs py-1 px-2"
                              >
                                View
                              </Link>
                              {doc.status === "failed" && (
                                <button
                                  className="btn btn-danger text-xs py-1 px-2"
                                  onClick={(e) => handleRetry(e, doc.id)}
                                >
                                  Retry
                                </button>
                              )}
                              <button
                                className="btn btn-danger text-xs py-1 px-2"
                                onClick={(e) => handleDelete(e, doc.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="md:hidden">
                {data?.items.length === 0 ? (
                  <div className="text-center py-16 px-4" style={{ color: "var(--text-muted)" }}>
                    No documents found. <Link href="/upload" style={{ color: "var(--accent-light)" }}>Upload one →</Link>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {data?.items.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-4 cursor-pointer"
                        style={{ borderBottom: "1px solid var(--border)" }}
                        onClick={() => router.push(`/documents/${doc.id}`)}
                      >
                        {/* Top row: icon + name + status */}
                        <div className="flex items-start gap-3 mb-3">
                          <span className="text-2xl flex-shrink-0">{FILE_ICONS[doc.file_type] || "📎"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate text-sm" style={{ color: "var(--text-primary)" }}>
                              {doc.original_filename}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <StatusBadge status={doc.status} />
                              <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                                {formatFileSize(doc.file_size)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Progress */}
                        <div className="mb-3">
                          <ProgressBar progress={doc.progress} status={doc.status} height={4} />
                          {doc.current_stage && (
                            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                              {doc.current_stage.replace(/_/g, " ")}
                            </p>
                          )}
                        </div>

                        {/* Bottom row: date + actions */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                          </span>
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Link
                              href={`/documents/${doc.id}`}
                              className="btn btn-ghost text-xs py-1 px-2"
                              style={{ minHeight: 36 }}
                            >
                              View
                            </Link>
                            {doc.status === "failed" && (
                              <button
                                className="btn btn-danger text-xs py-1 px-2"
                                onClick={(e) => handleRetry(e, doc.id)}
                                style={{ minHeight: 36 }}
                              >
                                Retry
                              </button>
                            )}
                            <button
                              className="btn btn-danger text-xs py-1 px-2"
                              onClick={(e) => handleDelete(e, doc.id)}
                              style={{ minHeight: 36 }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Page {page} of {totalPages} · {data.total} total
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-ghost text-xs py-1"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                style={{ minHeight: 44, minWidth: 44 }}
              >
                ← Prev
              </button>
              <button
                className="btn btn-ghost text-xs py-1"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{ minHeight: 44, minWidth: 44 }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
