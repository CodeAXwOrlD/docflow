import React, { useEffect, useState } from "react";
import {
  FileCode,
  Table,
  CheckCircle2,
  Edit3,
  Save,
  Sparkles,
  Layers,
  AlertCircle,
  AlertTriangle,
  Copy,
  Check,
  ShieldCheck,
  Quote,
  Cpu,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  DeterministicValidationReport,
  ExtractedField,
  InvoiceExtractionPayload,
} from "@/types/document";

interface SchemaInspectorProps {
  extractedData?: Record<string, unknown> | null;
  reviewedData?: Record<string, unknown> | null;
  isReviewed: boolean;
  status: string;
  onSaveReview: (updatedData: Record<string, unknown>) => Promise<void>;
  onFinalize: () => Promise<void>;
  isFinalizing: boolean;
}

const INVOICE_SCALAR_FIELDS: Array<{
  key: keyof Omit<InvoiceExtractionPayload, "gst" | "line_items" | "document_classification" | "summary" | "overall_confidence">;
  label: string;
  numeric?: boolean;
}> = [
  { key: "invoice_number", label: "Invoice Number" },
  { key: "invoice_date", label: "Invoice Date" },
  { key: "due_date", label: "Due Date" },
  { key: "vendor_name", label: "Vendor Name" },
  { key: "vendor_address", label: "Vendor Address" },
  { key: "customer_name", label: "Customer Name" },
  { key: "customer_address", label: "Customer Address" },
  { key: "currency", label: "Currency" },
  { key: "subtotal", label: "Subtotal", numeric: true },
  { key: "tax_amount", label: "Tax Amount", numeric: true },
  { key: "total_amount", label: "Total Amount", numeric: true },
  { key: "payment_terms", label: "Payment Terms" },
  { key: "purchase_order_reference", label: "PO Reference" },
];

const GST_FIELDS: Array<{
  key: keyof InvoiceExtractionPayload["gst"];
  label: string;
  numeric?: boolean;
}> = [
  { key: "vendor_gstin", label: "Vendor GSTIN" },
  { key: "customer_gstin", label: "Customer GSTIN" },
  { key: "taxable_value", label: "Taxable Value", numeric: true },
  { key: "cgst", label: "CGST", numeric: true },
  { key: "sgst", label: "SGST", numeric: true },
  { key: "igst", label: "IGST", numeric: true },
  { key: "place_of_supply", label: "Place of Supply" },
];

function confidenceBadge(conf: number, hasValue: boolean) {
  if (!hasValue) {
    return (
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/70 text-slate-400 border border-white/[0.06]">
        missing
      </span>
    );
  }
  const pct = Math.round(conf * 100);
  const cls =
    conf >= 0.85
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
      : conf >= 0.6
      ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
      : "bg-rose-500/10 text-rose-400 border-rose-500/25";
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cls}`}>
      {pct}%
    </span>
  );
}

function validationPill(status?: string) {
  if (!status || status === "unverified") return null;
  const styles: Record<string, string> = {
    valid: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    warning: "text-amber-300 bg-amber-500/10 border-amber-500/25",
    invalid: "text-rose-300 bg-rose-500/10 border-rose-500/25",
    missing: "text-slate-400 bg-white/[0.04] border-white/[0.08]",
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${styles[status] || styles.missing}`}>
      {status}
    </span>
  );
}

export default function SchemaInspector({
  extractedData,
  reviewedData,
  isReviewed,
  status,
  onSaveReview,
  onFinalize,
  isFinalizing,
}: SchemaInspectorProps) {
  const [activeTab, setActiveTab] = useState<"fields" | "json">("fields");
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentData = (reviewedData || extractedData || {}) as Record<string, unknown>;
  const isInvoiceV2 =
    typeof currentData === "object" &&
    currentData !== null &&
    typeof currentData.invoice === "object" &&
    currentData.invoice !== null;

  const [draftData, setDraftData] = useState<Record<string, unknown>>(() =>
    JSON.parse(JSON.stringify(currentData))
  );
  const [editedFlatFields, setEditedFlatFields] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    Object.entries(currentData).forEach(([k, v]) => {
      initial[k] = typeof v === "object" ? JSON.stringify(v, null, 2) : String(v ?? "");
    });
    return initial;
  });

  useEffect(() => {
    const next = (reviewedData || extractedData || {}) as Record<string, unknown>;
    setDraftData(JSON.parse(JSON.stringify(next)));
    const flat: Record<string, string> = {};
    Object.entries(next).forEach(([k, v]) => {
      flat[k] = typeof v === "object" ? JSON.stringify(v, null, 2) : String(v ?? "");
    });
    setEditedFlatFields(flat);
  }, [extractedData, reviewedData]);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(currentData, null, 2));
    setCopied(true);
    toast.success("Schema copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const updateInvoiceField = (
    section: "root" | "gst",
    key: string,
    patch: Partial<ExtractedField<unknown>>,
    numeric?: boolean
  ) => {
    setDraftData((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const inv = copy.invoice as Record<string, unknown>;
      const targetContainer = section === "gst" ? (inv.gst as Record<string, unknown>) : inv;
      const existing = (targetContainer[key] as ExtractedField<unknown>) || {
        value: null,
        confidence: 0,
        validation_status: "unverified",
      };
      let nextVal = patch.value !== undefined ? patch.value : existing.value;
      if (patch.value !== undefined && numeric) {
        const str = String(patch.value).trim();
        nextVal = str === "" ? null : isNaN(Number(str)) ? existing.value : Number(str);
      } else if (patch.value !== undefined && String(patch.value).trim() === "") {
        nextVal = null;
      }
      targetContainer[key] = {
        ...existing,
        ...patch,
        value: nextVal,
      };
      return copy;
    });
  };

  const handleToggleVerifyField = async (section: "root" | "gst", key: string) => {
    const next = JSON.parse(JSON.stringify(currentData));
    const inv = next.invoice as Record<string, unknown>;
    const container = section === "gst" ? (inv.gst as Record<string, unknown>) : inv;
    const f = container[key] as ExtractedField<unknown>;
    if (!f) return;
    const nextVerified = !f.verified_by_human;
    container[key] = {
      ...f,
      verified_by_human: nextVerified,
      validation_status: nextVerified ? "valid" : f.validation_status,
    };
    setIsSaving(true);
    try {
      await onSaveReview(next);
      toast.success(nextVerified ? "Field marked verified" : "Verification removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update verification");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (isInvoiceV2) {
        await onSaveReview(draftData);
      } else {
        const parsedPayload: Record<string, unknown> = {};
        for (const [key, valStr] of Object.entries(editedFlatFields)) {
          if (!key.trim()) continue;
          const trimmed = valStr.trim();
          if (trimmed === "true") parsedPayload[key] = true;
          else if (trimmed === "false") parsedPayload[key] = false;
          else if (trimmed !== "" && !isNaN(Number(trimmed)) && !trimmed.startsWith("0x")) {
            parsedPayload[key] = Number(trimmed);
          } else if (
            (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
            (trimmed.startsWith("[") && trimmed.endsWith("]"))
          ) {
            try {
              parsedPayload[key] = JSON.parse(trimmed);
            } catch {
              parsedPayload[key] = trimmed;
            }
          } else {
            parsedPayload[key] = trimmed;
          }
        }
        await onSaveReview(parsedPayload);
      }
      setIsEditing(false);
      toast.success("Review changes saved");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save review";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDraftData(JSON.parse(JSON.stringify(currentData)));
    const reset: Record<string, string> = {};
    Object.entries(currentData).forEach(([k, v]) => {
      reset[k] = typeof v === "object" ? JSON.stringify(v, null, 2) : String(v ?? "");
    });
    setEditedFlatFields(reset);
    setIsEditing(false);
  };

  if (!extractedData && !reviewedData) {
    return (
      <div className="surface-card p-8 text-center space-y-3">
        <Layers className="w-8 h-8 text-slate-600 mx-auto" />
        <h4 className="text-sm font-medium text-slate-400">No data yet</h4>
        <p className="text-xs text-slate-600 max-w-sm mx-auto">
          Processing hasn&apos;t completed for this document. Extracted fields will appear here once done.
        </p>
      </div>
    );
  }

  const activeSource = isEditing ? draftData : currentData;
  const invoice = isInvoiceV2 ? (activeSource.invoice as InvoiceExtractionPayload) : null;
  const validation = isInvoiceV2
    ? (activeSource.deterministic_validation as DeterministicValidationReport | undefined)
    : undefined;
  const aiMeta = isInvoiceV2
    ? (activeSource.ai_metadata as
        | {
            provider?: string;
            model?: string;
            overall_confidence?: number;
            total_tokens?: number;
            latency_ms?: number;
          }
        | undefined)
    : undefined;

  const hasAnyGstData =
    invoice &&
    GST_FIELDS.some((g) => {
      const field = invoice.gst?.[g.key];
      return field && field.value !== null && field.value !== undefined && String(field.value) !== "";
    });

  return (
    <div className="surface-card overflow-hidden">
      {/* Header bar */}
      <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.01]">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="segmented-track flex items-center">
            <button
              onClick={() => setActiveTab("fields")}
              className={`segmented-item flex items-center gap-1.5 ${
                activeTab === "fields" ? "segmented-item-active" : ""
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>{isInvoiceV2 ? "Invoice Review" : "Fields"}</span>
            </button>
            <button
              onClick={() => setActiveTab("json")}
              className={`segmented-item flex items-center gap-1.5 ${
                activeTab === "json" ? "segmented-item-active" : ""
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Raw JSON</span>
            </button>
          </div>

          {isReviewed && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-md">
              <CheckCircle2 className="w-3 h-3" />
              Reviewed by Human
            </span>
          )}

          {aiMeta?.provider && (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md">
              <Cpu className="w-3 h-3" />
              {aiMeta.provider} · {aiMeta.model}
              {typeof aiMeta.overall_confidence === "number" &&
                ` · ${Math.round(aiMeta.overall_confidence * 100)}% conf`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "json" ? (
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy JSON"}</span>
            </button>
          ) : isEditing ? (
            <>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-900 hover:bg-slate-100 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? "Saving…" : "Save Corrections"}</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Edit Fields</span>
              </button>

              {status === "completed" && (
                <button
                  onClick={onFinalize}
                  disabled={isFinalizing}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  title="Lock and finalize verified document schema"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-200" />
                  <span>{isFinalizing ? "Finalizing..." : "Finalize Schema"}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {activeTab === "json" ? (
          <div className="bg-[#050811] rounded-xl border border-white/5 p-4 overflow-x-auto max-h-[550px] custom-glass-scrollbar">
            <pre className="font-mono text-xs text-slate-300 leading-relaxed">
              {JSON.stringify(currentData, null, 2)}
            </pre>
          </div>
        ) : isInvoiceV2 && invoice ? (
          <div className="space-y-6">
            {/* Deterministic Validation Summary */}
            {validation && (
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  validation.overall_status === "valid"
                    ? "bg-emerald-950/20 border-emerald-500/25"
                    : validation.overall_status === "needs_review"
                    ? "bg-amber-950/20 border-amber-500/25"
                    : "bg-rose-950/20 border-rose-500/25"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    {validation.overall_status === "valid" ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    ) : validation.overall_status === "needs_review" ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>
                      Deterministic Validation:{" "}
                      {validation.overall_status === "valid"
                        ? "All arithmetic & integrity checks passed"
                        : validation.overall_status === "needs_review"
                        ? "Needs human review (warnings or missing fields)"
                        : "Validation mismatches detected"}
                    </span>
                  </div>

                  {typeof validation.computed_total === "number" && (
                    <span className="text-[11px] font-mono text-slate-300">
                      Code-computed total: {validation.computed_total.toFixed(2)}
                    </span>
                  )}
                </div>

                {validation.duplicate_matches && validation.duplicate_matches.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                    <strong>Potential Duplicate Invoice:</strong> Matches{" "}
                    {validation.duplicate_matches.map((d) => d.original_filename).join(", ")}.
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {validation.checks.map((chk) => (
                    <div
                      key={chk.code}
                      className="p-2.5 rounded-lg bg-black/25 border border-white/[0.06] flex items-start gap-2 text-xs"
                    >
                      <span
                        className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          chk.status === "passed"
                            ? "bg-emerald-400"
                            : chk.status === "warning"
                            ? "bg-amber-400"
                            : chk.status === "failed"
                            ? "bg-rose-400"
                            : "bg-slate-500"
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-200">{chk.label}</div>
                        <div className="text-[11px] text-slate-400">{chk.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Extracted Invoice Fields */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Extracted Invoice Fields (AI + Human Verification)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {INVOICE_SCALAR_FIELDS.map(({ key, label, numeric }) => {
                  const field = (invoice[key] as ExtractedField<unknown>) || {
                    value: null,
                    confidence: 0,
                    validation_status: "missing",
                  };
                  const hasValue =
                    field.value !== null && field.value !== undefined && String(field.value) !== "";

                  return (
                    <div
                      key={key}
                      className={`p-3.5 rounded-xl border transition-colors space-y-2 ${
                        field.validation_status === "invalid"
                          ? "bg-rose-950/15 border-rose-500/30"
                          : field.verified_by_human
                          ? "bg-emerald-950/10 border-emerald-500/25"
                          : isEditing
                          ? "bg-white/[0.03] border-cyan-400/25"
                          : "bg-white/[0.02] border-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          {label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {confidenceBadge(field.confidence, hasValue)}
                          {validationPill(field.validation_status)}
                          {!isEditing && (
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleToggleVerifyField("root", key)}
                              title={field.verified_by_human ? "Verified by human" : "Mark field verified"}
                              className={`p-1 rounded border text-[10px] transition-colors cursor-pointer ${
                                field.verified_by_human
                                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                                  : "bg-white/[0.03] border-white/[0.08] text-slate-500 hover:text-white"
                              }`}
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <input
                          type="text"
                          value={field.value === null || field.value === undefined ? "" : String(field.value)}
                          onChange={(e) =>
                            updateInvoiceField("root", key, { value: e.target.value }, numeric)
                          }
                          placeholder="Not present (null)"
                          className="w-full bg-[#080d1e] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-mono"
                        />
                      ) : (
                        <div className="text-xs font-mono text-white break-words">
                          {hasValue ? (
                            String(field.value)
                          ) : (
                            <span className="text-slate-600 italic">null (not extracted)</span>
                          )}
                        </div>
                      )}

                      {field.evidence && (
                        <div className="flex items-start gap-1.5 text-[10px] text-slate-500 font-mono">
                          <Quote className="w-3 h-3 flex-shrink-0 mt-0.5 text-slate-600" />
                          <span className="line-clamp-2">{field.evidence}</span>
                        </div>
                      )}
                      {field.validation_note && (
                        <div className="text-[10px] text-amber-300/90">{field.validation_note}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* GST Section (shown when GST fields exist or when editing) */}
            {(hasAnyGstData || isEditing) && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Indian GST Fields
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {GST_FIELDS.map(({ key, label, numeric }) => {
                    const field = invoice.gst?.[key] || {
                      value: null,
                      confidence: 0,
                      validation_status: "missing",
                    };
                    const hasValue =
                      field.value !== null && field.value !== undefined && String(field.value) !== "";
                    if (!isEditing && !hasValue) return null;

                    return (
                      <div
                        key={key}
                        className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                            {label}
                          </span>
                          <div className="flex items-center gap-1">
                            {confidenceBadge(field.confidence, hasValue)}
                            {validationPill(field.validation_status)}
                          </div>
                        </div>
                        {isEditing ? (
                          <input
                            type="text"
                            value={field.value === null || field.value === undefined ? "" : String(field.value)}
                            onChange={(e) =>
                              updateInvoiceField("gst", key, { value: e.target.value }, numeric)
                            }
                            placeholder="Not present"
                            className="w-full bg-[#080d1e] border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 font-mono"
                          />
                        ) : (
                          <div className="text-xs font-mono text-white">
                            {hasValue ? String(field.value) : <span className="text-slate-600">null</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Line Items Table */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Line Items ({invoice.line_items?.length || 0})
              </h3>
              {!invoice.line_items || invoice.line_items.length === 0 ? (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-slate-500">
                  No line items extracted.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.07] bg-white/[0.02] text-slate-400 text-[11px]">
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">HSN/SAC</th>
                        <th className="py-2.5 px-3 text-right">Qty</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                        <th className="py-2.5 px-3">Confidence & Check</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05] font-mono text-[11px]">
                      {invoice.line_items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3 font-sans text-slate-200">
                            <div>{item.description || "—"}</div>
                            {item.evidence && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                &ldquo;{item.evidence}&rdquo;
                              </div>
                            )}
                            {item.validation_note && (
                              <div className="text-[10px] text-rose-300 mt-0.5">{item.validation_note}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">{item.hsn_sac_code || "—"}</td>
                          <td className="py-2.5 px-3 text-right text-slate-300">
                            {item.quantity ?? "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-300">
                            {item.unit_price ?? "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right text-white font-semibold">
                            {item.total ?? "—"}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              {confidenceBadge(item.confidence ?? 0, true)}
                              {validationPill(item.validation_status)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Legacy flat schema fallback */
          <div className="space-y-3">
            {Object.keys(editedFlatFields).length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">No fields identified in schema.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(editedFlatFields).map(([key, val]) => {
                  const isMultiline = val.includes("\n") || val.length > 60;
                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-xl border transition-colors ${
                        isMultiline ? "md:col-span-2" : ""
                      } ${
                        isEditing
                          ? "bg-white/[0.03] border-cyan-400/20 focus-within:border-cyan-400/50"
                          : "bg-white/[0.02] border-white/5"
                      }`}
                    >
                      <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                        {key.replace(/_/g, " ")}
                      </label>
                      {isEditing ? (
                        isMultiline ? (
                          <textarea
                            rows={3}
                            value={val}
                            onChange={(e) =>
                              setEditedFlatFields((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            className="w-full bg-[#080d1e] border border-white/10 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-mono"
                          />
                        ) : (
                          <input
                            type="text"
                            value={val}
                            onChange={(e) =>
                              setEditedFlatFields((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            className="w-full bg-[#080d1e] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-mono"
                          />
                        )
                      ) : (
                        <div className="text-xs text-slate-200 break-words font-mono">{val}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
