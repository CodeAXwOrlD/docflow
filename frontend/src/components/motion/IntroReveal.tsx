import React, { useEffect, useState, useRef, useCallback } from "react";
import { gsap } from "gsap";

interface IntroRevealProps {
  onComplete?: () => void;
}

export default function IntroReveal({ onComplete }: IntroRevealProps) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    if (!containerRef.current) {
      sessionStorage.setItem("docflow_intro_seen", "1");
      setVisible(false);
      onComplete?.();
      return;
    }

    sessionStorage.setItem("docflow_intro_seen", "1");
    gsap.to(containerRef.current, {
      opacity: 0,
      duration: 0.35,
      ease: "power2.out",
      onComplete: () => {
        setVisible(false);
        onComplete?.();
      },
    });
  }, [onComplete]);

  useEffect(() => {
    // Guard 1: Session storage check (run once per session)
    if (typeof window === "undefined") return;
    const hasSeen = sessionStorage.getItem("docflow_intro_seen");
    if (hasSeen) {
      onComplete?.();
      return;
    }

    // Guard 2: prefers-reduced-motion check
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      sessionStorage.setItem("docflow_intro_seen", "1");
      onComplete?.();
      return;
    }

    // Show intro
    setVisible(true);

    const timer = setTimeout(() => {
      dismiss();
    }, 1900);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        dismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismiss, onComplete]);

  useEffect(() => {
    if (!visible || !pathRef.current || !textRef.current) return;

    const ctx = gsap.context(() => {
      const path = pathRef.current!;
      const length = path.getTotalLength ? path.getTotalLength() : 300;

      gsap.set(path, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });

      const tl = gsap.timeline({
        onComplete: () => {
          setTimeout(dismiss, 350);
        },
      });

      tl.to(path, {
        strokeDashoffset: 0,
        duration: 0.9,
        ease: "power2.inOut",
      })
      .fromTo(
        textRef.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" },
        "-=0.3"
      );
    }, containerRef);

    return () => ctx.revert();
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      onClick={dismiss}
      role="dialog"
      aria-label="Welcome animation"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050814] select-none cursor-pointer transition-opacity"
    >
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-teal-400"
        >
          <path
            ref={pathRef}
            d="M16 12H40L52 24V52H16V12Z M40 12V24H52 M24 34H44 M24 42H36"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div ref={textRef} className="opacity-0">
          <div className="text-xl font-semibold tracking-tight text-white font-heading">
            Doc<span className="text-teal-400">Flow</span>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            Enterprise Document Intelligence
          </p>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        className="absolute bottom-6 right-6 px-3 py-1 rounded text-[11px] font-mono text-stone-400 hover:text-white bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
      >
        Skip [Esc]
      </button>
    </div>
  );
}
