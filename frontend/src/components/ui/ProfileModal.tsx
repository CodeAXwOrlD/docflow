import React, { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ExternalLink, KeyRound, LogIn, LogOut, Shield, X } from "lucide-react";
import toast from "react-hot-toast";
import { AppMode, User } from "@/types/document";
import { getAppMode, subscribeModeChange } from "@/lib/api";
import { clearAuthSession, getStoredUser, subscribeAuthChange } from "@/lib/auth";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const [mode, setMode] = useState<AppMode>("demo");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setMode(getAppMode());
    setUser(getStoredUser());
    const unsubMode = subscribeModeChange((m) => setMode(m));
    const unsubAuth = subscribeAuthChange((u) => setUser(u));
    return () => {
      unsubMode();
      unsubAuth();
    };
  }, []);

  const handleSignOut = () => {
    clearAuthSession();
    toast.success("Signed out");
    onClose();
  };

  const initials =
    mode === "demo"
      ? "DM"
      : user?.full_name
      ? user.full_name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((s) => s[0].toUpperCase())
          .join("")
      : "?";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative w-full max-w-md rounded-2xl bg-[#0b1123] border border-white/[0.08] p-6 shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-bold text-lg text-white">
                  {initials}
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0b1123] flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-black stroke-[3]" />
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-white">
                  {mode === "demo" ? "Demo Reviewer" : user?.full_name || "Guest (Live Mode)"}
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {mode === "demo"
                    ? "Local Browser Sandbox"
                    : user?.email || "Not signed in"}
                </p>
                <div className="text-[11px] text-slate-400 mt-1">
                  {mode === "demo" ? "Zero-cost client demo" : user ? "Tenant-isolated session" : "Sign in to manage BYOK keys"}
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3.5 mb-5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                BYOK AI Credentials
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Gemini and Groq API keys are encrypted on the backend and never exposed to the browser. Manage connections, default models, and usage logs in AI Settings.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Link
                  href="/settings"
                  onClick={onClose}
                  className="button-primary text-xs inline-flex items-center gap-1.5"
                >
                  <KeyRound className="w-3 h-3" />
                  Open AI Settings
                </Link>

                {mode === "live" && !user && (
                  <Link
                    href="/login"
                    onClick={onClose}
                    className="button-secondary text-xs inline-flex items-center gap-1.5"
                  >
                    <LogIn className="w-3 h-3" />
                    Sign In
                  </Link>
                )}

                {mode === "live" && user && (
                  <button
                    onClick={handleSignOut}
                    className="button-secondary text-xs inline-flex items-center gap-1.5 text-rose-300 hover:text-rose-200 cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" />
                    Sign Out
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                Fernet BYOK Encryption
              </div>
              <a
                href={`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "")}/docs`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-cyan-500 hover:text-cyan-400 transition-colors font-medium"
              >
                API docs <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
