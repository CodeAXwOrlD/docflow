import React, { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import Layout from "@/components/Layout";
import { uploadDocuments, formatFileSize } from "@/lib/api";

const ALLOWED = [".pdf", ".txt", ".docx", ".doc", ".csv", ".xlsx", ".json", ".md"];
const ACCEPT_STRING = ".pdf,.txt,.docx,.doc,.csv,.xlsx,.json,.md";

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
      toast.success(`${files.length} document(s) queued for processing!`);
      router.push("/");
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
      if (error?.response?.status === 413) {
        toast.error("File too large. Maximum size is 50MB.");
      } else if (error?.response?.status === 422) {
        toast.error("Invalid file. Please check the file format.");
      } else if (error?.response?.status && error.response.status >= 500) {
        toast.error("Server error. Please try again later.");
      } else if (error?.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else if (error?.message?.includes("Network Error")) {
        toast.error("Network error. Check your connection and try again.");
      } else {
        toast.error("Upload failed. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      onDrop(Array.from(selectedFiles));
    }
    // Reset so same file can be selected again
    e.target.value = "";
  };

  const FILE_ICONS: Record<string, string> = {
    ".pdf": "📄", ".txt": "📝", ".md": "📝", ".csv": "📊",
    ".xlsx": "📊", ".docx": "📋", ".doc": "📋", ".json": "🗃️",
  };

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
          Upload Document
        </h1>
      </div>
      <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto">
        <div className="mb-6 md:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Upload Documents
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Drag & drop or browse. Up to 50MB per file. Supported: {ALLOWED.join(", ")}
          </p>
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`drop-zone p-6 sm:p-12 text-center cursor-pointer mb-6 ${isDragActive ? "active" : ""}`}
          style={{ minHeight: 180 }}
        >
          <input {...getInputProps()} accept={ACCEPT_STRING} />
          <div className="text-4xl sm:text-5xl mb-4">{isDragActive ? "📂" : "☁️"}</div>
          <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            {isDragActive ? "Drop files here" : "Drag & drop files"}
          </p>
          <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>or click to browse</p>
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            {ALLOWED.map((ext) => (
              <span key={ext} className="badge" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}>
                {ext}
              </span>
            ))}
          </div>
        </div>

        {/* Fallback browse button for mobile */}
        <div className="mb-6">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_STRING}
            multiple
            onChange={handleFileInputChange}
            style={{ display: "none" }}
          />
          <button
            className="btn btn-ghost w-full justify-center"
            onClick={handleBrowseClick}
            style={{ minHeight: 48 }}
            type="button"
          >
            📁 Browse Files
          </button>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="card p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {files.length} file{files.length > 1 ? "s" : ""} ready
              </span>
              <button
                className="btn btn-ghost text-xs py-1"
                onClick={() => setFiles([])}
                style={{ minHeight: 44 }}
              >
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
                    <span className="text-2xl flex-shrink-0">{FILE_ICONS[ext] || "📎"}</span>
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
                      className="text-lg hover:opacity-70 transition-opacity flex-shrink-0"
                      style={{ color: "var(--text-muted)", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
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
          style={{ minHeight: 52 }}
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
