import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  LayoutDashboard,
  UploadCloud,
  Sun,
  Moon,
  Menu,
  X,
  CheckCircle2,
  Clock,
  AlertCircle,
  Radio,
  ChevronRight,
  Database,
  Layers,
  Sparkles,
  Server,
  ExternalLink,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import {
  getStats,
  Stats,
  getAppMode,
  getBackendHealth,
  subscribeModeChange,
  subscribeHealthChange,
  AppMode,
  BackendHealth,
} from "@/lib/api";
import { User } from "@/types/document";
import { getStoredUser, subscribeAuthChange } from "@/lib/auth";
import { useTheme } from "@/hooks/useTheme";
import ProfileModal from "@/components/ui/ProfileModal";
import ModeSwitcher from "@/components/ui/ModeSwitcher";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({});
  const { theme, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mode, setMode] = useState<AppMode>("demo");
  const [health, setHealth] = useState<BackendHealth>("checking");
  const [user, setUser] = useState<User | null>(null);

  const refreshStats = () => {
    getStats()
      .then((data) => setStats(data))
      .catch(() => {});
  };

  useEffect(() => {
    setMode(getAppMode());
    setHealth(getBackendHealth());
    setUser(getStoredUser());

    refreshStats();
    const interval = setInterval(refreshStats, 4500);

    const unsubMode = subscribeModeChange((m) => {
      setMode(m);
      refreshStats();
    });
    const unsubHealth = subscribeHealthChange((h) => setHealth(h));
    const unsubAuth = subscribeAuthChange((u) => {
      setUser(u);
      refreshStats();
    });

    return () => {
      clearInterval(interval);
      unsubMode();
      unsubHealth();
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [router.pathname]);

  const navItems = [
    { href: "/documents", label: "Documents", icon: LayoutDashboard },
    { href: "/upload", label: "Upload", icon: UploadCloud },
    { href: "/settings", label: "AI Settings", icon: KeyRound },
    { href: "/", label: "Overview & Story", icon: Sparkles },
  ];

  const getInitials = () => {
    if (mode === "demo") return "DM";
    if (!user?.full_name) return "?";
    return user.full_name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0].toUpperCase())
      .join("");
  };

  const getBreadcrumbLabel = () => {
    if (router.pathname === "/documents") return "Documents";
    if (router.pathname === "/upload") return "Upload";
    if (router.pathname === "/settings") return "AI Settings (BYOK)";
    if (router.pathname === "/login") return "Sign In";
    if (router.pathname.startsWith("/documents/")) return "Document Inspector";
    return "Workspace";
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#050814] text-[#f1f5f9] font-sans antialiased relative selection:bg-cyan-500/30 selection:text-cyan-200">
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />

      <div className="pointer-events-none fixed top-0 left-0 right-0 h-[400px] bg-gradient-to-b from-cyan-950/20 to-transparent z-0" />
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent z-40" />

      {/* MOBILE TOP BAR */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 bg-[#080e22]/90 backdrop-blur-2xl border-b border-white/[0.07]">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="DocFlow" width={26} height={26} className="w-6.5 h-6.5 opacity-90" />
          <span className="text-base font-semibold tracking-tight font-heading text-white">
            DocFlow
          </span>
        </div>

        <ModeSwitcher compact onDataRefresh={refreshStats} />
      </div>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`
          fixed md:static top-0 left-0 z-40
          w-60 h-full flex-shrink-0 flex flex-col
          bg-[#07091a] border-r border-white/[0.07]
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <div className="px-4 h-14 flex items-center gap-3 border-b border-white/[0.07]">
          <Image src="/logo.svg" alt="DocFlow" width={26} height={26} className="w-6.5 h-6.5 opacity-90" />
          <span className="text-sm font-semibold font-heading text-white tracking-tight">
            DocFlow
          </span>
          <span
            className={`ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
              mode === "demo"
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                : health === "healthy"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                mode === "demo" ? "bg-cyan-400" : health === "healthy" ? "bg-emerald-400" : "bg-rose-400"
              }`}
            />
            {mode === "demo" ? "demo" : health === "healthy" ? "live" : "offline"}
          </span>
        </div>

        <nav className="p-2 flex flex-col gap-0.5 mt-1">
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500 px-3 py-1.5 mb-1">
            Main
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              router.pathname === item.href ||
              (item.href === "/documents" && router.pathname.startsWith("/documents"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all
                  ${
                    active
                      ? "bg-white/[0.07] text-white font-medium"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] font-normal"
                  }
                `}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-slate-200" : "text-slate-500"}`} />
                <span>{item.label}</span>
                {active && <span className="ml-auto w-1 h-4 rounded-full bg-cyan-400" />}
              </Link>
            );
          })}
        </nav>

        <div className="mx-3 my-2 p-3.5 rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-3">
            Queue
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Queued
              </span>
              <span className="font-mono font-medium text-white tabular-nums">{stats["queued"] || 0}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-400">
                <Radio className="w-3.5 h-3.5 text-blue-400" />
                Processing
              </span>
              <span className="font-mono font-medium text-white tabular-nums">{stats["processing"] || 0}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Done
              </span>
              <span className="font-mono font-medium text-white tabular-nums">
                {(stats["completed"] || 0) + (stats["finalized"] || 0)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-400">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                Failed
              </span>
              <span className="font-mono font-medium text-white tabular-nums">{stats["failed"] || 0}</span>
            </div>
          </div>
        </div>

        <div className="mt-auto p-3 border-t border-white/[0.07]">
          <button
            onClick={() => setProfileOpen(true)}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all text-left group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
              {getInitials()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white truncate">
                {mode === "demo" ? "Demo Reviewer" : user?.full_name || "Sign in"}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {mode === "demo" ? "Sandbox" : user ? "Authenticated" : "Live Mode"}
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 h-full min-w-0 flex flex-col overflow-hidden relative z-10">
        <header className="flex-shrink-0 h-14 border-b border-white/[0.07] bg-[#050814]/80 backdrop-blur-xl px-6 flex items-center justify-between gap-4 z-20">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="text-slate-500">DocFlow</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-slate-200 font-medium">{getBreadcrumbLabel()}</span>
          </div>

          <div className="flex items-center gap-2">
            <ModeSwitcher onDataRefresh={refreshStats} />

            <button
              onClick={toggle}
              className="w-8 h-8 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            <button
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] transition-all text-xs font-medium text-slate-300 cursor-pointer"
            >
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                {getInitials()}
              </div>
              <span className="hidden sm:inline">
                {mode === "demo" ? "Demo" : user?.full_name.split(" ")[0] || "Account"}
              </span>
            </button>
          </div>
        </header>

        <div className="flex-1 h-full overflow-y-auto overflow-x-hidden relative flex flex-col custom-glass-scrollbar">
          <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto relative z-10">{children}</main>

          <footer className="flex-shrink-0 border-t border-white/[0.07] px-6 py-3 text-[11px] text-slate-500">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-4 flex-wrap justify-center font-mono">
                {mode === "demo" ? (
                  <>
                    <span className="flex items-center gap-1.5 text-cyan-500/80">
                      <Sparkles className="w-3 h-3" />
                      Demo mode — no data is sent anywhere
                    </span>
                    <span className="text-slate-700">·</span>
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3 text-emerald-500/80" />
                      Runs entirely in-browser
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <Database className="w-3 h-3 text-cyan-500/80" />
                      PostgreSQL{" "}
                      <span className={health === "healthy" ? "text-emerald-400" : "text-rose-400"}>
                        {health === "healthy" ? "connected" : "unreachable"}
                      </span>
                    </span>
                    <span className="text-slate-700">·</span>
                    <span className="flex items-center gap-1.5">
                      <Server className="w-3 h-3 text-slate-500" />
                      FastAPI + Celery + BYOK AI
                    </span>
                    <span className="text-slate-700">·</span>
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3 h-3 text-slate-500" />
                      Redis broker
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <a
                  href="https://github.com/CodeAXwOrlD/docflow"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-slate-300 transition-colors flex items-center gap-1"
                >
                  GitHub <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <span className="text-slate-700">·</span>
                <span className="font-mono text-slate-600">v2.0</span>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
