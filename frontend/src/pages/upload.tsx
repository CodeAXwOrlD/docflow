import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/router";
import Head from "next/head";
import toast from "react-hot-toast";
import Link from "next/link";
import Layout from "@/components/Layout";
import {
  uploadDocuments,
  formatFileSize,
  getAppMode,
  setAppMode,
  getBackendHealth,
  subscribeModeChange,
  subscribeHealthChange,
  AppMode,
  BackendHealth,
} from "@/lib/api";
import { AIConnection, User } from "@/types/document";
import { getStoredUser, subscribeAuthChange } from "@/lib/auth";
import { liveDocumentService } from "@/services/liveDocumentService";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  FileCode,
  Trash2,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  FileUp,
  KeyRound,
} from "lucide-react";

const getFileIcon = (fileName: string) => {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (ext === ".csv" || ext === ".xlsx") return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
  if (ext === ".json") return <FileCode className="w-4 h-4 text-amber-400" />;
  return <FileText className="w-4 h-4 text-slate-400" />;
};

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<AppMode>("demo");
  const [health, setHealth] = useState<BackendHealth>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [connections, setConnections] = useState<AIConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [documentType, setDocumentType] = useState<"auto" | "invoice">("invoice");

  useEffect(() => {
    setMode(getAppMode());
    setHealth(getBackendHealth());
    setUser(getStoredUser());

    const unsubMode = subscribeModeChange((m) => setMode(m));
    const unsubHealth = subscribeHealthChange((h) => setHealth(h));
    const unsubAuth = subscribeAuthChange((u) => setUser(u));

    return () => {
      unsubMode();
      unsubHealth();
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (mode !== "live" || !user) {
      setConnections([]);
      return;
    }
    liveDocumentService
      .listAIConnections()
      .then((list) => {
        const active = list.filter((c) => c.is_active);
        setConnections(active);
        const def = active.find((c) => c.is_default) || active[0];
        if (def) setSelectedConnectionId(def.id);
      })
      .catch(() => {});
  }, [mode, user]);

  const onDrop = useCallback((accepted: File[]) => {
    const valid = accepted.filter((f) => {
      if (f.size === 0) {
        toast.error(`"${f.name}" is empty and can't be processed.`);
        return false;
      }
      return true;
    });

    setFiles((prev) => {
      const map = new Map(prev.map((f) => [f.name + f.size + f.lastModified, f]));
      valid.forEach((f) => map.set(f.name + f.size + f.lastModified, f));
      return Array.from(map.values());
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "text/plain": [".txt"],
      "text/markdown": [".md"],
      "text/csv": [".csv"],
      "application/json": [".json"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    maxSize: 50 * 1024 * 1024,
  });

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleStageSampleTemplate = (name: string, type: string) => {
    const blob = new Blob([`Sample content for ${name}`], { type: "text/plain" });
    const file = new File([blob], name, { type, lastModified: Date.now() });
    setFiles((prev) => [...prev, file]);
    toast.success(`Added ${name}`);
  };

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);

    try {
      if (mode === "demo") {
        await uploadDocuments(files);
        toast.success(`${files.length} file${files.length > 1 ? "s" : ""} added to demo.`, { duration: 3000 });
        router.push("/documents");
      } else {
        if (!user) {
          toast.error("Please sign in to upload documents in Live Mode.");
          router.push("/login?next=/upload");
          return;
        }
        if (health !== "healthy") {
          toast.error("Backend is offline. Switch to demo mode or wait for it to wake up.", { duration: 5000 });
          setUploading(false);
          return;
        }

        await uploadDocuments(files, {
          documentType,
          connectionId: selectedConnectionId || undefined,
        });
        toast.success(`${files.length} file${files.length > 1 ? "s" : ""} queued for AI extraction.`);
        router.push("/documents");
      }
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
      if (error?.response?.status === 413) {
        toast.error("File too large — max 50MB per file.");
      } else if (error?.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else {
        toast.error("Upload failed. Check your connection.");
      }
    } finally {
      setUploading(false);
    }
  };

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <Layout>
      <Head>
        <title>Upload — DocFlow</title>
        <meta name="description" content="Upload documents for AI extraction and validation." />
      </Head>

      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Documents</span>
          </Link>
        </div>

        {mode === "demo" ? (
          <div className="px-4 py-3 rounded-xl bg-cyan-950/40 border border-cyan-800/40 flex items-start gap-2.5 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <span className="text-cyan-300/90">
              <strong className="font-medium text-cyan-200">Demo mode</strong> — files are processed locally in your browser. Nothing is sent to any server.
            </span>
          </div>
        ) : (
          <>
            {health !== "healthy" && (
              <div className="px-4 py-3 rounded-xl bg-amber-950/30 border border-amber-700/30 flex items-start gap-2.5 text-xs">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-amber-200/90">
                    Backend is offline or starting up (~50s cold start on free tier).
                  </span>{" "}
                  <button
                    onClick={() => setAppMode("demo")}
                    className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                  >
                    Switch to demo mode
                  </button>
                </div>
              </div>
            )}

            {!user ? (
              <div className="px-4 py-3 rounded-xl bg-amber-950/30 border border-amber-700/30 flex items-center justify-between gap-3 text-xs">
                <span className="text-amber-200">Sign in required before uploading to Live Cluster.</span>
                <Link href="/login?next=/upload" className="button-primary text-xs">
                  Sign In
                </Link>
              </div>
            ) : (
              connections.length === 0 && (
                <div className="px-4 py-3 rounded-xl bg-rose-950/30 border border-rose-700/30 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-rose-200">
                    <KeyRound className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>No active Gemini or Groq API key configured. Add one to run AI extraction.</span>
                  </div>
                  <Link href="/settings" className="button-secondary text-xs flex-shrink-0">
                    Configure BYOK →
                  </Link>
                </div>
              )
            )}
          </>
        )}

        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight font-heading">Upload</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            PDF, DOCX, XLSX, CSV, JSON, TXT, Markdown — up to 50MB per file (multi-file batch supported)
          </p>
        </div>

        {/* Live AI Processing Options */}
        {mode === "live" && user && (
          <div className="surface-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">Document Workflow</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as "auto" | "invoice")}
                className="surface-input w-full text-xs cursor-pointer"
              >
                <option value="invoice" className="bg-[#0b1123]">Invoice Intelligence (GST & Validation)</option>
                <option value="auto" className="bg-[#0b1123]">Auto-Detect Document Type</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">AI Provider Connection</label>
              <select
                value={selectedConnectionId}
                onChange={(e) => setSelectedConnectionId(e.target.value)}
                className="surface-input w-full text-xs cursor-pointer"
              >
                {connections.length === 0 ? (
                  <option value="" className="bg-[#0b1123]">No active BYOK key</option>
                ) : (
                  connections.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0b1123]">
                      {c.provider.toUpperCase()} · {c.model} ({c.masked_api_key})
                      {c.is_default ? " [Default]" : ""}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        )}

        {mode === "demo" && (
          <div className="surface-card p-4 space-y-2.5">
            <div className="text-xs font-medium text-slate-400 flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-cyan-500" />
              Try a sample file
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => handleStageSampleTemplate("Vendor_Invoice_INV-9901.pdf", "application/pdf")}
                className="p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] text-left transition-all group cursor-pointer"
              >
                <div className="text-xs font-medium text-slate-300 group-hover:text-white">Invoice</div>
                <div className="text-[10px] text-slate-600 font-mono mt-0.5">PDF · Financial</div>
              </button>

              <button
                onClick={() => handleStageSampleTemplate("Mutual_NDA_Contract.docx", "application/docx")}
                className="p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] text-left transition-all group cursor-pointer"
              >
                <div className="text-xs font-medium text-slate-300 group-hover:text-white">NDA</div>
                <div className="text-[10px] text-slate-600 font-mono mt-0.5">DOCX · Legal</div>
              </button>

              <button
                onClick={() => handleStageSampleTemplate("SRE_Audit_Report.pdf", "application/pdf")}
                className="p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] text-left transition-all group cursor-pointer"
              >
                <div className="text-xs font-medium text-slate-300 group-hover:text-white">Audit Report</div>
                <div className="text-[10px] text-slate-600 font-mono mt-0.5">PDF · Report</div>
              </button>
            </div>
          </div>
        )}

        <div
          {...getRootProps()}
          className={`
            surface-card p-12 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all
            ${
              isDragActive
                ? "border-cyan-400/50 bg-cyan-950/20"
                : "border-white/[0.08] hover:border-white/[0.18] hover:bg-white/[0.01]"
            }
          `}
        >
          <input {...getInputProps()} />
          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mx-auto mb-4">
            <UploadCloud className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-200">
            {isDragActive ? "Drop files here" : "Drop invoices or documents, or click to browse"}
          </p>
          <p className="text-xs text-slate-500 mt-1.5">
            PDF, DOCX, XLSX, CSV, JSON, TXT, MD · Max 50MB
          </p>
        </div>

        {files.length > 0 && (
          <div className="surface-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-medium text-white">Ready to upload</h4>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {files.length} {files.length === 1 ? "file" : "files"} · {formatFileSize(totalBytes)}
                </div>
              </div>
              <button
                onClick={() => setFiles([])}
                className="text-xs text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
              >
                Clear all
              </button>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto custom-glass-scrollbar">
              {files.map((file, idx) => (
                <div
                  key={file.name + idx}
                  className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {getFileIcon(file.name)}
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">{file.name}</div>
                      <div className="text-[10px] text-slate-600 font-mono">{formatFileSize(file.size)}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(idx)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors flex-shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-1 flex items-center justify-end gap-2">
              <button
                onClick={() => setFiles([])}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-white text-slate-900 hover:bg-slate-100 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>
                  {uploading
                    ? "Uploading…"
                    : `Upload ${files.length} ${files.length === 1 ? "file" : "files"}`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
