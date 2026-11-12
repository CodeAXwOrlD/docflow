import React, { useEffect, useRef } from "react";
import { Check, Loader2, AlertCircle, Clock, FileText, Layers, Database, Cpu } from "lucide-react";
import { JobStatus, PipelineStage } from "../../types/document";
import { animate } from "animejs";

interface StageTrackerProps {
  status: JobStatus;
  currentStage?: PipelineStage | string | null;
  progress: number;
  errorMessage?: string | null;
}

interface StepInfo {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
}

const STEPS: StepInfo[] = [
  { id: "step_ingest", label: "Received", sublabel: "Queued & validated", icon: Clock },
  { id: "step_parse", label: "Parsing", sublabel: "Text extraction", icon: FileText },
  { id: "step_extract", label: "AI & Validation", sublabel: "Structured extraction", icon: Layers },
  { id: "step_store", label: "Storing", sublabel: "Saving results", icon: Database },
];

export default function StageTracker({ status, currentStage, progress, errorMessage }: StageTrackerProps) {
  const lineRef = useRef<SVGLineElement>(null);

  const getActiveStepIndex = (): number => {
    if (status === "completed" || status === "finalized") return 4;
    if (status === "failed") {
      if (currentStage?.includes("parse") || currentStage?.includes("parsing")) return 1;
      if (
        currentStage?.includes("extract") ||
        currentStage?.includes("field") ||
        currentStage?.includes("ai_") ||
        currentStage?.includes("validation")
      ) {
        return 2;
      }
      return 0;
    }
    if (!currentStage || currentStage === "job_started" || currentStage === "document_received") return 0;
    if (currentStage.includes("parsing")) return 1;
    if (
      currentStage.includes("extraction") ||
      currentStage.includes("ai_") ||
      currentStage.includes("validation")
    ) {
      return 2;
    }
    if (currentStage.includes("storing")) return 3;
    return 0;
  };

  const activeIndex = getActiveStepIndex();

  // Anime.js modular stroke draw for stage connectors
  useEffect(() => {
    if (!lineRef.current || typeof window === "undefined") return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const targetWidth = Math.min(100, Math.max(0, (activeIndex / 3) * 100));
    animate(lineRef.current, {
      x2: `${targetWidth}%`,
      duration: 600,
      ease: "outQuad",
    });
  }, [activeIndex]);

  return (
    <div className="w-full surface-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-stone-500" />
          <h3 className="text-xs font-medium text-stone-300">
            Pipeline Stages
          </h3>
        </div>
        <span className="text-xs font-mono text-teal-400 font-semibold">
          {progress}%
        </span>
      </div>

      {/* SVG Connecting Track */}
      <div className="hidden sm:block relative w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
        <svg className="w-full h-full" preserveAspectRatio="none">
          <line
            ref={lineRef}
            x1="0%"
            y1="50%"
            x2={`${Math.min(100, Math.max(0, (activeIndex / 3) * 100))}%`}
            y2="50%"
            stroke="#14b8a6"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = activeIndex > idx || (activeIndex === 4 && status !== "failed");
          const isCurrent = activeIndex === idx && status !== "completed" && status !== "finalized";
          const isFailed = status === "failed" && activeIndex === idx;

          return (
            <div
              key={step.id}
              className={`
                relative p-3 rounded-xl border transition-all duration-200
                ${
                  isFailed
                    ? "bg-rose-500/[0.07] border-rose-500/20 text-rose-300"
                    : isCurrent
                    ? "bg-teal-500/[0.07] border-teal-500/30 text-teal-300 ring-1 ring-teal-500/20"
                    : isCompleted
                    ? "bg-emerald-500/[0.07] border-emerald-500/15 text-emerald-400"
                    : "bg-white/[0.02] border-white/[0.05] text-stone-600"
                }
              `}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-stone-500">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div
                  className={`
                    w-5 h-5 rounded-md flex items-center justify-center
                    ${
                      isFailed
                        ? "bg-rose-500/20 text-rose-400"
                        : isCurrent
                        ? "bg-teal-500/20 text-teal-300"
                        : isCompleted
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-white/[0.04] text-stone-600"
                    }
                  `}
                >
                  {isFailed ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : isCompleted ? (
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Icon className="w-3 h-3" />
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-stone-200">{step.label}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">{step.sublabel}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {status === "failed" && errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/[0.07] border border-rose-500/20 text-rose-200 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-medium text-rose-300">Processing error</div>
            <p className="text-rose-200/85 leading-relaxed text-xs">{errorMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
