import React, { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { ArrowLeft, KeyRound, Lock, Mail, User as UserIcon, Sparkles } from "lucide-react";
import { liveDocumentService } from "@/services/liveDocumentService";
import { getStoredUser } from "@/lib/auth";
import { setAppMode } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (getStoredUser()) {
      router.replace("/documents");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (tab === "login") {
        await liveDocumentService.login(email, password);
        toast.success("Signed in to DocFlow");
      } else {
        await liveDocumentService.register(email, fullName, password);
        toast.success("Account created and signed in");
      }
      setAppMode("live");
      const next = typeof router.query.next === "string" ? router.query.next : "/documents";
      router.push(next);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Authentication failed. Check your credentials and backend connection.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050814] text-[#f1f5f9] flex items-center justify-center p-4 relative">
      <Head>
        <title>{tab === "login" ? "Sign In" : "Create Account"} — DocFlow</title>
      </Head>

      <div className="pointer-events-none fixed top-0 left-0 right-0 h-[400px] bg-gradient-to-b from-cyan-950/20 to-transparent z-0" />

      <div className="relative z-10 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to workspace
          </Link>

          <button
            type="button"
            onClick={() => {
              setAppMode("demo");
              router.push("/documents");
            }}
            className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Use Demo Mode
          </button>
        </div>

        <div className="surface-card p-6 space-y-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400">
              <KeyRound className="w-3.5 h-3.5" />
              <span>LIVE CLUSTER AUTHENTICATION</span>
            </div>
            <h1 className="text-xl font-semibold text-white font-heading">
              {tab === "login" ? "Sign in to DocFlow" : "Create your DocFlow account"}
            </h1>
            <p className="text-xs text-slate-400">
              Required in Live Mode to isolate your documents, encrypted BYOK API keys, and AI usage logs.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                tab === "login" ? "bg-white text-slate-900" : "text-slate-400 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              className={`py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                tab === "register" ? "bg-white text-slate-900" : "text-slate-400 hover:text-white"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {tab === "register" && (
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    className="surface-input w-full pl-9"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="surface-input w-full pl-9"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={tab === "register" ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === "register" ? "Minimum 8 characters" : "Enter password"}
                  className="surface-input w-full pl-9"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="button-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {submitting
                ? "Please wait…"
                : tab === "login"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

