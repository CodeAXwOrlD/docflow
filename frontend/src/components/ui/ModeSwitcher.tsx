import React, { useEffect, useState } from "react";
import { Server, RotateCcw, PlayCircle } from "lucide-react";
import {
  getAppMode,
  setAppMode,
  getBackendHealth,
  checkBackendHealth,
  resetDemoData,
  subscribeModeChange,
  subscribeHealthChange,
  AppMode,
  BackendHealth,
} from "../../lib/api";
import toast from "react-hot-toast";

interface ModeSwitcherProps {
  onDataRefresh?: () => void;
  compact?: boolean;
}

export default function ModeSwitcher({ onDataRefresh, compact = false }: ModeSwitcherProps) {
  const [mode, setMode] = useState<AppMode>("demo");
  const [health, setHealth] = useState<BackendHealth>("checking");
  const [switching, setSwitching] = useState(false);

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

  const handleToggleMode = async () => {
    setSwitching(true);
    const newMode: AppMode = mode === "demo" ? "live" : "demo";
    setAppMode(newMode);

    if (newMode === "live") {
      toast.loading("Connecting…", { id: "mode-switch", duration: 2500 });
      const h = await checkBackendHealth();
      if (h === "healthy") {
        toast.success("Connected to backend", { id: "mode-switch" });
      } else {
        toast.error("Backend is sleeping or unreachable. You can still use demo mode.", {
          id: "mode-switch",
          duration: 5000,
        });
      }
    } else {
      toast.success("Switched to demo mode", { id: "mode-switch" });
    }

    setSwitching(false);
    if (onDataRefresh) {
      onDataRefresh();
    }
  };

  const handleResetDemo = () => {
    resetDemoData();
    toast.success("Demo data reset");
    if (onDataRefresh) {
      onDataRefresh();
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleToggleMode}
        disabled={switching}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border
          cursor-pointer focus:outline-none
          ${
            mode === "demo"
              ? "bg-white/[0.03] text-cyan-400 border-white/[0.07] hover:bg-white/[0.06]"
              : health === "healthy"
              ? "bg-white/[0.03] text-emerald-400 border-white/[0.07] hover:bg-white/[0.06]"
              : "bg-white/[0.03] text-rose-400 border-white/[0.07] hover:bg-white/[0.06]"
          }
        `}
        title={`Switch to ${mode === "demo" ? "live" : "demo"} mode`}
      >
        {mode === "demo" ? (
          <>
            <PlayCircle className="w-3 h-3" />
            <span>Demo</span>
          </>
        ) : (
          <>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              health === "healthy" ? "bg-emerald-400" : health === "checking" ? "bg-amber-400" : "bg-rose-400"
            }`} />
            <Server className="w-3 h-3" />
            <span>
              {health === "healthy" ? "Live" : health === "checking" ? "Live" : "Offline"}
            </span>
          </>
        )}
      </button>

      {mode === "demo" && !compact && (
        <button
          onClick={handleResetDemo}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] transition-colors cursor-pointer"
          title="Reset demo data"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
