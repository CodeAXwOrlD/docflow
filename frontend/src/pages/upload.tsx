import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import Layout from "@/components/Layout";
import { uploadDocuments, formatFileSize } from "@/lib/api";

const ALLOWED = [".pdf", ".txt", ".docx", ".doc", ".csv", ".xlsx", ".json", ".md"];

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    setFiles((prev) => {
      const map = new Map(prev.map((f) => [f.name + f.size, f]));
      accepted.forEach((f) => map.set(f.name + f.size, f));
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
      toast.success(`${files.length} document(s) queued for processing!`);
      router.push("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const FILE_ICONS: Record<string, string> = {
    ".pdf": "📄", ".txt": "📝", ".md": "📝", ".csv": "📊",
    ".xlsx": "📊", ".docx": "📋", ".doc": "📋", ".json": "🗃️",
  };

  return (
    <Layout>
      <div style={{
        padding: "20px 32px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 10,
        backdropFilter: "blur(8px)",
      }}>
        <h1 style={{
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif",
          color: "var(--text-primary)",
          margin: 0,
        }}>
          Upload Document
        </h1>
      </div>
      <div className="p-8 max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Upload Documents
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Drag & drop or browse. Up to 50MB per file. Supported: {ALLOWED.join(", ")}
          </p>
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`drop-zone p-12 text-center cursor-pointer mb-6 ${isDragActive ? "active" : ""}`}
        >
          <input {...getInputProps()} />
          <div className="text-5xl mb-4">{isDragActive ? "📂" : "☁️"}</div>
          <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            {isDragActive ? "Drop files here" : "Drag & drop files"}
          </p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>or click to browse</p>
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            {ALLOWED.map((ext) => (
              <span key={ext} className="badge" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>
                {ext}
              </span>
            ))}
          </div>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="card p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {files.length} file{files.length > 1 ? "s" : ""} ready
              </span>
              <button className="btn btn-ghost text-xs py-1" onClick={() => setFiles([])}>
                Clear all
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {files.map((file, idx) => {
                const ext = "." + file.name.split(".").pop()?.toLowerCase();
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ background: "var(--bg-secondary)" }}
                  >
                    <span className="text-2xl">{FILE_ICONS[ext] || "📎"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {file.name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {formatFileSize(file.size)} · {ext}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                      className="text-lg hover:opacity-70 transition-opacity"
                      style={{ color: "var(--text-muted)" }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upload button */}
        <button
          className="btn btn-primary w-full justify-center py-3 text-base"
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
        >
          {uploading ? (
            <><span className="spin-slow inline-block">⚙</span> Uploading & queueing…</>
          ) : (
            <><span>↑</span> Upload {files.length > 0 ? `${files.length} file${files.length > 1 ? "s" : ""}` : "Documents"}</>
          )}
        </button>
      </div>
    </Layout>
  );
}
