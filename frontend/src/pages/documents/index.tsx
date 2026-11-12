import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Head from "next/head";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import Layout from "@/components/Layout";
import StatusBadge from "@/components/ui/StatusBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import DeleteModal from "@/components/ui/DeleteModal";
import {
  listDocuments,
  retryDocument,
  deleteDocument,
  exportBatchDocuments,
  Document,
  DocumentListResponse,
  formatFileSize,
  getAppMode,
  setAppMode,
  getBackendHealth,
  subscribeModeChange,
  subscribeHealthChange,
  AppMode,
  BackendHealth,
} from "@/lib/api";
import { User } from "@/types/document";
import { getStoredUser, subscribeAuthChange } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";
import {
  Search,
  Plus,
  FileText,
  RotateCcw,
  Trash2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  PlayCircle,
  AlertTriangle,
  ChevronDown,
  Download,
  LogIn,
  KeyRound,
} from "lucide-react";

export default function DocumentsPage() {
  const router = useRouter();
  const [data, setData] = useState<DocumentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mode, setMode] = useState<AppMode>("demo");
  const [health, setHealth] = useState<BackendHealth>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const hasShownOfflineToastRef = useRef(false);

  useEffect(() => {
    setMode(getAppMode());
    setHealth(getBackendHealth());
    setUser(getStoredUser());

    const unsubMode = subscribeModeChange((m) => {
      setMode(m);
      setPage(1);
      setSelectedIds([]);
    });
    const unsubHealth = subscribeHealthChange((h) => setHealth(h));
    const unsubAuth = subscribeAuthChange((u) => {
      setUser(u);
      setSelectedIds([]);
    });

    return () => {
      unsubMode();
      unsubHealth();
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchDocs = useCallback(async () => {
    if (mode === "live" && !user) {
      setData({ items: [], total: 0, page: 1, page_size: 15 });
      setLoading(false);
      return;
    }
    try {
      const res = await listDocuments({
        page,
        page_size: 15,
        status: status || undefined,
        search: debouncedSearch || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setData(res);
      hasShownOfflineToastRef.current = false;
    } catch {
      if (mode === "live" && !hasShownOfflineToastRef.current) {
        toast.error("Backend is offline or sleeping. Switch to Demo Mode to continue.", {
          id: "backend-down",
          duration: 5000,
        });
        hasShownOfflineToastRef.current = true;
      }
    } finally {
      setLoading(false);
    }
  }, [page, status, debouncedSearch, sortBy, sortOrder, mode, user]);

  useEffect(() => {
    fetchDocs();
    const interval = setInterval(fetchDocs, 4000);
    return () => clearInterval(interval);
  }, [fetchDocs]);

  const handleRetry = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setRetryingId(id);
    try {
      await retryDocument(id);
      toast.success("Document queued for reprocessing");
      await fetchDocs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Retry failed";
      toast.error(msg);
    } finally {
      setRetryingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteDocument(deleteTarget.id);
      toast.success(`"${deleteTarget.original_filename}" deleted`);
      setSelectedIds((prev) => prev.filter((i) => i !== deleteTarget.id));
      setDeleteTarget(null);
      await fetchDocs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deletion failed";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleBatchExport = async (format: "json" | "csv") => {
    if (!selectedIds.length) return;
    try {
      await exportBatchDocuments(selectedIds, format);
      toast.success(`Exported ${selectedIds.length} document(s) as ${format.toUpperCase()}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Batch export failed");
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 15)) : 1;
  const totalDocs = data?.total || 0;

  const inFlightCount =
    data?.items.filter((d) => d.status === "processing" || d.status === "queued").length || 0;
  const completedCount =
    data?.items.filter((d) => d.status === "completed" || d.status === "finalized").length || 0;
  const failedCount = data?.items.filter((d) => d.status === "failed").length || 0;

  const statusFilters = [
    { label: "All", value: "" },
    { label: "Queued", value: "queued" },
    { label: "Processing", value: "processing" },
    { label: "Completed", value: "completed" },
    { label: "Finalized", value: "finalized" },
    { label: "Failed", value: "failed" },
  ];

  return (
    <Layout>
      <Head>
        <title>Documents — DocFlow</title>
        <meta name="description" content="Manage and review your AI-processed documents." />
      </Head>

      <DeleteModal
        isOpen={!!deleteTarget}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        itemName={deleteTarget?.original_filename}
        itemMeta={
          deleteTarget
            ? `${deleteTarget.file_type.toUpperCase()} · ${formatFileSize(deleteTarget.file_size)} · ${deleteTarget.id.slice(0, 8)}`
            : ""
        }
        isDeleting={isDeleting}
      />

      <div className="space-y-5">
        {mode === "demo" ? (
          <div className="px-4 py-3 rounded-xl bg-cyan-950/40 border border-cyan-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-cyan-300/90">
              <PlayCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                <strong className="font-medium text-cyan-200">Demo mode</strong> — browsing pre-loaded sample documents. All edits are local only.
              </span>
            </div>
            <button
              onClick={() => setAppMode("live")}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] font-medium transition-colors cursor-pointer text-[11px]"
            >
              Connect to backend →
            </button>
          </div>
        ) : (
          <>
            {health !== "healthy" && (
              <div className="px-4 py-3 rounded-xl bg-amber-950/30 border border-amber-700/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="text-amber-200/90">
                    Backend is sleeping or unreachable. Render free-tier instances take ~50s to wake up.
                  </span>
                </div>
                <button
                  onClick={() => setAppMode("demo")}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-medium transition-all text-[11px] cursor-pointer"
                >
                  Use demo mode
                </button>
              </div>
            )}

            {!user && (
              <div className="surface-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-cyan-500/20">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-cyan-400" />
                    Sign in to access your Live Workspace
                  </div>
                  <p className="text-xs text-slate-400">
                    Documents and encrypted Gemini/Groq BYOK API keys are strictly isolated per account.
                  </p>
                </div>
                <Link href="/login?next=/documents" className="button-primary inline-flex items-center gap-1.5 flex-shrink-0">
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In / Register
                </Link>
              </div>
            )}
          </>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight font-heading">Documents</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {totalDocs > 0 ? `${totalDocs} document${totalDocs !== 1 ? "s" : ""} total` : "No documents yet"}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.length > 0 && (
              <>
                <button
                  onClick={() => handleBatchExport("json")}
                  className="button-secondary inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3 h-3 text-cyan-400" />
                  Batch JSON ({selectedIds.length})
                </button>
                <button
                  onClick={() => handleBatchExport("csv")}
                  className="button-secondary inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3 h-3 text-emerald-400" />
                  Batch CSV ({selectedIds.length})
                </button>
              </>
            )}

            <Link
              href="/upload"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-white text-slate-900 hover:bg-slate-100 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Upload</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="surface-card p-4">
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Total</div>
            <div className="text-2xl font-bold font-heading text-white mt-1">{totalDocs}</div>
          </div>

          <div className="surface-card p-4">
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">In progress</div>
            <div className="text-2xl font-bold font-heading text-white mt-1">{inFlightCount}</div>
          </div>

          <div className="surface-card p-4">
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Done</div>
            <div className="text-2xl font-bold font-heading text-emerald-400 mt-1">{completedCount}</div>
          </div>

          <div className="surface-card p-4">
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Failed</div>
            <div className="text-2xl font-bold font-heading text-white mt-1">{failedCount}</div>
          </div>
        </div>

        <div className="surface-card p-3 space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search filename, vendor, or invoice number…"
                className="w-full pl-9 pr-4 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 transition-all"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="appearance-none bg-white/[0.03] border border-white/[0.07] rounded-lg pl-3 pr-8 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 cursor-pointer"
                >
                  <option value="created_at" className="bg-[#080d1e] text-white">Date</option>
                  <option value="original_filename" className="bg-[#080d1e] text-white">Name</option>
                  <option value="file_size" className="bg-[#080d1e] text-white">Size</option>
                  <option value="status" className="bg-[#080d1e] text-white">Status</option>
                </select>
                <ChevronDown className="w-3 h-3 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <button
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] text-slate-400 hover:text-white transition-colors cursor-pointer"
                title={`Sort ${sortOrder === "asc" ? "descending" : "ascending"}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setStatus(f.value);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer ${
                  status === f.value
                    ? "bg-white/[0.08] text-white font-medium"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="surface-card overflow-hidden">
          {loading ? (
            <div className="p-16 text-center text-xs text-slate-500 space-y-2">
              <div className="w-5 h-5 border-2 border-slate-600 border-t-slate-200 rounded-full animate-spin mx-auto" />
              <div>Loading…</div>
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <FileText className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-medium text-slate-300">No documents</div>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                {search || status
                  ? "Nothing matches your filter. Try clearing search or status."
                  : "Upload an invoice or document to get started."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-slate-500 font-medium text-[11px]">
                    <th className="py-3 pl-4 pr-2 w-8"></th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Type / Provider</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Progress</th>
                    <th className="py-3 px-4">Added</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-slate-300">
                  {data.items.map((doc) => {
                    const checked = selectedIds.includes(doc.id);
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => router.push(`/documents/${doc.id}`)}
                        className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                      >
                        <td className="py-3 pl-4 pr-2" onClick={(e) => toggleSelect(e, doc.id)}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {}}
                            className="rounded border-white/20 bg-white/5 cursor-pointer"
                          />
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                              <FileText className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-200 truncate group-hover:text-white transition-colors flex items-center gap-2">
                                <span>{doc.original_filename}</span>
                                {doc.is_synthetic && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/[0.05] text-slate-400 border border-white/[0.06]">
                                    sample
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-600 font-mono truncate mt-0.5">
                                {doc.invoice_number ? `${doc.invoice_number} · ` : ""}
                                {doc.vendor_name || doc.id.slice(0, 16)}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                          <div>
                            {doc.file_type.toUpperCase()} · {formatFileSize(doc.file_size)}
                          </div>
                          {doc.ai_provider && (
                            <div className="text-[10px] text-cyan-400/80">
                              {doc.ai_provider} · {doc.ai_model}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <StatusBadge status={doc.status} />
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="w-28 space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                              <span className="truncate">
                                {doc.status === "failed" ? "Error" : doc.current_stage || "Waiting"}
                              </span>
                              <span>{doc.progress}%</span>
                            </div>
                            <ProgressBar progress={doc.progress} status={doc.status} />
                          </div>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-slate-500 text-[11px]">
                          {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Link
                              href={`/documents/${doc.id}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
                              title="View"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Link>

                            {doc.status === "failed" && (
                              <button
                                onClick={(e) => handleRetry(e, doc.id)}
                                disabled={retryingId === doc.id}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 transition-colors cursor-pointer"
                                title="Retry"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${retryingId === doc.id ? "animate-spin" : ""}`} />
                              </button>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(doc);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 transition-colors cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data && data.total > 0 && (
            <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-500">
              <div>
                {data.items.length} of {data.total}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-white/[0.07] hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] px-1">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-white/[0.07] hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
