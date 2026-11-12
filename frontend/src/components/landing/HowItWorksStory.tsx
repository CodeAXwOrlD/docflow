import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import DynamicSpatialScene from "../spatial/DynamicSpatialScene";
import { UploadCloud, Layers, Cpu, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    id: 1,
    title: "1. Upload & Text Extraction",
    subtitle: "Validate file & extract text",
    desc: "Upload PDF, DOCX, CSV, XLSX, or TXT documents. Files are validated by type and parsed into clean text.",
    icon: UploadCloud,
    badge: "Step 1",
  },
  {
    id: 2,
    title: "2. Queue Processing",
    subtitle: "Asynchronous background workers",
    desc: "Jobs are dispatched via Redis to Celery workers, which resolve your encrypted Gemini or Groq key securely.",
    icon: Layers,
    badge: "Step 2",
  },
  {
    id: 3,
    title: "3. AI Extraction & Math Checks",
    subtitle: "Structured fields + code validation",
    desc: "Extracts invoice fields, GST details, and line items with evidence quotes, then runs deterministic math checks.",
    icon: Cpu,
    badge: "Step 3",
  },
  {
    id: 4,
    title: "4. Review & Export",
    subtitle: "Verify and download structured data",
    desc: "Inspect confidence levels and validation flags, edit or verify any field, and export single or batch JSON/CSV.",
    icon: ShieldCheck,
    badge: "Step 4",
  },
];

export default function HowItWorksStory() {
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setProgress(0.75);
      return;
    }

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: containerRef.current,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.2,
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

  const handleSelectStep = (idx: number) => {
    const targetProgress = Math.min(0.99, (idx + 0.35) / 4);
    setProgress(targetProgress);
    if (containerRef.current && typeof window !== "undefined") {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollTop = window.scrollY + rect.top;
      const scrollableDistance = Math.max(1, containerRef.current.offsetHeight - window.innerHeight);
      window.scrollTo({
        top: scrollTop + scrollableDistance * targetProgress,
        behavior: "smooth",
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-[#050814] text-white lg:h-[260vh] lg:min-h-[2000px]"
    >
      <div
        ref={triggerRef}
        className="lg:sticky lg:top-0 min-h-screen flex flex-col justify-center py-12 lg:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
      >
        <div className="mb-6">
          <div className="text-teal-400 text-xs font-medium mb-1.5">
            Workflow
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight font-heading">
            How DocFlow turns files into verified data
          </h2>
          <p className="text-stone-400 text-sm max-w-xl mt-1">
            Scroll through the pipeline or select any stage below to preview how documents are parsed, checked, and structured.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Steps column (left, 5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            {STEPS.map((step, idx) => {
              const isActive = activeStep === idx;
              const Icon = step.icon;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => handleSelectStep(idx)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-300 cursor-pointer ${
                    isActive
                      ? "bg-stone-900/90 border-teal-500/60 shadow-lg shadow-teal-500/10 translate-x-1"
                      : "bg-stone-950/40 border-white/5 opacity-55 hover:opacity-85"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-teal-400">
                      {step.badge}
                    </span>
                    <Icon className={`w-4 h-4 ${isActive ? "text-teal-300" : "text-stone-500"}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-white font-heading">
                    {step.title}
                  </h3>
                  <div className="text-[11px] text-stone-400 mb-1">
                    {step.subtitle}
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {step.desc}
                  </p>
                </button>
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
