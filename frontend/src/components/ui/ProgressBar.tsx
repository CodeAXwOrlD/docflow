import React from "react";

interface ProgressBarProps {
  progress: number;
  status?: string;
  showLabel?: boolean;
  height?: number;
}

export default function ProgressBar({ progress, status, showLabel = true, height = 6 }: ProgressBarProps) {
  let fillClass = "progress-fill";
  if (status === "completed" || status === "finalized") fillClass = "progress-fill progress-fill-green";
  if (status === "failed") fillClass = "progress-fill progress-fill-red";

  return (
    <div className="flex items-center gap-3">
      <div className="progress-track flex-1" style={{ height }}>
        <div className={fillClass} style={{ width: `${progress}%`, height: "100%" }} />
      </div>
      {showLabel && (
        <span className="text-xs font-mono font-semibold w-9 text-right" style={{ color: "var(--text-muted)" }}>
          {progress}%
        </span>
      )}
    </div>
  );
}
