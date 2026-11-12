import React from "react";

interface SpatialFallbackProps {
  progress?: number;
}

export default function SpatialFallback({ progress = 0.5 }: SpatialFallbackProps) {
  // 4 steps representation
  const step = Math.min(3, Math.max(0, Math.floor(progress * 4)));

  return (
    <div
      role="img"
      aria-label="Document pipeline visualization: transforming raw unstructured files into structured verified JSON schema"
      className="w-full h-full min-h-[380px] flex items-center justify-center p-6 bg-[#080d1e]/80 border border-white/5 rounded-2xl relative overflow-hidden"
    >
      {/* Background grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#14b8a6_1px,transparent_1px)] [background-size:24px_24px] opacity-10" />

      <div className="relative z-10 w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between text-xs text-stone-400 font-mono border-b border-white/5 pb-2">
          <span>PIPELINE ENGINE</span>
          <span className="text-teal-400">
            {step === 0 && "INGESTION: UNSTRUCTURED RAW"}
            {step === 1 && "PREPROCESSING: TOKEN CHUNKING"}
            {step === 2 && "INFERENCE: NEURAL SCAN"}
            {step === 3 && "RESOLVED: STRUCTURED SCHEMA"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs font-mono">
          {/* Left panel: Raw input */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
            <div className="text-[10px] text-stone-500 uppercase tracking-wider">Raw Input</div>
            <div className="space-y-1.5 text-stone-400 text-[11px]">
              <div className="h-2 w-3/4 bg-stone-700/60 rounded" />
              <div className="h-2 w-full bg-stone-700/40 rounded" />
              <div className="h-2 w-5/6 bg-stone-700/50 rounded" />
              <div className="h-2 w-1/2 bg-stone-700/30 rounded" />
            </div>
          </div>

          {/* Right panel: Extracted output */}
          <div className="p-4 rounded-xl bg-teal-950/20 border border-teal-500/20 space-y-2">
            <div className="text-[10px] text-teal-400/80 uppercase tracking-wider">Normalized Output</div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between text-stone-300">
                <span className="text-stone-500">doc_id:</span>
                <span className="text-teal-300 font-semibold">&quot;INV-2026-09&quot;</span>
              </div>
              <div className="flex justify-between text-stone-300">
                <span className="text-stone-500">total:</span>
                <span className="text-emerald-400">$1,420.00</span>
              </div>
              <div className="flex justify-between text-stone-300">
                <span className="text-stone-500">status:</span>
                <span className="text-teal-400">&quot;finalized&quot;</span>
              </div>
            </div>
          </div>
        </div>

        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 transition-all duration-300 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
