import React from "react";
import { STATUS_COLORS } from "@/lib/api";

interface StatusBadgeProps {
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  finalized: "Finalized",
  cancelled: "Cancelled",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  queued: "#f59e0b",
  processing: "#6366f1",
  completed: "#22c55e",
  failed: "#ef4444",
  finalized: "#a78bfa",
  cancelled: "#6b7280",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const isProcessing = status === "processing";
  return (
    <span className={`badge ${STATUS_COLORS[status] || ""}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full inline-block ${isProcessing ? "blink" : ""}`}
        style={{ background: STATUS_DOT_COLORS[status] || "#6b7280" }}
      />
      {STATUS_LABELS[status] || status}
    </span>
  );
}
