from typing import Any, Dict, Generic, List, Literal, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")

ValidationStatus = Literal["valid", "warning", "invalid", "missing", "unverified"]


class ExtractedField(BaseModel, Generic[T]):
    """Single extracted field with confidence, source evidence, and validation metadata."""

    value: Optional[T] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: Optional[str] = None
    validation_status: ValidationStatus = "unverified"
    validation_note: Optional[str] = None
    verified_by_human: bool = False


class InvoiceLineItem(BaseModel):
    description: Optional[str] = None
    hsn_sac_code: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    tax_rate: Optional[float] = None
    tax_amount: Optional[float] = None
    total: Optional[float] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: Optional[str] = None
    validation_status: ValidationStatus = "unverified"
    validation_note: Optional[str] = None
    verified_by_human: bool = False


class GSTDetails(BaseModel):
    vendor_gstin: ExtractedField[str] = Field(default_factory=ExtractedField)
    customer_gstin: ExtractedField[str] = Field(default_factory=ExtractedField)
    taxable_value: ExtractedField[float] = Field(default_factory=ExtractedField)
    cgst: ExtractedField[float] = Field(default_factory=ExtractedField)
    sgst: ExtractedField[float] = Field(default_factory=ExtractedField)
    igst: ExtractedField[float] = Field(default_factory=ExtractedField)
    place_of_supply: ExtractedField[str] = Field(default_factory=ExtractedField)


class InvoiceExtractionPayload(BaseModel):
    """Strict Pydantic schema for AI-extracted invoice intelligence."""

    document_classification: Literal[
        "invoice", "receipt", "purchase_order", "contract", "report", "general"
    ] = "invoice"
    summary: str = ""
    invoice_number: ExtractedField[str] = Field(default_factory=ExtractedField)
    invoice_date: ExtractedField[str] = Field(default_factory=ExtractedField)
    due_date: ExtractedField[str] = Field(default_factory=ExtractedField)
    vendor_name: ExtractedField[str] = Field(default_factory=ExtractedField)
    vendor_address: ExtractedField[str] = Field(default_factory=ExtractedField)
    customer_name: ExtractedField[str] = Field(default_factory=ExtractedField)
    customer_address: ExtractedField[str] = Field(default_factory=ExtractedField)
    currency: ExtractedField[str] = Field(default_factory=ExtractedField)
    subtotal: ExtractedField[float] = Field(default_factory=ExtractedField)
    tax_amount: ExtractedField[float] = Field(default_factory=ExtractedField)
    total_amount: ExtractedField[float] = Field(default_factory=ExtractedField)
    payment_terms: ExtractedField[str] = Field(default_factory=ExtractedField)
    purchase_order_reference: ExtractedField[str] = Field(default_factory=ExtractedField)
    gst: GSTDetails = Field(default_factory=GSTDetails)
    line_items: List[InvoiceLineItem] = Field(default_factory=list)
    overall_confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class ValidationCheck(BaseModel):
    code: str
    label: str
    status: Literal["passed", "warning", "failed", "skipped"]
    message: str
    expected: Optional[Any] = None
    actual: Optional[Any] = None


class DuplicateMatch(BaseModel):
    document_id: str
    original_filename: str
    invoice_number: Optional[str] = None
    vendor_name: Optional[str] = None
    status: str


class DeterministicValidationReport(BaseModel):
    overall_status: Literal["valid", "needs_review", "invalid"]
    checks: List[ValidationCheck] = Field(default_factory=list)
    duplicate_matches: List[DuplicateMatch] = Field(default_factory=list)
    computed_line_items_sum: Optional[float] = None
    computed_tax_sum: Optional[float] = None
    computed_total: Optional[float] = None
    missing_mandatory_fields: List[str] = Field(default_factory=list)

