import React, { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import toast from "react-hot-toast";
import Layout from "@/components/Layout";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  PlayCircle,
  Star,
  Trash2,
  Zap,
} from "lucide-react";
import {
  AIConnection,
  AIModelInfo,
  AIProviderName,
  AIUsageResponse,
  AppMode,
  User,
} from "@/types/document";
import {
  getAppMode,
  setAppMode,
  subscribeModeChange,
} from "@/lib/api";
import { getStoredUser, subscribeAuthChange } from "@/lib/auth";
import { liveDocumentService } from "@/services/liveDocumentService";

const FALLBACK_MODELS: Record<AIProviderName, AIModelInfo[]> = {
  gemini: [
    {
      id: "gemini-2.5-flash",
      display_name: "Gemini 2.5 Flash",
      provider: "gemini",
      context_window: 1048576,
      supports_structured_output: true,
      description: "Fast, cost-efficient structured extraction model.",
    },
    {
      id: "gemini-2.5-flash-lite",
      display_name: "Gemini 2.5 Flash-Lite",
      provider: "gemini",
      context_window: 1048576,
      supports_structured_output: true,
      description: "Ultra-low-latency model for high-volume invoice batches.",
    },
    {
      id: "gemini-2.5-pro",
      display_name: "Gemini 2.5 Pro",
      provider: "gemini",
      context_window: 1048576,
      supports_structured_output: true,
      description: "Highest reasoning accuracy for complex tax invoices.",
    },
  ],
  groq: [
    {
      id: "llama-3.3-70b-versatile",
      display_name: "Llama 3.3 70B Versatile",
      provider: "groq",
      context_window: 131072,
      supports_structured_output: true,
      description: "High-accuracy 70B model on Groq LPU.",
    },
    {
      id: "llama-3.1-8b-instant",
      display_name: "Llama 3.1 8B Instant",
      provider: "groq",
      context_window: 131072,
      supports_structured_output: true,
      description: "Ultra-fast 8B model for rapid batch extraction.",
    },
  ],
};

export default function SettingsPage() {
  const [mode, setMode] = useState<AppMode>("demo");
  const [user, setUser] = useState<User | null>(null);
  const [connections, setConnections] = useState<AIConnection[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, AIModelInfo[]>>(FALLBACK_MODELS);
  const [usage, setUsage] = useState<AIUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // New connection form state (API key kept strictly in ephemeral React state, never stored in browser storage)
  const [provider, setProvider] = useState<AIProviderName>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [label, setLabel] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [testingDraft, setTestingDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftTestResult, setDraftTestResult] = useState<{
    valid: boolean;
    message: string;
    usageInfo?: Record<string, unknown>;
  } | null>(null);

  // Per-connection actions
  const [busyConnId, setBusyConnId] = useState<string | null>(null);
  const [replacingConnId, setReplacingConnId] = useState<string | null>(null);
  const [replacementKey, setReplacementKey] = useState("");

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

  useEffect(() => {
    const list = modelsByProvider[provider] || FALLBACK_MODELS[provider];
    if (list && list.length > 0 && !list.some((m) => m.id === model)) {
      setModel(list[0].id);
    }
  }, [provider, modelsByProvider, model]);

  const loadSettingsData = useCallback(async () => {
    if (mode !== "live" || !user) return;
    setLoading(true);
    try {
      const [conns, models, usageRes] = await Promise.all([
        liveDocumentService.listAIConnections(),
        liveDocumentService.listAIModels(),
        liveDocumentService.getAIUsage(20),
      ]);
      setConnections(conns);
      if (Object.keys(models).length > 0) {
        setModelsByProvider(models);
      }
      setUsage(usageRes);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Failed to load AI provider settings.");
    } finally {
      setLoading(false);
    }
  }, [mode, user]);

  useEffect(() => {
    loadSettingsData();
  }, [loadSettingsData]);

  const handleTestDraft = async () => {
    if (!apiKey.trim()) {
      toast.error("Enter an API key to test.");
      return;
    }
    setTestingDraft(true);
    setDraftTestResult(null);
    try {
      const res = await liveDocumentService.testAIConnection({
        provider,
        api_key: apiKey.trim(),
        model,
      });
      setDraftTestResult({
        valid: res.valid,
        message: res.message,
        usageInfo: res.usage_info,
      });
      if (res.valid) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const msg = detail || "Connection test failed.";
      setDraftTestResult({ valid: false, message: msg });
      toast.error(msg);
    } finally {
      setTestingDraft(false);
    }
  };

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast.error("Enter your API key.");
      return;
    }
    setSavingDraft(true);
    try {
      await liveDocumentService.createAIConnection({
        provider,
        api_key: apiKey.trim(),
        model,
        label: label.trim() || undefined,
        is_active: true,
        is_default: setAsDefault,
        test_before_save: true,
      });
      // Immediately wipe API key from component state after submission
      setApiKey("");
      setLabel("");
      setDraftTestResult(null);
      toast.success(`${provider.toUpperCase()} API key verified, encrypted, and saved.`);
      await loadSettingsData();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Failed to save API key.");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleTestSaved = async (conn: AIConnection) => {
    setBusyConnId(conn.id);
    try {
      const res = await liveDocumentService.testAIConnection({
        connection_id: conn.id,
        model: conn.model,
      });
      if (res.valid) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
      await loadSettingsData();
    } catch {
      toast.error("Connection test failed.");
    } finally {
      setBusyConnId(null);
    }
  };

  const handleSetDefault = async (conn: AIConnection) => {
    setBusyConnId(conn.id);
    try {
      await liveDocumentService.updateAIConnection(conn.id, { is_default: true, is_active: true });
      toast.success(`Default provider set to ${conn.provider.toUpperCase()} (${conn.model}).`);
      await loadSettingsData();
    } catch {
      toast.error("Failed to update default provider.");
    } finally {
      setBusyConnId(null);
    }
  };

  const handleToggleActive = async (conn: AIConnection) => {
    setBusyConnId(conn.id);
    try {
      await liveDocumentService.updateAIConnection(conn.id, { is_active: !conn.is_active });
      toast.success(conn.is_active ? "Connection paused" : "Connection activated");
      await loadSettingsData();
    } catch {
      toast.error("Failed to update connection status.");
    } finally {
      setBusyConnId(null);
    }
  };

  const handleModelChange = async (conn: AIConnection, nextModel: string) => {
    setBusyConnId(conn.id);
    try {
      await liveDocumentService.updateAIConnection(conn.id, { model: nextModel });
      toast.success(`Model updated to ${nextModel}`);
      await loadSettingsData();
    } catch {
      toast.error("Failed to update model.");
    } finally {
      setBusyConnId(null);
    }
  };

  const handleReplaceKey = async (connId: string) => {
    if (!replacementKey.trim()) {
      toast.error("Enter the replacement API key.");
      return;
    }
    setBusyConnId(connId);
    try {
      await liveDocumentService.updateAIConnection(connId, { api_key: replacementKey.trim() });
      setReplacementKey("");
      setReplacingConnId(null);
      await liveDocumentService.testAIConnection({ connection_id: connId });
      toast.success("API key replaced and verified.");
      await loadSettingsData();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || "Failed to replace API key.");
    } finally {
      setBusyConnId(null);
    }
  };

  const handleDelete = async (conn: AIConnection) => {
    setBusyConnId(conn.id);
    try {
      await liveDocumentService.deleteAIConnection(conn.id);
      toast.success("Connection deleted.");
      await loadSettingsData();
    } catch {
      toast.error("Failed to delete connection.");
    } finally {
      setBusyConnId(null);
    }
  };

  const activeProviderModels = modelsByProvider[provider] || FALLBACK_MODELS[provider];

  return (
    <Layout>
      <Head>
        <title>AI Settings (BYOK) — DocFlow</title>
      </Head>

      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight font-heading">
              AI Provider Settings (BYOK)
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Connect your own Gemini or Groq API keys. Keys are encrypted at rest on the backend and never exposed to the browser.
            </p>
          </div>
          {mode === "live" && user && (
            <button
              onClick={loadSettingsData}
              disabled={loading}
              className="button-secondary inline-flex items-center gap-1.5 cursor-pointer self-start"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
        </div>

        {/* BYOK Billing & Security Transparency */}
        <div className="surface-card p-4 border-cyan-500/20 bg-cyan-950/15 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>Bring Your Own Key (BYOK) Security & Billing Responsibility</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            You provide your own <strong>Google Gemini</strong> or <strong>Groq</strong> API key. All AI inference calls are billed directly to your provider account under your own quota and rate limits. DocFlow still incurs its own infrastructure, database, queue, and file-storage hosting costs. Provider keys are encrypted with Fernet authenticated encryption in PostgreSQL, never stored in browser storage, and never passed in Celery task payloads.
          </p>
        </div>

        {mode === "demo" ? (
          <div className="surface-card p-6 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <PlayCircle className="w-4 h-4 text-cyan-400" />
              <span>Demo Mode Active</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              In Demo Mode, DocFlow runs client-side with pre-loaded AI extraction samples and zero backend network calls. Switch to <strong>Live Mode</strong> and sign in to configure real Gemini or Groq BYOK keys.
            </p>
            <button
              onClick={() => setAppMode("live")}
              className="button-primary inline-flex items-center gap-2 cursor-pointer"
            >
              Switch to Live Mode
            </button>
          </div>
        ) : !user ? (
          <div className="surface-card p-6 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>Sign in required for BYOK management</span>
            </div>
            <p className="text-xs text-slate-400">
              API provider credentials are strictly isolated per authenticated user. Sign in or create an account to manage your Gemini and Groq keys.
            </p>
            <Link href="/login?next=/settings" className="button-primary inline-flex items-center gap-2">
              Sign In / Register →
            </Link>
          </div>
        ) : (
          <>
            {/* Add Provider Key Form */}
            <form onSubmit={handleSaveConnection} className="surface-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-semibold text-white">Add AI Provider Connection</h2>
                </div>
                <span className="text-[11px] text-slate-400">
                  Verified on backend before saving
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1.5">Provider</label>
                  <select
                    value={provider}
                    onChange={(e) => {
                      setProvider(e.target.value as AIProviderName);
                      setDraftTestResult(null);
                    }}
                    className="surface-input w-full cursor-pointer"
                  >
                    <option value="gemini" className="bg-[#0b1123]">Google Gemini</option>
                    <option value="groq" className="bg-[#0b1123]">Groq Cloud</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1.5">Model</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="surface-input w-full cursor-pointer"
                  >
                    {activeProviderModels.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#0b1123]">
                        {m.display_name} ({m.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1.5">Label (optional)</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Finance Team Key"
                    className="surface-input w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">
                  {provider === "gemini" ? "Gemini API Key (Google AI Studio)" : "Groq API Key (gsk_...)"}
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setDraftTestResult(null);
                  }}
                  placeholder={provider === "gemini" ? "AIza..." : "gsk_..."}
                  className="surface-input w-full font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Your key is transmitted over HTTPS/TLS in production, verified directly by the backend, encrypted with Fernet, and cleared from this form immediately.
                </p>
              </div>

              {draftTestResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    draftTestResult.valid
                      ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/25 text-rose-300"
                  }`}
                >
                  {draftTestResult.valid ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  )}
                  <span>{draftTestResult.message}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={setAsDefault}
                    onChange={(e) => setSetAsDefault(e.target.checked)}
                    className="rounded border-white/20 bg-white/5"
                  />
                  Set as default provider for new documents
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestDraft}
                    disabled={testingDraft || savingDraft || !apiKey.trim()}
                    className="button-secondary inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {testingDraft ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                    <span>Test Connection</span>
                  </button>

                  <button
                    type="submit"
                    disabled={savingDraft || testingDraft || !apiKey.trim()}
                    className="button-primary inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {savingDraft && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{savingDraft ? "Verifying & Saving…" : "Save Key"}</span>
                  </button>
                </div>
              </div>
            </form>

            {/* Configured Connections */}
            <div className="surface-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-white">Configured Provider Connections</h2>
                </div>
                <span className="text-xs text-slate-400">
                  {connections.length} saved
                </span>
              </div>

              {connections.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No AI provider keys configured yet. Add a Gemini or Groq key above to start extracting invoices.
                </div>
              ) : (
                <div className="space-y-3">
                  {connections.map((conn) => {
                    const models = modelsByProvider[conn.provider] || FALLBACK_MODELS[conn.provider as AIProviderName] || [];
                    const isBusy = busyConnId === conn.id;
                    const statusColor =
                      conn.connection_status === "connected"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                        : conn.connection_status === "invalid" || conn.connection_status === "error"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/25"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/25";

                    return (
                      <div
                        key={conn.id}
                        className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.07] space-y-3"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-white/[0.06] text-white">
                                {conn.provider}
                              </span>
                              {conn.label && (
                                <span className="text-xs font-medium text-slate-200">{conn.label}</span>
                              )}
                              <code className="text-xs font-mono text-slate-400 bg-black/30 px-2 py-0.5 rounded">
                                {conn.masked_api_key}
                              </code>
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColor}`}>
                                {conn.connection_status}
                              </span>
                              {conn.is_default && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                  <Star className="w-2.5 h-2.5 fill-current" />
                                  Default
                                </span>
                              )}
                              {!conn.is_active && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400">
                                  Paused
                                </span>
                              )}
                            </div>
                            {conn.last_error && (
                              <p className="text-xs text-rose-300">{conn.last_error}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <select
                              value={conn.model}
                              disabled={isBusy}
                              onChange={(e) => handleModelChange(conn, e.target.value)}
                              className="surface-input text-xs py-1.5 cursor-pointer"
                            >
                              {models.map((m) => (
                                <option key={m.id} value={m.id} className="bg-[#0b1123]">
                                  {m.display_name}
                                </option>
                              ))}
                              {!models.some((m) => m.id === conn.model) && (
                                <option value={conn.model} className="bg-[#0b1123]">
                                  {conn.model}
                                </option>
                              )}
                            </select>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleTestSaved(conn)}
                              className="button-secondary cursor-pointer"
                            >
                              {isBusy ? "Working…" : "Test"}
                            </button>

                            {!conn.is_default && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleSetDefault(conn)}
                                className="button-secondary cursor-pointer"
                              >
                                Set Default
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleToggleActive(conn)}
                              className="button-secondary cursor-pointer"
                            >
                              {conn.is_active ? "Pause" : "Activate"}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setReplacingConnId(replacingConnId === conn.id ? null : conn.id);
                                setReplacementKey("");
                              }}
                              className="button-secondary cursor-pointer"
                            >
                              Replace Key
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDelete(conn)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 border border-white/[0.07] transition-colors cursor-pointer"
                              title="Delete connection"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {replacingConnId === conn.id && (
                          <div className="pt-2 border-t border-white/[0.06] flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <input
                              type="password"
                              autoComplete="off"
                              value={replacementKey}
                              onChange={(e) => setReplacementKey(e.target.value)}
                              placeholder={`Enter new ${conn.provider} API key`}
                              className="surface-input flex-1 font-mono text-xs"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleReplaceKey(conn.id)}
                              className="button-primary text-xs cursor-pointer"
                            >
                              Save Replacement
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReplacingConnId(null);
                                setReplacementKey("");
                              }}
                              className="button-secondary text-xs cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI Usage Telemetry */}
            <div className="surface-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-violet-400" />
                  <h2 className="text-sm font-semibold text-white">AI Provider Usage & Token Telemetry</h2>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Metadata only — zero document text stored
                </span>
              </div>

              {usage && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500">AI Requests</div>
                      <div className="text-xl font-bold text-white mt-1 font-heading">
                        {usage.totals.total_requests}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {usage.totals.successful_requests} ok · {usage.totals.failed_requests} failed
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500">Input Tokens</div>
                      <div className="text-xl font-bold text-cyan-400 mt-1 font-heading">
                        {usage.totals.input_tokens.toLocaleString()}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500">Output Tokens</div>
                      <div className="text-xl font-bold text-emerald-400 mt-1 font-heading">
                        {usage.totals.output_tokens.toLocaleString()}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500">Avg Duration</div>
                      <div className="text-xl font-bold text-white mt-1 font-heading">
                        {usage.totals.avg_duration_seconds}s
                      </div>
                    </div>
                  </div>

                  {usage.recent_logs.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-white/[0.06] text-slate-500 text-[11px]">
                            <th className="py-2 pr-4">Provider</th>
                            <th className="py-2 pr-4">Model</th>
                            <th className="py-2 pr-4">Tokens (In / Out)</th>
                            <th className="py-2 pr-4">Duration</th>
                            <th className="py-2 pr-4">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04] text-slate-300 font-mono text-[11px]">
                          {usage.recent_logs.slice(0, 8).map((log) => (
                            <tr key={log.id}>
                              <td className="py-2 pr-4 uppercase">{log.provider}</td>
                              <td className="py-2 pr-4 text-slate-400">{log.model}</td>
                              <td className="py-2 pr-4">
                                {log.input_tokens} / {log.output_tokens}
                              </td>
                              <td className="py-2 pr-4">{log.processing_duration.toFixed(2)}s</td>
                              <td className="py-2 pr-4">
                                <span
                                  className={
                                    log.status === "success" ? "text-emerald-400" : "text-rose-400"
                                  }
                                >
                                  {log.status}
                                  {log.error_category ? ` (${log.error_category})` : ""}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

