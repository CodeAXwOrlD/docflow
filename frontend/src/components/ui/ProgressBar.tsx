import React from "react";

interface ProgressBarProps {
  progress: number;
  status?: string;
  showLabel?: boolean;
  height?: number;
  size?: "sm" | "md" | "lg";
}

export default function ProgressBar({ 
  progress, 
  status, 
  showLabel = false, 
  height,
  size = "md" 
}: ProgressBarProps) {
  let effectiveHeight = height;
  if (!effectiveHeight) {
    if (size === "sm") effectiveHeight = 4;
    else if (size === "lg") effectiveHeight = 10;
    else effectiveHeight = 6;
  }

  let fillGradient = "from-indigo-500 to-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.5)]";
  if (status === "completed" || status === "finalized") {
    fillGradient = "from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]";
  } else if (status === "failed") {
    fillGradient = "from-rose-500 to-red-400 shadow-[0_0_12px_rgba(244,63,94,0.5)]";
  }

  return (
    <div className="flex items-center gap-2.5 w-full">
      <div 
        className="w-full bg-slate-800/80 rounded-full overflow-hidden relative"
        style={{ height: effectiveHeight }}
      >
        <div
          className={`h-full bg-gradient-to-r rounded-full transition-all duration-500 ease-out ${fillGradient}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-mono font-semibold text-slate-400 min-w-[32px] text-right">
          {progress}%
        </span>
      )}
    </div>
  );
}
