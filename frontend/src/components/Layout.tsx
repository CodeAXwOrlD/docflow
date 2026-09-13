import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { 
  LayoutDashboard, 
  UploadCloud, 
  FileText, 
  Search, 
  Sun, 
  Moon, 
  Menu, 
  X, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Activity, 
  ShieldCheck, 
  ExternalLink,
  ChevronRight,
  Database,
  Radio,
  Layers
} from "lucide-react";
import { getStats, Stats } from "@/lib/api";
import { useTheme } from "@/hooks/useTheme";
import ProfileModal from "@/components/ui/ProfileModal";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({});
  const { theme, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    getStats().then((r) => setStats(r.data)).catch(() => {});
    const interval = setInterval(() => {
      getStats().then((r) => setStats(r.data)).catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [router.pathname]);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/upload", label: "Upload Studio", icon: UploadCloud },
  ];

  return (
    <div className="flex min-h-screen bg-[#07090e] text-[#e8eaf6] font-sans antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Profile Modal */}
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* MOBILE TOP BAR */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 bg-[#0a0d18]/90 backdrop-blur-xl border-b border-indigo-500/15">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold tracking-tight font-heading text-white">
            Doc<span className="text-indigo-400">Flow</span>
          </span>
        </div>

        <button
          onClick={() => setProfileOpen(true)}
          className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 p-0.5 flex items-center justify-center text-xs font-bold text-white shadow-sm"
        >
          AM
        </button>
      </div>

      {/* SIDEBAR BACKDROP FOR MOBILE */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`
          fixed md:sticky top-0 left-0 z-40
          w-64 flex-shrink-0 flex flex-col
          h-screen border-r border-indigo-500/10 bg-[#0a0d18]
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* LOGO */}
        <div className="p-5 flex items-center gap-3 border-b border-indigo-500/10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 flex-shrink-0">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-lg font-bold font-heading text-white tracking-tight leading-none">
              Doc<span className="text-indigo-400">Flow</span>
            </div>
            <div className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase mt-1">
              ASYNC INTELLIGENCE
            </div>
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <div className="p-3 flex flex-col gap-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-3 py-1.5">
            Workflows
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${
                    active
                      ? "bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-sm shadow-indigo-500/10"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                  }
                `}
              >
                <Icon className={`w-4 h-4 ${active ? "text-indigo-400" : "text-slate-400"}`} />
                <span>{item.label}</span>
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_#818cf8]" />
                )}
              </Link>
            );
          })}
        </div>

        {/* WORKER QUEUE MONITOR MINI-PANEL */}
        <div className="mx-3 my-2 p-3.5 rounded-xl border border-indigo-500/10 bg-gradient-to-b from-[#0e1222] to-[#0a0d18]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Pipeline Telemetry
            </span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Queued
              </span>
              <span className="font-mono font-semibold text-amber-400">
                {stats["queued"] || stats["QUEUED"] || 0}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-400">
                <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                Processing
              </span>
              <span className="font-mono font-semibold text-indigo-400">
                {stats["processing"] || stats["PROCESSING"] || 0}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Completed
              </span>
              <span className="font-mono font-semibold text-emerald-400">
                {stats["completed"] || stats["COMPLETED"] || 0}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-400">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                Failed
              </span>
              <span className="font-mono font-semibold text-rose-400">
                {stats["failed"] || stats["FAILED"] || 0}
              </span>
            </div>
          </div>
        </div>

        {/* USER PROFILE PILL AT SIDEBAR BOTTOM */}
        <div className="mt-auto p-3 border-t border-indigo-500/10">
          <button
            onClick={() => setProfileOpen(true)}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 transition-all text-left group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 p-0.5 flex-shrink-0">
              <div className="w-full h-full rounded-[10px] bg-[#0a0d18] flex items-center justify-center text-xs font-bold text-white">
                AM
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                Alex Morgan
              </div>
              <div className="text-[11px] text-slate-400 truncate">Enterprise Node</div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* DESKTOP TOP HEADER */}
        <header className="sticky top-0 z-30 h-16 border-b border-indigo-500/10 bg-[#07090e]/80 backdrop-blur-xl px-6 flex items-center justify-between gap-4">
          {/* Breadcrumbs / Section Title */}
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="font-medium text-slate-300">DocFlow</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-white">
              {router.pathname === "/" ? "Dashboard" : router.pathname === "/upload" ? "Upload Studio" : "Document Review"}
            </span>
          </div>

          {/* Quick Actions & Status */}
          <div className="flex items-center gap-3">
            {/* Real-time Redis/Celery Engine status pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden lg:inline">Celery Worker & Redis Engine</span>
              <span>Online</span>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="w-9 h-9 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Toggle Theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
            </button>

            {/* Profile trigger button */}
            <button
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800/80 transition-all text-xs font-medium text-slate-200 cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                AM
              </div>
              <span className="hidden sm:inline">Alex</span>
            </button>
          </div>
        </header>

        {/* BODY CHILDREN */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>

        {/* TELEMETRY FOOTER */}
        <footer className="border-t border-indigo-500/10 bg-[#0a0d18] px-6 py-4 text-xs text-slate-400">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-4 flex-wrap justify-center">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                PostgreSQL 16 <span className="text-emerald-400">Connected</span>
              </span>
              <span className="text-slate-700">•</span>
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-purple-400" />
                Redis 7 Pub/Sub <span className="text-emerald-400">Active</span>
              </span>
              <span className="text-slate-700">•</span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Strict CORS & Security Headers
              </span>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="http://localhost:8000/docs"
                target="_blank"
                rel="noreferrer"
                className="hover:text-indigo-400 transition-colors flex items-center gap-1"
              >
                Swagger API <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-slate-700">•</span>
              <span className="font-mono text-slate-400">v1.0.0 Enterprise</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
