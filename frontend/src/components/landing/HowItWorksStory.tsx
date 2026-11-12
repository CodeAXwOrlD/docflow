import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import DynamicSpatialScene from "../spatial/DynamicSpatialScene";
import { UploadCloud, Layers, Cpu, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    id: 1,
    title: "1. Raw Ingestion",
    subtitle: "MIME Verification & Buffer Extraction",
    desc: "Ingests PDF, TIFF, scanned images, and text files. Computes SHA-256 integrity hashes and extracts raw token planes.",
    icon: UploadCloud,
    badge: "01 / INGEST",
  },
  {
    id: 2,
    title: "2. Queue & Preprocessing",
    subtitle: "Distributed Task Splitting",
    desc: "Dispatched asynchronously to Redis. Celery worker clusters parse layouts, align reading order, and group bounding boxes.",
    icon: Layers,
    badge: "02 / QUEUE",
  },
  {
    id: 3,
    title: "3. Neural OCR & Entity Scan",
    subtitle: "Confidence-Scored Recognition",
    desc: "Scanline inference sweeps raw tokens, matching document fields into typed schema targets with precision confidence ratings.",
    icon: Cpu,
    badge: "03 / INFER",
  },
  {
    id: 4,
    title: "4. Human Review & Export",
    subtitle: "Zero-Data-Loss Normalization",
    desc: "Live SSE progress tracking, in-browser schema inspector, confidence threshold flags, and automated JSON/CSV downstream exports.",
    icon: ShieldCheck,
    badge: "04 / VERIFY",
  },
];

export default function HowItWorksStory() {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !triggerRef.current) return;

    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setProgress(0.75);
      return;
    }

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: triggerRef.current,
        start: "top top",
        end: "+=1800",
        pin: true,
        scrub: 0.5,
        onUpdate: (self) => {
          setProgress(self.progress);
        },
      });
    }, containerRef);

    return () => {
      ctx.revert();
    };
  }, []);

  const activeStep = Math.min(3, Math.max(0, Math.floor(progress * 4)));

  return (
    <div ref={containerRef} className="relative w-full bg-[#050814] text-white">
      <div
        ref={triggerRef}
        className="min-h-screen flex flex-col justify-center py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
      >
        <div className="mb-8">
          <div className="flex items-center gap-2 text-teal-400 font-mono text-xs tracking-wider uppercase mb-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            <span>Spatial Architecture Flow</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight font-heading">
            From Unstructured Data to Clean JSON
          </h2>
          <p className="text-stone-400 text-sm max-w-xl mt-1">
            Watch raw document tokens align, scan, and resolve into normalized schema in real time.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Steps column (left, 5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {STEPS.map((step, idx) => {
              const isActive = activeStep === idx;
              const Icon = step.icon;

              return (
                <div
                  key={step.id}
                  className={`p-4 rounded-xl border transition-all duration-300 ${
                    isActive
                      ? "bg-stone-900/80 border-teal-500/50 shadow-lg shadow-teal-500/5 translate-x-1"
                      : "bg-stone-950/40 border-white/5 opacity-40 hover:opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono tracking-widest text-teal-400 font-semibold">
                      {step.badge}
                    </span>
                    <Icon className={`w-4 h-4 ${isActive ? "text-teal-300" : "text-stone-500"}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-white font-heading">
                    {step.title}
                  </h3>
                  <div className="text-[11px] font-mono text-stone-400 mb-1">
                    {step.subtitle}
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Spatial 3D Scene column (right, 7 cols) */}
          <div className="lg:col-span-7 w-full">
            <DynamicSpatialScene progress={progress} />
          </div>
        </div>
      </div>
    </div>
  );
}
