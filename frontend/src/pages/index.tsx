import React, { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Layers,
  Cpu,
  ShieldCheck,
  Github,
  UploadCloud,
  FileCode2,
} from "lucide-react";
import useLenis from "@/components/motion/LenisProvider";
import HeroDocumentCard from "@/components/landing/HeroDocumentCard";
import HowItWorksStory from "@/components/landing/HowItWorksStory";
import { getAppMode, setAppMode, getBackendHealth, AppMode, BackendHealth, subscribeModeChange, subscribeHealthChange } from "@/lib/api";

export default function LandingPage() {
  // Initialize Lenis smooth scroll on landing page only
  useLenis();

  const [mode, setMode] = useState<AppMode>("demo");
  const [health, setHealth] = useState<BackendHealth>("checking");

  useEffect(() => {
    setMode(getAppMode());
    setHealth(getBackendHealth());

    const unsubMode = subscribeModeChange((m) => setMode(m));
    const unsubHealth = subscribeHealthChange((h) => setHealth(h));

    return () => {
      unsubMode();
      unsubHealth();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050814] text-[#f1f5f9] font-sans antialiased selection:bg-teal-500/30 selection:text-teal-200 overflow-x-clip">
      <Head>
        <title>DocFlow — Enterprise Async Document Intelligence & Workflow</title>
        <meta
          name="description"
          content="Production-grade asynchronous document workflow engine. Transform unstructured PDFs, invoices, and scans into typed, verified JSON schemas with Celery, FastAPI, and human-in-the-loop review."
        />
      </Head>

      {/* Subtle ambient background wash */}
      <div className="pointer-events-none fixed top-0 left-0 right-0 h-[420px] bg-gradient-to-b from-slate-900/40 via-slate-950/10 to-transparent z-0" />

      {/* NAVIGATION BAR */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#050814]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/logo.svg"
              alt="DocFlow Logo"
              width={28}
              height={28}
              className="w-7 h-7 opacity-95 group-hover:scale-105 transition-transform"
            />
            <span className="text-base font-semibold tracking-tight font-heading text-white">
              Doc<span className="text-teal-400">Flow</span>
            </span>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs text-stone-400 font-medium">
            <a href="#how-it-works" className="hover:text-white transition-colors">
              How It Works
            </a>
            <a href="#architecture" className="hover:text-white transition-colors">
              Architecture
            </a>
            <Link href="/documents" className="hover:text-white transition-colors">
              Workspace
            </Link>
          </nav>

          {/* Action CTAs & Mode Indicator */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-900/80 border border-white/10 text-[11px]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  mode === "demo" ? "bg-cyan-400" : health === "healthy" ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <span className="text-stone-300">
                {mode === "demo" ? "Demo Mode" : health === "healthy" ? "Connected" : "Backend Offline"}
              </span>
            </div>

            <Link
              href="/documents"
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-stone-900 hover:bg-stone-200 transition-all shadow-sm"
            >
              Launch App
            </Link>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative z-10 pt-16 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-teal-300 text-xs font-medium mb-6">
          <span>Document &amp; Invoice Intelligence</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white font-heading max-w-4xl mx-auto leading-[1.12]">
          Turn unstructured documents into verified data.
        </h1>

        {/* Subtitle */}
        <p className="mt-5 text-sm sm:text-base text-stone-400 max-w-2xl mx-auto leading-relaxed">
          Upload invoices, PDFs, and spreadsheets to extract structured fields with your own Gemini or Groq API key,
          run automatic math checks, and review before exporting.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/documents"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-500 text-stone-950 font-semibold text-xs hover:bg-teal-400 transition-all shadow-lg shadow-teal-500/20 cursor-pointer"
          >
            <span>Open Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          <Link
            href="/upload"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/10 text-xs font-medium transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5 text-stone-400" />
            <span>Upload Document</span>
          </Link>

          <a
            href="https://github.com/CodeAXwOrlD/docflow"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-transparent hover:bg-white/[0.04] text-stone-400 hover:text-white border border-white/10 text-xs font-medium transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub</span>
          </a>
        </div>

        {/* Interactive Tilt Hero Document Card */}
        <div className="mt-8">
          <HeroDocumentCard />
        </div>
      </section>

      {/* HOW IT WORKS / 3D SPATIAL STORY PINNED SECTION */}
      <section id="how-it-works">
        <HowItWorksStory />
      </section>

      {/* ARCHITECTURAL SPECIFICATIONS SECTION */}
      <section id="architecture" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-white/[0.07]">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-medium text-teal-400 mb-2">
            Under the Hood
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-heading">
            Built for reliable document workflows
          </h2>
          <p className="text-xs sm:text-sm text-stone-400 mt-2">
            Every step from upload to export is backed by encrypted credentials, deterministic validation, and clear auditability.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 */}
          <div className="surface-card p-5 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white font-heading">
              Background Job Queue
            </h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Uploads queue immediately via Celery and Redis with automatic retries for transient provider rate limits.
            </p>
          </div>

          {/* Card 2 */}
          <div className="surface-card p-5 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Cpu className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white font-heading">
              Live Progress Stream
            </h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Track text parsing, AI extraction, and validation checks live in your browser via Server-Sent Events.
            </p>
          </div>

          {/* Card 3 */}
          <div className="surface-card p-5 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white font-heading">
              Review &amp; Math Verification
            </h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Inspect evidence quotes, flag missing or mismatched totals automatically, edit fields inline, and export JSON or CSV.
            </p>
          </div>

          {/* Card 4 */}
          <div className="surface-card p-5 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-slate-500/15 border border-white/10 flex items-center justify-center text-slate-300">
              <FileCode2 className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white font-heading">
              Interactive Demo Mode
            </h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Try sample invoice extractions and the full review editor in-browser even when no backend is connected.
            </p>
          </div>
        </div>
      </section>

      {/* CALL TO ACTION BANNER */}
      <section className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div className="p-8 sm:p-10 rounded-2xl bg-[#0b1224] border border-white/10 text-center space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-heading">
            Ready to review your documents?
          </h2>
          <p className="text-xs sm:text-sm text-stone-400 max-w-xl mx-auto">
            Open the workspace to test demo extractions, connect your Gemini or Groq API key, or upload invoices.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/documents"
              className="px-5 py-2.5 rounded-xl bg-white text-stone-900 font-semibold text-xs hover:bg-stone-200 transition-colors shadow-md"
            >
              Open Workspace →
            </Link>
            <Link
              href="/upload"
              className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white border border-white/10 text-xs font-medium transition-colors"
            >
              Upload Document
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-white/[0.07] py-8 px-4 sm:px-6 lg:px-8 text-xs text-stone-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px]">
            <span>DocFlow</span>
            <span>·</span>
            <span>Document Intelligence Platform</span>
          </div>

          <div className="flex items-center gap-6 text-[11px]">
            <Link href="/documents" className="hover:text-stone-300 transition-colors">
              Workspace
            </Link>
            <Link href="/upload" className="hover:text-stone-300 transition-colors">
              Upload
            </Link>
            <a
              href="https://github.com/CodeAXwOrlD/docflow"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-300 transition-colors"
            >
              Source Code
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
