import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Layout from "@/components/Layout";
import StatusBadge from "@/components/ui/StatusBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import DeleteModal from "@/components/ui/DeleteModal";
import { 
  listDocuments, 
  retryDocument, 
  deleteDocument, 
  Document, 
  DocumentListResponse, 
  formatFileSize 
} from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { 
  Search, 
  UploadCloud, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  Layers, 
  Radio, 
  CheckCircle2, 
  Zap, 
  RotateCcw, 
  Trash2, 
  ExternalLink, 
  Filter, 
  ArrowUpDown, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Clock,
  Eye,
  Activity
} from "lucide-react";

const getFileIcon = (type: string) => {
  const t = (type || "").toLowerCase();
  if (t === ".csv" || t === ".xlsx") return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
  if (t === ".json") return <FileCode className="w-4 h-4 text-amber-400" />;
  return <FileText className="w-4 h-4 text-indigo-400" />;
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

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await listDocuments({
        page,
        page_size: 15,
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
    const interval = setInterval(fetchDocs, 3500);
    return () => clearInterval(interval);
  }, [fetchDocs]);

  const handleRetry = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await retryDocument(id);
      toast.success("Document requeued for processing!");
      fetchDocs();
    } catch {
      toast.error("Retry failed");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteDocument(deleteTarget.id);
      toast.success(`"${deleteTarget.original_filename}" deleted successfully`);
      setDeleteTarget(null);
      fetchDocs();
    } catch {
      toast.error("Deletion failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const totalPages = data ? Math.ceil(data.total / 15) : 1;
  const totalDocs = data?.total || 0;

  // Calculate active in-flight count from current items
  const inFlightCount = data?.items.filter(
    (d) => d.status === "processing" || d.status === "queued"
  ).length || 0;
  const completedCount = data?.items.filter(
    (d) => d.status === "completed" || d.status === "finalized"
  ).length || 0;
  const successRate = totalDocs > 0 ? Math.round((completedCount / Math.max(1, data?.items.length || 1)) * 100) : 100;

  return (
    <Layout>
      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={!!deleteTarget}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        itemName={deleteTarget?.original_filename}
        itemMeta={deleteTarget ? `${deleteTarget.file_type.toUpperCase()} • ${formatFileSize(deleteTarget.file_size)} • ID: ${deleteTarget.id.slice(0, 8)}...` : ""}
        isDeleting={isDeleting}
      />

      <div className="space-y-6">
        {/* DASHBOARD HERO HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-heading">
                Pipeline Control Room
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                ASYNC
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Real-time document ingestion, distributed parsing, and structured schema extraction.
            </p>
          </div>

          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer self-start sm:self-auto"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Documents</span>
          </Link>
        </div>

        {/* 4 BENTO METRIC CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Bento Card 1: Total Docs */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="p-5 rounded-2xl border border-indigo-500/15 bg-[#0e1222]/80 backdrop-blur-md relative overflow-hidden group hover:border-indigo-500/30 transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Total Documents
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-heading text-white tracking-tight">
              {totalDocs}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-400 font-medium">
              <span>All formats cataloged</span>
            </div>
          </motion.div>

          {/* Bento Card 2: In-Flight */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="p-5 rounded-2xl border border-indigo-500/15 bg-[#0e1222]/80 backdrop-blur-md relative overflow-hidden group hover:border-indigo-500/30 transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                In-Flight Queue
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
            </div>
            <div className="text-3xl font-bold font-heading text-white tracking-tight">
              {inFlightCount}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Celery workers polling</span>
            </div>
          </motion.div>

          {/* Bento Card 3: Success Rate */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="p-5 rounded-2xl border border-indigo-500/15 bg-[#0e1222]/80 backdrop-blur-md relative overflow-hidden group hover:border-indigo-500/30 transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Completion Rate
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-heading text-white tracking-tight">
              {totalDocs > 0 ? `${successRate}%` : "100%"}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-400">
              <span>Zero dropped frames</span>
            </div>
          </motion.div>

          {/* Bento Card 4: Architecture Throughput */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="p-5 rounded-2xl border border-indigo-500/15 bg-[#0e1222]/80 backdrop-blur-md relative overflow-hidden group hover:border-indigo-500/30 transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Worker Engine
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-heading text-white tracking-tight">
              &lt;0.9s
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-purple-400">
              <Sparkles className="w-3 h-3" />
              <span>Pool caching active</span>
            </div>
          </motion.div>
        </div>

        {/* DOCUMENT EXPLORER BENTO SECTION */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className="rounded-2xl border border-indigo-500/15 bg-[#0b0e1b] shadow-xl overflow-hidden"
        >
          {/* SEARCH & FILTER CONTROLS */}
          <div className="p-4 sm:p-5 border-b border-indigo-500/10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search documents by filename or extension..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#121629] border border-slate-800 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
              {[
                { label: "All", val: "" },
                { label: "Queued", val: "queued" },
                { label: "Processing", val: "processing" },
                { label: "Completed", val: "completed" },
                { label: "Failed", val: "failed" },
              ].map((tab) => (
                <button
                  key={tab.val}
                  onClick={() => {
                    setStatus(tab.val);
                    setPage(1);
                  }}
                  className={`
                    px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer
                    ${
                      status === tab.val
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800/80"
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}

              {/* Sort selector */}
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#121629] border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="created_at">Date</option>
                  <option value="original_filename">Name</option>
                  <option value="file_size">Size</option>
                </select>

                <button
                  onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                  className="p-1.5 rounded-lg border border-slate-800 bg-[#121629] text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Toggle Sort Direction"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* TABLE CONTAINER */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-[#0e1224]/60 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  <th className="py-3 px-4 sm:px-6">Document</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Progress / Stage</th>
                  <th className="py-3 px-4">Ingested</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-sm">
                {loading && !data ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                        <span>Synchronizing documents with PostgreSQL...</span>
                      </div>
                    </td>
                  </tr>
                ) : data?.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="max-w-sm mx-auto flex flex-col items-center">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
                          <FileText className="w-6 h-6" />
                        </div>
                        <h4 className="text-base font-bold text-white mb-1">No documents found</h4>
                        <p className="text-xs text-slate-400 mb-4">
                          {search || status ? "Try adjusting your search or filters." : "Upload your first PDF, Word, or Excel document to begin processing."}
                        </p>
                        <Link
                          href="/upload"
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all"
                        >
                          Upload First Document
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data?.items.map((doc) => {
                    const isProcessing = doc.status === "processing";
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => router.push(`/documents/${doc.id}`)}
                        className="group hover:bg-[#12162d]/60 transition-colors cursor-pointer"
                      >
                        {/* Document Name */}
                        <td className="py-3.5 px-4 sm:px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center flex-shrink-0 group-hover:border-indigo-500/30 transition-colors">
                              {getFileIcon(doc.file_type)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-white truncate max-w-xs sm:max-w-sm group-hover:text-indigo-300 transition-colors">
                                {doc.original_filename}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                {doc.id.slice(0, 8)} • {doc.file_type.toUpperCase()}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* File Size */}
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-400">
                          {formatFileSize(doc.file_size)}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-4">
                          <StatusBadge status={doc.status} size="sm" />
                        </td>

                        {/* Stage Progress */}
                        <td className="py-3.5 px-4">
                          <div className="w-36">
                            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                              <span className="truncate max-w-[100px] capitalize">
                                {doc.current_stage ? doc.current_stage.replace(/_/g, " ") : doc.status}
                              </span>
                              <span className="font-mono">{doc.progress}%</span>
                            </div>
                            <ProgressBar
                              progress={doc.progress}
                              status={doc.status}
                              size="sm"
                            />
                          </div>
                        </td>

                        {/* Created At */}
                        <td className="py-3.5 px-4 text-xs text-slate-400 whitespace-nowrap">
                          {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 sm:px-6 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {/* View details */}
                            <Link
                              href={`/documents/${doc.id}`}
                              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Inspect Extracted Data"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>

                            {/* Retry button */}
                            {doc.status === "failed" && (
                              <button
                                onClick={(e) => handleRetry(e, doc.id)}
                                className="p-2 rounded-lg text-amber-400 hover:bg-amber-500/15 transition-colors cursor-pointer"
                                title="Retry Processing"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}

                            {/* Delete button triggering DeleteModal */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(doc);
                              }}
                              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Delete Document"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION FOOTER */}
          {data && data.total > 15 && (
            <div className="p-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing Page <span className="font-semibold text-white">{page}</span> of{" "}
                <span className="font-semibold text-white">{totalPages}</span> ({data.total} total)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </Layout>
  );
}
