import re
from typing import Any, Dict, Tuple
from pydantic import ValidationError

from app.schemas.invoice import ExtractedField, InvoiceExtractionPayload
from app.services.ai_providers.base import (
    AIProviderError,
    BaseAIProvider,
    ProviderErrorCategory,
    ProviderResponse,
)

MAX_DOCUMENT_CHARS = 60000

INVOICE_SYSTEM_PROMPT = """You are a strict financial document extraction engine for DocFlow.
Extract structured invoice data from the provided document text into valid JSON.

CRITICAL ACCURACY RULES:
1. NEVER invent, guess, or infer missing values. If a field is not explicitly present in the document text, set "value": null, "confidence": 0.0, and "evidence": null.
2. NEVER perform arithmetic calculations to fill in missing totals or taxes; extract only the printed values.
3. For every non-null field, include a short verbatim "evidence" snippet copied from the document text supporting that value, and a calibrated "confidence" between 0.0 and 1.0.
4. Normalize dates to ISO YYYY-MM-DD format when unambiguous; otherwise return the verbatim date string with lower confidence.
5. Normalize currency to 3-letter ISO code (e.g. USD, INR, EUR, GBP) when identifiable.
6. For Indian GST invoices, extract vendor_gstin, customer_gstin, taxable_value, cgst, sgst, igst, place_of_supply, and per-line hsn_sac_code when present; otherwise leave them null.
7. Output ONLY a JSON object matching the requested schema."""

INVOICE_USER_PROMPT = """Extract all invoice fields, GST details (if present), and line items from this document.
Return JSON with keys:
- document_classification: "invoice" | "receipt" | "purchase_order" | "contract" | "report" | "general"
- summary: concise 1-2 sentence summary
- invoice_number, invoice_date, due_date, vendor_name, vendor_address, customer_name, customer_address, currency, subtotal, tax_amount, total_amount, payment_terms, purchase_order_reference (each an object: {"value": ..., "confidence": 0.0-1.0, "evidence": "..."})
- gst: {"vendor_gstin", "customer_gstin", "taxable_value", "cgst", "sgst", "igst", "place_of_supply"} (each {"value": ..., "confidence": ..., "evidence": ...})
- line_items: array of {"description", "hsn_sac_code", "quantity", "unit_price", "tax_rate", "tax_amount", "total", "confidence", "evidence"}
"""


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


def _coerce_extracted_fields(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize minor LLM shape variations (e.g. scalar values instead of {value, confidence}) cleanly."""
    field_names = [
        "invoice_number",
        "invoice_date",
        "due_date",
        "vendor_name",
        "vendor_address",
        "customer_name",
        "customer_address",
        "currency",
        "subtotal",
        "tax_amount",
        "total_amount",
        "payment_terms",
        "purchase_order_reference",
    ]
    normalized = dict(raw)
    for name in field_names:
        val = normalized.get(name)
        if val is None:
            normalized[name] = {"value": None, "confidence": 0.0, "evidence": None}
        elif not isinstance(val, dict):
            normalized[name] = {"value": val, "confidence": 0.6, "evidence": None}

    gst = normalized.get("gst")
    if not isinstance(gst, dict):
        gst = {}
    gst_coerced = dict(gst)
    for gname in [
        "vendor_gstin",
        "customer_gstin",
        "taxable_value",
        "cgst",
        "sgst",
        "igst",
        "place_of_supply",
    ]:
        gval = gst_coerced.get(gname)
        if gval is None:
            gst_coerced[gname] = {"value": None, "confidence": 0.0, "evidence": None}
        elif not isinstance(gval, dict):
            gst_coerced[gname] = {"value": gval, "confidence": 0.6, "evidence": None}
    normalized["gst"] = gst_coerced

    if not isinstance(normalized.get("line_items"), list):
        normalized["line_items"] = []

    return normalized


def _ground_evidence_and_confidence(
    payload: InvoiceExtractionPayload, source_text: str
) -> InvoiceExtractionPayload:
    """Mark missing fields explicitly and verify quoted evidence exists in source text."""
    norm_source = _normalize_whitespace(source_text)
    scalar_fields = [
        payload.invoice_number,
        payload.invoice_date,
        payload.due_date,
        payload.vendor_name,
        payload.vendor_address,
        payload.customer_name,
        payload.customer_address,
        payload.currency,
        payload.subtotal,
        payload.tax_amount,
        payload.total_amount,
        payload.payment_terms,
        payload.purchase_order_reference,
        payload.gst.vendor_gstin,
        payload.gst.customer_gstin,
        payload.gst.taxable_value,
        payload.gst.cgst,
        payload.gst.sgst,
        payload.gst.igst,
        payload.gst.place_of_supply,
    ]

    confidences = []
    for f in scalar_fields:
        _annotate_field(f, norm_source)
        if f.value is not None:
            confidences.append(f.confidence)

    for item in payload.line_items:
        if item.evidence:
            norm_ev = _normalize_whitespace(item.evidence)
            if norm_ev and len(norm_ev) > 4 and norm_ev not in norm_source:
                item.confidence = round(min(item.confidence, 0.55), 2)
                item.validation_note = "Line item evidence quote was not found verbatim in document text."
        if item.confidence > 0:
            confidences.append(item.confidence)

    payload.overall_confidence = (
        round(sum(confidences) / len(confidences), 3) if confidences else 0.0
    )
    return payload


def _annotate_field(field: ExtractedField[Any], norm_source: str) -> None:
    if field.value is None or (isinstance(field.value, str) and not field.value.strip()):
        field.value = None
        field.confidence = 0.0
        field.validation_status = "missing"
        return

    field.validation_status = "unverified"
    if field.evidence:
        norm_ev = _normalize_whitespace(field.evidence)
        if norm_ev and len(norm_ev) > 4 and norm_ev not in norm_source:
            field.confidence = round(min(field.confidence, 0.55), 2)
            field.validation_status = "warning"
            field.validation_note = "Evidence text could not be matched verbatim in source document."


def extract_invoice_with_provider(
    provider: BaseAIProvider,
    document_text: str,
    model: str | None = None,
) -> Tuple[InvoiceExtractionPayload, ProviderResponse]:
    """Run provider-independent structured invoice extraction and validate with Pydantic."""
    truncated_text = (document_text or "")[:MAX_DOCUMENT_CHARS]
    if not truncated_text.strip():
        raise AIProviderError(
            category=ProviderErrorCategory.MALFORMED_OUTPUT,
            user_message="Document yielded empty text and cannot be analyzed.",
            provider=provider.provider_name,
            retryable=False,
        )

    schema = InvoiceExtractionPayload.model_json_schema()
    response = provider.extract_document_data(
        document_text=truncated_text,
        system_prompt=INVOICE_SYSTEM_PROMPT,
        user_prompt=INVOICE_USER_PROMPT,
        json_schema=schema,
        model=model,
    )

    coerced = _coerce_extracted_fields(response.parsed_json)
    try:
        validated = InvoiceExtractionPayload.model_validate(coerced)
    except ValidationError as exc:
        raise AIProviderError(
            category=ProviderErrorCategory.SCHEMA_VALIDATION,
            user_message=f"AI response did not match the required invoice schema ({exc.error_count()} validation error(s)).",
            provider=provider.provider_name,
            retryable=False,
        ) from exc

    grounded = _ground_evidence_and_confidence(validated, truncated_text)
    return grounded, response

