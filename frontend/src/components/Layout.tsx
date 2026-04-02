import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getStats, Stats } from "@/lib/api";
import { useTheme } from "@/hooks/useTheme";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({});
  const { theme, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    getStats().then((r) => setStats(r.data)).catch(() => {});
    const interval = setInterval(() => {
      getStats().then((r) => setStats(r.data)).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [router.pathname]);

  const navItems = [
    { href: "/", label: "Dashboard", icon: "⬡" },
    { href: "/upload", label: "Upload", icon: "↑" },
  ];

  return (
    <div className="flex min-h-screen relative" style={{ background: "var(--bg-primary)" }}>
      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4"
        style={{
          height: 56,
          background: "var(--sidebar-bg)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(12px)",
        }}
      >
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-primary)",
            fontSize: 22,
          }}
          aria-label="Toggle menu"
        >
          {sidebarOpen ? "✕" : "☰"}
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="3" width="11" height="14" rx="2" fill="white" opacity="0.9"/>
              <rect x="7" y="3" width="11" height="14" rx="2" fill="white" opacity="0.6" transform="rotate(6,12,10)"/>
              <rect x="4" y="3" width="11" height="14" rx="2" fill="white"/>
              <rect x="6.5" y="6.5" width="6" height="1.5" rx="0.75" fill="#4f46e5"/>
              <rect x="6.5" y="9.5" width="8" height="1" rx="0.5" fill="#818cf8"/>
              <circle cx="17" cy="17" r="4" fill="#22c55e"/>
              <path d="M15 17l1.5 1.5L19 15" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{
            fontSize: 17,
            fontWeight: 800,
            fontFamily: "'Space Grotesk', sans-serif",
            color: "var(--text-primary)",
          }}>
            Doc<span style={{ color: "var(--accent-light)" }}>Flow</span>
          </span>
        </div>

        {/* Theme toggle in mobile header */}
        <button
          onClick={toggle}
          className="flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
          }}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "🌙" : "☀️"}
        </button>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:sticky top-0 left-0 z-40
          w-64 md:w-56 flex-shrink-0 flex flex-col gap-2 p-4
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
        `}
        style={{
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          height: "100vh",
          overflowY: "auto",
          paddingTop: sidebarOpen ? 64 : undefined,
        }}
      >
        {/* Logo - hidden on mobile (shown in top bar instead) */}
        <div className="hidden md:flex items-center gap-3 px-2 mb-8 mt-3">
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(99,102,241,0.4)",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="3" width="11" height="14" rx="2" fill="white" opacity="0.9"/>
              <rect x="7" y="3" width="11" height="14" rx="2" fill="white" opacity="0.6" transform="rotate(6,12,10)"/>
              <rect x="4" y="3" width="11" height="14" rx="2" fill="white"/>
              <rect x="6.5" y="6.5" width="6" height="1.5" rx="0.75" fill="#4f46e5"/>
              <rect x="6.5" y="9.5" width="8" height="1" rx="0.5" fill="#818cf8"/>
              <rect x="6.5" y="12" width="7" height="1" rx="0.5" fill="#818cf8" opacity="0.6"/>
              <circle cx="17" cy="17" r="4" fill="#22c55e"/>
              <path d="M15 17l1.5 1.5L19 15" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{
              fontSize: 20,
              fontWeight: 800,
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: "-0.5px",
              lineHeight: 1,
              color: "var(--text-primary)",
            }}>
              Doc<span style={{ color: "var(--accent-light)" }}>Flow</span>
            </div>
            <div style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              color: "var(--text-muted)",
              fontWeight: 500,
              marginTop: 2,
            }}>
              ASYNC PROCESSING
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${router.pathname === item.href ? "active" : ""}`}
              style={{ minHeight: 44 }}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Stats */}
        <div className="mt-auto">
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
            Job Stats
          </div>
          <div className="flex flex-col gap-2">
            {[
              { key: "queued", label: "Queued", color: "#f59e0b" },
              { key: "processing", label: "Processing", color: "#6366f1" },
              { key: "completed", label: "Completed", color: "#22c55e" },
              { key: "failed", label: "Failed", color: "#ef4444" },
              { key: "finalized", label: "Finalized", color: "#a78bfa" },
            ].map(({ key, label, color }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
                </div>
                <span className="text-xs font-mono font-semibold" style={{ color }}>
                  {(stats as Record<string, number>)[key] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Theme toggle - desktop only (mobile has it in header) */}
        <button
          onClick={toggle}
          className="hidden md:flex"
          style={{
            width: "100%",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg-card-hover)",
            cursor: "pointer",
            marginBottom: 8,
            minHeight: 44,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>{theme === "dark" ? "🌙" : "☀️"}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
              {theme === "dark" ? "Dark mode" : "Light mode"}
            </span>
          </div>
          <div style={{
            width: 36,
            height: 20,
            borderRadius: 10,
            background: theme === "dark" ? "var(--accent)" : "var(--text-muted)",
            position: "relative",
            transition: "background 0.25s",
            flexShrink: 0,
          }}>
            <div style={{
              position: "absolute",
              top: 3,
              left: theme === "dark" ? 19 : 3,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "white",
              transition: "left 0.25s cubic-bezier(0.4,0,0.2,1)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}/>
          </div>
        </button>

        {/* Version */}
        <div className="text-xs text-center pt-4" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
          v1.0.0
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto grid-bg pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
