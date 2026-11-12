import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from app.schemas.invoice import (
    DeterministicValidationReport,
    DuplicateMatch,
    ExtractedField,
    InvoiceExtractionPayload,
    ValidationCheck,
)

TOLERANCE = Decimal("0.05")
GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
ISO_CURRENCY_PATTERN = re.compile(r"^[A-Z]{3}$")

MANDATORY_FIELDS = [
    ("invoice_number", "Invoice Number"),
    ("invoice_date", "Invoice Date"),
    ("vendor_name", "Vendor Name"),
    ("currency", "Currency"),
    ("total_amount", "Total Amount"),
]


def _to_decimal(val: Any) -> Optional[Decimal]:
    if val is None or isinstance(val, bool):
        return None
    try:
        return Decimal(str(val))
    except (InvalidOperation, ValueError):
        return None


def _parse_date(val: Optional[str]) -> Optional[date]:
    if not val or not isinstance(val, str):
        return None
    cleaned = val.strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def _mark_field(field: ExtractedField[Any], status: str, note: Optional[str] = None) -> None:
    # Preserve warning if evidence mismatch was already flagged unless upgraded to invalid
    if field.validation_status == "warning" and status == "valid":
        if note and not field.validation_note:
            field.validation_note = note
        return
    field.validation_status = status  # type: ignore[assignment]
    if note:
        field.validation_note = note


def validate_invoice_deterministically(
    payload: InvoiceExtractionPayload,
    existing_duplicates: Optional[List[DuplicateMatch]] = None,
) -> DeterministicValidationReport:
    """Run deterministic arithmetic, GST, mandatory, date/currency, and duplicate checks."""
    checks: List[ValidationCheck] = []
    missing_mandatory: List[str] = []

    # 1. Mandatory fields
    for attr, label in MANDATORY_FIELDS:
        field: ExtractedField[Any] = getattr(payload, attr)
        if field.value is None or (isinstance(field.value, str) and not field.value.strip()):
            missing_mandatory.append(attr)
            field.validation_status = "missing"
            field.validation_note = f"Mandatory field '{label}' was not found."

    if missing_mandatory:
        checks.append(
            ValidationCheck(
                code="mandatory_fields",
                label="Mandatory Invoice Fields",
                status="warning",
                message=f"Missing mandatory fields: {', '.join(missing_mandatory)}.",
                actual=missing_mandatory,
            )
        )
    else:
        checks.append(
            ValidationCheck(
                code="mandatory_fields",
                label="Mandatory Invoice Fields",
                status="passed",
                message="All mandatory invoice fields are present.",
            )
        )

    # 2. Line-item math & subtotal consistency
    computed_line_sum = Decimal("0")
    line_math_Checked = 0
    line_math_errors = 0
    has_line_totals = False

    for idx, item in enumerate(payload.line_items, start=1):
        qty = _to_decimal(item.quantity)
        unit = _to_decimal(item.unit_price)
        line_total = _to_decimal(item.total)

        if line_total is not None:
            has_line_totals = True
            computed_line_sum += line_total

        if qty is not None and unit is not None and line_total is not None:
            line_math_Checked += 1
            expected_line = qty * unit
            diff = abs(expected_line - line_total)
            # Also allow line_total == qty * unit + line tax if tax_amount is included in line total
            line_tax = _to_decimal(item.tax_amount) or Decimal("0")
            if diff <= TOLERANCE or abs((expected_line + line_tax) - line_total) <= TOLERANCE:
                item.validation_status = "valid"
            else:
                line_math_errors += 1
                item.validation_status = "invalid"
                item.validation_note = (
                    f"Line {idx}: quantity ({qty}) x unit price ({unit}) = {expected_line:.2f}, extracted total is {line_total:.2f}."
                )
        elif line_total is not None:
            item.validation_status = "valid"

    computed_line_sum_float = float(computed_line_sum.quantize(Decimal("0.01"))) if has_line_totals else None

    if line_math_Checked > 0:
        checks.append(
            ValidationCheck(
                code="line_item_math",
                label="Line Item Arithmetic",
                status="failed" if line_math_errors else "passed",
                message=(
                    f"{line_math_errors} line item(s) failed quantity x unit_price validation."
                    if line_math_errors
                    else f"All {line_math_Checked} line item calculation(s) verified."
                ),
            )
        )
    else:
        checks.append(
            ValidationCheck(
                code="line_item_math",
                label="Line Item Arithmetic",
                status="skipped",
                message="Insufficient quantity/unit_price/total line-item fields to verify arithmetic.",
            )
        )

    subtotal_dec = _to_decimal(payload.subtotal.value)
    taxable_dec = _to_decimal(payload.gst.taxable_value.value)
    base_amount = subtotal_dec if subtotal_dec is not None else taxable_dec

    if has_line_totals and base_amount is not None:
        if abs(computed_line_sum - base_amount) <= TOLERANCE:
            _mark_field(payload.subtotal if subtotal_dec is not None else payload.gst.taxable_value, "valid")
            checks.append(
                ValidationCheck(
                    code="subtotal_consistency",
                    label="Subtotal vs. Line Items",
                    status="passed",
                    message="Line item sum matches extracted subtotal.",
                    expected=float(computed_line_sum),
                    actual=float(base_amount),
                )
            )
        else:
            target_field = payload.subtotal if subtotal_dec is not None else payload.gst.taxable_value
            _mark_field(
                target_field,
                "invalid",
                f"Sum of line items ({computed_line_sum:.2f}) does not match extracted subtotal ({base_amount:.2f}).",
            )
            checks.append(
                ValidationCheck(
                    code="subtotal_consistency",
                    label="Subtotal vs. Line Items",
                    status="failed",
                    message=f"Line items sum to {computed_line_sum:.2f}, but subtotal is {base_amount:.2f}.",
                    expected=float(computed_line_sum),
                    actual=float(base_amount),
                )
            )
    else:
        checks.append(
            ValidationCheck(
                code="subtotal_consistency",
                label="Subtotal vs. Line Items",
                status="skipped",
                message="Subtotal or line-item totals not present to cross-check.",
            )
        )

    # 3. GST & Tax calculations
    cgst = _to_decimal(payload.gst.cgst.value)
    sgst = _to_decimal(payload.gst.sgst.value)
    igst = _to_decimal(payload.gst.igst.value)
    tax_dec = _to_decimal(payload.tax_amount.value)

    gst_components = [c for c in (cgst, sgst, igst) if c is not None]
    computed_tax_sum: Optional[Decimal] = sum(gst_components, Decimal("0")) if gst_components else None

    if computed_tax_sum is not None and tax_dec is not None:
        if abs(computed_tax_sum - tax_dec) <= TOLERANCE:
            _mark_field(payload.tax_amount, "valid")
            checks.append(
                ValidationCheck(
                    code="gst_tax_sum",
                    label="GST Component Sum",
                    status="passed",
                    message="CGST + SGST + IGST matches extracted tax amount.",
                    expected=float(computed_tax_sum),
                    actual=float(tax_dec),
                )
            )
        else:
            _mark_field(
                payload.tax_amount,
                "invalid",
                f"CGST + SGST + IGST ({computed_tax_sum:.2f}) differs from tax_amount ({tax_dec:.2f}).",
            )
            checks.append(
                ValidationCheck(
                    code="gst_tax_sum",
                    label="GST Component Sum",
                    status="failed",
                    message=f"GST components sum to {computed_tax_sum:.2f}, while tax_amount is {tax_dec:.2f}.",
                    expected=float(computed_tax_sum),
                    actual=float(tax_dec),
                )
            )

    for gstin_field, label in (
        (payload.gst.vendor_gstin, "Vendor GSTIN"),
        (payload.gst.customer_gstin, "Customer GSTIN"),
    ):
        if gstin_field.value:
            cleaned_gstin = gstin_field.value.strip().upper()
            gstin_field.value = cleaned_gstin
            if GSTIN_PATTERN.match(cleaned_gstin):
                _mark_field(gstin_field, "valid")
            else:
                _mark_field(gstin_field, "invalid", f"{label} '{cleaned_gstin}' failed 15-character GSTIN format check.")
                checks.append(
                    ValidationCheck(
                        code="gstin_format",
                        label=f"{label} Format",
                        status="failed",
                        message=f"{label} '{cleaned_gstin}' does not match Indian 15-character GSTIN structure.",
                        actual=cleaned_gstin,
                    )
                )

    # 4. Total amount consistency: base + effective_tax == total
    effective_base = base_amount if base_amount is not None else (computed_line_sum if has_line_totals else None)
    effective_tax = tax_dec if tax_dec is not None else (computed_tax_sum if computed_tax_sum is not None else Decimal("0"))
    total_dec = _to_decimal(payload.total_amount.value)
    computed_total_float: Optional[float] = None

    if effective_base is not None and total_dec is not None and (tax_dec is not None or computed_tax_sum is not None):
        expected_total = effective_base + effective_tax
        computed_total_float = float(expected_total.quantize(Decimal("0.01")))
        if abs(expected_total - total_dec) <= TOLERANCE:
            _mark_field(payload.total_amount, "valid")
            checks.append(
                ValidationCheck(
                    code="total_consistency",
                    label="Total Amount Consistency",
                    status="passed",
                    message="Subtotal + tax matches total amount.",
                    expected=computed_total_float,
                    actual=float(total_dec),
                )
            )
        else:
            _mark_field(
                payload.total_amount,
                "invalid",
                f"Subtotal ({effective_base:.2f}) + Tax ({effective_tax:.2f}) = {expected_total:.2f}, extracted total is {total_dec:.2f}.",
            )
            checks.append(
                ValidationCheck(
                    code="total_consistency",
                    label="Total Amount Consistency",
                    status="failed",
                    message=f"Expected total {expected_total:.2f}, extracted {total_dec:.2f}.",
                    expected=computed_total_float,
                    actual=float(total_dec),
                )
            )
    else:
        checks.append(
            ValidationCheck(
                code="total_consistency",
                label="Total Amount Consistency",
                status="skipped",
                message="Insufficient subtotal/tax/total values to verify total calculation.",
            )
        )

    # 5. Date & Currency validation
    inv_date = _parse_date(payload.invoice_date.value)
    due_date = _parse_date(payload.due_date.value)
    if payload.invoice_date.value:
        if inv_date:
            _mark_field(payload.invoice_date, "valid")
        else:
            _mark_field(payload.invoice_date, "warning", "Invoice date format could not be parsed cleanly.")
    if payload.due_date.value:
        if due_date:
            if inv_date and due_date < inv_date:
                _mark_field(payload.due_date, "invalid", "Due date is earlier than invoice date.")
                checks.append(
                    ValidationCheck(
                        code="date_order",
                        label="Invoice & Due Date Order",
                        status="failed",
                        message=f"Due date ({due_date}) precedes invoice date ({inv_date}).",
                    )
                )
            else:
                _mark_field(payload.due_date, "valid")
                checks.append(
                    ValidationCheck(
                        code="date_order",
                        label="Invoice & Due Date Order",
                        status="passed",
                        message="Invoice and due dates are valid and chronological.",
                    )
                )
        else:
            _mark_field(payload.due_date, "warning", "Due date format could not be parsed cleanly.")

    if payload.currency.value:
        curr = payload.currency.value.strip().upper()
        payload.currency.value = curr
        if ISO_CURRENCY_PATTERN.match(curr):
            _mark_field(payload.currency, "valid")
        else:
            _mark_field(payload.currency, "warning", f"Currency '{curr}' is not a standard 3-letter ISO code.")

    # 6. Duplicate invoice detection
    dups = existing_duplicates or []
    if dups:
        _mark_field(
            payload.invoice_number,
            "warning",
            f"Potential duplicate of {len(dups)} existing document(s).",
        )
        checks.append(
            ValidationCheck(
                code="duplicate_invoice",
                label="Duplicate Invoice Check",
                status="warning",
                message=f"Found {len(dups)} existing document(s) with matching invoice number.",
                actual=[d.original_filename for d in dups],
            )
        )
    elif payload.invoice_number.value:
        checks.append(
            ValidationCheck(
                code="duplicate_invoice",
                label="Duplicate Invoice Check",
                status="passed",
                message="No duplicate invoice number found in your workspace.",
            )
        )

    has_failed = any(c.status == "failed" for c in checks)
    has_warning = any(c.status == "warning" for c in checks) or bool(missing_mandatory) or bool(dups)
    overall_status = "invalid" if has_failed else ("needs_review" if has_warning else "valid")

    return DeterministicValidationReport(
        overall_status=overall_status,  # type: ignore[arg-type]
        checks=checks,
        duplicate_matches=dups,
        computed_line_items_sum=computed_line_sum_float,
        computed_tax_sum=float(computed_tax_sum.quantize(Decimal("0.01"))) if computed_tax_sum is not None else None,
        computed_total=computed_total_float,
        missing_mandatory_fields=missing_mandatory,
    )


def build_extracted_document_payload(
    *,
    filename: str,
    file_type: str,
    file_size: int,
    ai_payload: InvoiceExtractionPayload,
    validation: DeterministicValidationReport,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
) -> Dict[str, Any]:
    """Assemble final persisted extracted_data JSON distinguishing AI outputs vs deterministic validation."""
    vendor_title = ai_payload.vendor_name.value
    inv_num = ai_payload.invoice_number.value
    if vendor_title and inv_num:
        title = f"{vendor_title} — {inv_num}"
    else:
        title = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()

    category_map = {
        "invoice": "Financial / Invoice",
        "receipt": "Financial / Receipt",
        "purchase_order": "Financial / Purchase Order",
        "contract": "Legal / Contract",
        "report": "Report / Analysis",
        "general": "General Document",
    }

    return {
        "schema_version": "2.0",
        "document_classification": ai_payload.document_classification,
        "title": title,
        "category": category_map.get(ai_payload.document_classification, "Financial / Invoice"),
        "summary": ai_payload.summary,
        "ai_metadata": {
            "provider": provider,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "latency_ms": latency_ms,
            "overall_confidence": ai_payload.overall_confidence,
        },
        "invoice": ai_payload.model_dump(),
        "deterministic_validation": validation.model_dump(),
        "file_metadata": {
            "filename": filename,
            "file_type": file_type,
            "file_size_bytes": file_size,
            "file_size_kb": round(file_size / 1024, 2),
        },
        "status": "extracted",
    }

