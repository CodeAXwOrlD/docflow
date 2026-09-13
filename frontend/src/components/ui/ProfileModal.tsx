import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  User, Shield, Zap, Key, HardDrive, Cpu, X, Copy, Check, CheckCircle2, Sparkles, ExternalLink 
} from "lucide-react";
import toast from "react-hot-toast";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const [copiedKey, setCopiedKey] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("df_live_4f89b1c78e90a21f7c324901");
    setCopiedKey(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopiedKey(false), 2500);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="relative w-full max-w-lg rounded-2xl border border-indigo-500/20 bg-[#0d101d] p-6 shadow-2xl overflow-hidden"
          >
            {/* Ambient background glow */}
            <div className="absolute -top-20 -right-20 w-52 h-52 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-52 h-52 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-5 right-5 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* User Profile Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-0.5 shadow-lg shadow-indigo-500/25">
                  <div className="w-full h-full rounded-[14px] bg-[#0d101d] flex items-center justify-center font-bold text-xl text-white">
                    AM
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#0d101d] flex items-center justify-center">
                  <Check className="w-3 h-3 text-black stroke-[3]" />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-white tracking-tight">Alex Morgan</h3>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                    <Sparkles className="w-2.5 h-2.5" />
                    ENTERPRISE
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">lead.architect@docflow.internal</p>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Cluster Node Active · 0.12ms API Latency
                </div>
              </div>
            </div>

            {/* Quota & Capacity Bento Section */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                    Storage Volume
                  </span>
                  <span className="text-slate-300 font-mono">4.8%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-1.5">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: "4.8%" }} />
                </div>
                <div className="text-[11px] text-slate-400">2.4 GB of 50 GB used</div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    Celery Concurrency
                  </span>
                  <span className="text-emerald-400 font-mono">Healthy</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-1.5">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: "25%" }} />
                </div>
                <div className="text-[11px] text-slate-400">2 worker processes / gevent</div>
              </div>
            </div>

            {/* API Key Management */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  REST & Webhook Access Key
                </div>
                <span className="text-[10px] text-slate-400 font-mono uppercase">Live Environment</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-black/60 border border-slate-800 text-xs font-mono text-slate-300 select-all truncate">
                  df_live_4f89b1c78e90a21f7c324901
                </code>
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedKey ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Security badges */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400" />
                <span>Strict CORS & JWT Encrypted</span>
              </div>
              <a
                href="http://localhost:8000/docs"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Swagger API Docs <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
