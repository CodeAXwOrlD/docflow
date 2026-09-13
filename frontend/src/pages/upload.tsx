import React, { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/router";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Link from "next/link";
import Layout from "@/components/Layout";
import { uploadDocuments, formatFileSize } from "@/lib/api";
import { 
  UploadCloud, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  Trash2, 
  ArrowLeft, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  AlertCircle,
  CheckCircle2,
  FileUp,
  Cpu
} from "lucide-react";

const getFileIcon = (fileName: string) => {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (ext === ".csv" || ext === ".xlsx") return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
  if (ext === ".json") return <FileCode className="w-5 h-5 text-amber-400" />;
  return <FileText className="w-5 h-5 text-indigo-400" />;
};

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((accepted: File[]) => {
    setFiles((prev) => {
      const map = new Map(prev.map((f) => [f.name + f.size + f.lastModified, f]));
      accepted.forEach((f) => map.set(f.name + f.size + f.lastModified, f));
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

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    try {
      await uploadDocuments(files);
      toast.success(`${files.length} document(s) dispatched to Celery cluster!`);
      router.push("/");
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
      if (error?.response?.status === 413) {
        toast.error("File exceeds maximum allowed size of 50MB.");
      } else if (error?.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else {
        toast.error("Upload failed. Please check network connection.");
      }
    } finally {
      setUploading(false);
    }
  };

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top bar with back link */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-indigo-400 font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Multi-Format Ingestion</span>
          </div>
        </div>

        {/* Page Title */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-heading">
            Document Ingestion Studio
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Drop your documents here. They will be queued in Redis and processed asynchronously by our Celery worker cluster.
          </p>
        </div>

        {/* DROPZONE BENTO CARD */}
        <motion.div
          whileHover={{ scale: 1.005 }}
          transition={{ duration: 0.2 }}
        >
          <div
            {...getRootProps()}
            className={`
              relative p-8 sm:p-12 rounded-3xl border-2 border-dashed transition-all cursor-pointer text-center overflow-hidden
              ${
                isDragActive
                  ? "border-indigo-500 bg-indigo-500/10 shadow-[0_0_50px_rgba(99,102,241,0.25)]"
                  : "border-slate-800 hover:border-indigo-500/50 bg-[#0d1020]/70 hover:bg-[#0f1326]"
              }
            `}
          >
            <input {...getInputProps()} />

            {/* Background Radial Glow */}
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 via-transparent to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center">
              {/* Upload Icon with animated pulse */}
              <motion.div
                animate={isDragActive ? { scale: 1.15, y: -4 } : { scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/30 mb-4"
              >
                <UploadCloud className="w-8 h-8" />
              </motion.div>

              <h3 className="text-lg font-bold text-white mb-1">
                {isDragActive ? "Release files to queue..." : "Drag & drop files here, or browse"}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
                Supports <strong className="text-slate-200">PDF, DOCX, XLSX, CSV, JSON, Markdown, and TXT</strong> up to 50MB per file.
              </p>

              <button
                type="button"
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700 shadow-md transition-all cursor-pointer"
              >
                Browse Computer
              </button>
            </div>
          </div>
        </motion.div>

        {/* STAGING QUEUE LIST (IF FILES SELECTED) */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="p-5 sm:p-6 rounded-2xl border border-indigo-500/20 bg-[#0c0f1e] shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Staged for Ingestion ({files.length})</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Total payload: {formatFileSize(totalBytes)}
                  </p>
                </div>
                <button
                  onClick={() => setFiles([])}
                  className="text-xs text-rose-400 hover:text-rose-300 font-medium transition-colors"
                >
                  Clear All
                </button>
              </div>

              {/* File list */}
              <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto pr-1">
                {files.map((file, idx) => (
                  <div
                    key={file.name + idx}
                    className="py-3 flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center flex-shrink-0">
                        {getFileIcon(file.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-white truncate max-w-sm">
                          {file.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {formatFileSize(file.size)}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => removeFile(idx)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Remove from queue"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* SUBMIT BUTTON */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end gap-3">
                <button
                  onClick={() => setFiles([])}
                  disabled={uploading}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900/60 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Dispatching to Celery...</span>
                    </>
                  ) : (
                    <>
                      <FileUp className="w-4 h-4" />
                      <span>Dispatch {files.length} Document{files.length > 1 ? "s" : ""}</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SPECIFICATION HIGHLIGHTS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30">
            <div className="flex items-center gap-2 text-xs font-semibold text-white mb-1">
              <Zap className="w-4 h-4 text-indigo-400" />
              <span>Zero UI Lock</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Files are queued instantly in Redis. HTTP requests return immediately without freezing your browser.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30">
            <div className="flex items-center gap-2 text-xs font-semibold text-white mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Sanitized Storage</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Path traversal defense, strict file type validation, and automatic temporary file garbage collection.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30">
            <div className="flex items-center gap-2 text-xs font-semibold text-white mb-1">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span>Distributed Celery</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Multi-worker pool parses text, extracts metadata fields, and broadcasts progress over Redis Pub/Sub.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
