import React from "react";
import { Clock, CheckCircle2, AlertTriangle, Sparkles, Loader2, XCircle } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const s = (status || "").toLowerCase();

  const configs: Record<string, { label: string; bg: string; border: string; text: string; icon: React.ReactNode }> = {
    queued: {
      label: "Queued",
      bg: "bg-amber-500/10",
      border: "border-amber-500/25",
      text: "text-amber-400",
      icon: <Clock className="w-3 h-3 animate-pulse text-amber-400" />,
    },
    processing: {
      label: "Processing",
      bg: "bg-indigo-500/15",
      border: "border-indigo-500/35",
      text: "text-indigo-300",
      icon: <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />,
    },
    completed: {
      label: "Completed",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/25",
      text: "text-emerald-400",
      icon: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
    },
    failed: {
      label: "Failed",
      bg: "bg-rose-500/10",
      border: "border-rose-500/25",
      text: "text-rose-400",
      icon: <AlertTriangle className="w-3 h-3 text-rose-400" />,
    },
    finalized: {
      label: "Finalized",
      bg: "bg-purple-500/15",
      border: "border-purple-500/30",
      text: "text-purple-300",
      icon: <Sparkles className="w-3 h-3 text-purple-300" />,
    },
    cancelled: {
      label: "Cancelled",
      bg: "bg-slate-500/10",
      border: "border-slate-500/20",
      text: "text-slate-400",
      icon: <XCircle className="w-3 h-3 text-slate-400" />,
    },
  };

  const current = configs[s] || {
    label: status,
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
    text: "text-slate-300",
    icon: <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />,
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border font-medium uppercase tracking-wider
        ${current.bg} ${current.border} ${current.text}
        ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"}
      `}
    >
      {current.icon}
      <span>{current.label}</span>
    </span>
  );
}
