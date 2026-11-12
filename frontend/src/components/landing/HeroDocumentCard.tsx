import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { animate } from "animejs";
import { FileText, CheckCircle2, ArrowRight } from "lucide-react";

export default function HeroDocumentCard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const path1Ref = useRef<SVGPathElement>(null);
  const path2Ref = useRef<SVGPathElement>(null);

  // Tilt effect with gsap.quickTo
  useEffect(() => {
    if (!cardRef.current || typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const el = cardRef.current;
    gsap.set(el, { transformPerspective: 1000, transformStyle: "preserve-3d" });

    const rotX = gsap.quickTo(el, "rotationX", { duration: 0.3, ease: "power2.out" });
    const rotY = gsap.quickTo(el, "rotationY", { duration: 0.3, ease: "power2.out" });

    const handleMouseMove = (e: MouseEvent) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      // Max clamp to 6 degrees
      const clampX = Math.max(-6, Math.min(6, -(y / (rect.height / 2)) * 6));
      const clampY = Math.max(-6, Math.min(6, (x / (rect.width / 2)) * 6));

      rotX(clampX);
      rotY(clampY);
    };

    const handleMouseLeave = () => {
      rotX(0);
      rotY(0);
    };

    const target = containerRef.current || el;
    target.addEventListener("mousemove", handleMouseMove);
    target.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      target.removeEventListener("mousemove", handleMouseMove);
      target.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  // Anime.js modular stroke draw for pipeline connectors
  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const paths = [path1Ref.current, path2Ref.current].filter(Boolean) as SVGPathElement[];

    paths.forEach((p) => {
      const len = p.getTotalLength ? p.getTotalLength() : 200;
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;

      animate(p, {
        strokeDashoffset: [len, 0],
        duration: 1800,
        ease: "inOutQuad",
        loop: true,
      });
    });
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-xl mx-auto py-8">
      {/* SVG Pipeline Connectors */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
        viewBox="0 0 600 320"
        fill="none"
      >
        <defs>
          <linearGradient id="connector-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        <path
          ref={path1Ref}
          d="M 50 160 C 150 160, 180 80, 260 80"
          stroke="url(#connector-grad-1)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          ref={path2Ref}
          d="M 340 80 C 420 80, 450 160, 550 160"
          stroke="url(#connector-grad-1)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      {/* Tiltable Hero Card */}
      <div
        ref={cardRef}
        className="relative z-10 rounded-2xl bg-[#0a0f24]/90 border border-white/10 p-5 shadow-2xl backdrop-blur-xl"
      >
        {/* Card Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white tracking-tight text-left">
                invoice_acme_corp_q3.pdf
              </div>
              <div className="text-[11px] text-stone-400 text-left">
                842 KB · 3 pages · Invoice
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>99% confidence</span>
          </div>
        </div>

        {/* Card Body: Extraction Mapping */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 text-xs">
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2 text-left">
            <div className="text-[11px] font-medium text-stone-400">
              Extracted Details
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-stone-400">Vendor</span>
              <span className="text-stone-100 font-medium">Acme Logistics Corp</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-stone-400">Invoice No.</span>
              <span className="text-teal-300 font-medium">INV-2026-9042</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-stone-400">Billing Date</span>
              <span className="text-stone-200">2026-09-14</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2 text-left">
            <div className="text-[11px] font-medium text-stone-400">
              Totals Verified
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-stone-400">Subtotal</span>
              <span className="text-stone-200 tabular-nums">$1,850.00</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-stone-400">Tax (8.5%)</span>
              <span className="text-stone-200 tabular-nums">$157.25</span>
            </div>
            <div className="flex justify-between border-t border-white/[0.06] pt-1.5">
              <span className="text-stone-300 font-medium">Total Due</span>
              <span className="text-emerald-400 font-semibold tabular-nums">$2,007.25</span>
            </div>
          </div>
        </div>

        {/* Card Footer */}
        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-stone-400">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Math checks passed</span>
          </div>
          <div className="flex items-center gap-1 text-teal-400 hover:text-teal-300 font-medium">
            <span>Ready for review</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
