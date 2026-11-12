import json
import os
import ssl
import time
import uuid
from typing import Any, Dict, List, Optional

from celery import Celery
from celery.signals import worker_process_init
from sqlalchemy import create_engine, text

from app.core.config import settings
from app.core.redis_client import publish_progress
from app.schemas.invoice import DuplicateMatch
from app.services.ai_providers import AIProviderError, ProviderErrorCategory, ProviderFactory
from app.services.invoice_extraction_service import extract_invoice_with_provider
from app.services.invoice_validator import (
    build_extracted_document_payload,
    validate_invoice_deterministically,
)

redis_url = settings.REDIS_URL

broker_url = redis_url
backend_url = redis_url
if redis_url.startswith("rediss://"):
    separator = "&" if "?" in redis_url else "?"
    broker_url = redis_url + separator + "ssl_cert_reqs=CERT_NONE"
    backend_url = redis_url + separator + "ssl_cert_reqs=CERT_NONE"

celery_app = Celery(
    "docflow",
    broker=broker_url,
    backend=backend_url,
)

broker_use_ssl = None
if redis_url.startswith("rediss://"):
    broker_use_ssl = {"ssl_cert_reqs": ssl.CERT_NONE}

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    broker_use_ssl=broker_use_ssl,
    redis_backend_use_ssl=broker_use_ssl,
)

_sync_engine = None


@worker_process_init.connect
def reset_worker_engine(**kwargs):
    """Ensure child worker processes do not inherit open connection pools from parent."""
    global _sync_engine
    _sync_engine = None


def get_worker_sync_engine():
    global _sync_engine
    if _sync_engine is None:
        _sync_engine = create_engine(
            settings.SYNC_DATABASE_URL,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
    return _sync_engine


def _safe_publish(job_id: str, event: str, progress: int, message: str, data: dict = None) -> None:
    try:
        publish_progress(job_id, event, progress, message, data=data)
    except Exception:
        pass


def _load_document_record(doc_id: str) -> Optional[Dict[str, Any]]:
    engine = get_worker_sync_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT id, user_id, file_path, original_filename, file_type, file_size,
                       document_type, ai_connection_id, status, celery_task_id
                FROM documents
                WHERE id = :doc_id
                """
            ),
            {"doc_id": doc_id},
        ).mappings().first()
        return dict(row) if row else None


def _resolve_user_connection(user_id: Optional[str], connection_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not user_id:
        return None
    engine = get_worker_sync_engine()
    with engine.connect() as conn:
        if connection_id:
            row = conn.execute(
                text(
                    """
                    SELECT id, user_id, provider, encrypted_api_key, model, is_active
                    FROM ai_provider_connections
                    WHERE id = :connection_id AND user_id = :user_id AND is_active = true
                    """
                ),
                {"connection_id": connection_id, "user_id": user_id},
            ).mappings().first()
            if row:
                return dict(row)

        row = conn.execute(
            text(
                """
                SELECT id, user_id, provider, encrypted_api_key, model, is_active
                FROM ai_provider_connections
                WHERE user_id = :user_id AND is_active = true
                ORDER BY is_default DESC, updated_at DESC
                LIMIT 1
                """
            ),
            {"user_id": user_id},
        ).mappings().first()
        return dict(row) if row else None


def _find_duplicate_invoices(
    user_id: Optional[str], doc_id: str, invoice_number: Optional[str]
) -> List[DuplicateMatch]:
    if not user_id or not invoice_number or not invoice_number.strip():
        return []
    engine = get_worker_sync_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, original_filename, invoice_number, vendor_name, status
                FROM documents
                WHERE user_id = :user_id
                  AND id != :doc_id
                  AND LOWER(invoice_number) = LOWER(:invoice_number)
                  AND status IN ('COMPLETED', 'FINALIZED')
                LIMIT 10
                """
            ),
            {"user_id": user_id, "doc_id": doc_id, "invoice_number": invoice_number.strip()},
        ).mappings().all()
        return [
            DuplicateMatch(
                document_id=str(r["id"]),
                original_filename=str(r["original_filename"]),
                invoice_number=r["invoice_number"],
                vendor_name=r["vendor_name"],
                status=str(r["status"]).lower(),
            )
            for r in rows
        ]


def _record_usage_log(
    *,
    user_id: Optional[str],
    connection_id: Optional[str],
    document_id: str,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    processing_duration: float,
    status: str,
    error_category: Optional[str] = None,
) -> None:
    if not user_id:
        return
    try:
        engine = get_worker_sync_engine()
        with engine.connect() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO ai_usage_logs (
                        id, user_id, connection_id, document_id, provider, model,
                        input_tokens, output_tokens, processing_duration, status, error_category, created_at
                    ) VALUES (
                        :id, :user_id, :connection_id, :document_id, :provider, :model,
                        :input_tokens, :output_tokens, :processing_duration, :status, :error_category, NOW()
                    )
                    """
                ),
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "connection_id": connection_id,
                    "document_id": document_id,
                    "provider": provider,
                    "model": model,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "processing_duration": round(processing_duration, 4),
                    "status": status,
                    "error_category": error_category,
                },
            )
            conn.commit()
    except Exception as exc:
        print(f"Warning: Failed to persist AI usage log for {document_id}: {exc}")


def _update_db_status(
    doc_id: str,
    status: str,
    progress: int,
    stage: str,
    error: str = None,
    result: dict = None,
    ai_connection_id: str = None,
    ai_provider: str = None,
    ai_model: str = None,
    invoice_number: str = None,
    vendor_name: str = None,
):
    """Synchronously update document status in PostgreSQL using pooled connection."""
    try:
        engine = get_worker_sync_engine()
        with engine.connect() as conn:
            status_db = status.upper()
            if result is not None:
                conn.execute(
                    text(
                        """
                        UPDATE documents
                        SET status = CAST(:status AS jobstatus),
                            progress = :progress,
                            current_stage = :stage,
                            error_message = :error,
                            extracted_data = CAST(:result AS jsonb),
                            ai_connection_id = COALESCE(:ai_connection_id, ai_connection_id),
                            ai_provider = COALESCE(:ai_provider, ai_provider),
                            ai_model = COALESCE(:ai_model, ai_model),
                            invoice_number = :invoice_number,
                            vendor_name = :vendor_name,
                            updated_at = NOW(),
                            completed_at = CASE WHEN CAST(:status AS jobstatus) IN ('COMPLETED','FAILED') THEN NOW() ELSE completed_at END
                        WHERE id = :doc_id
                        """
                    ),
                    {
                        "status": status_db,
                        "progress": progress,
                        "stage": stage,
                        "error": error,
                        "result": json.dumps(result),
                        "ai_connection_id": ai_connection_id,
                        "ai_provider": ai_provider,
                        "ai_model": ai_model,
                        "invoice_number": invoice_number,
                        "vendor_name": vendor_name,
                        "doc_id": doc_id,
                    },
                )
            else:
                conn.execute(
                    text(
                        """
                        UPDATE documents
                        SET status = CAST(:status AS jobstatus),
                            progress = :progress,
                            current_stage = :stage,
                            error_message = :error,
                            updated_at = NOW(),
                            completed_at = CASE WHEN CAST(:status AS jobstatus) IN ('COMPLETED','FAILED') THEN NOW() ELSE completed_at END
                        WHERE id = :doc_id
                        """
                    ),
                    {
                        "status": status_db,
                        "progress": progress,
                        "stage": stage,
                        "error": error,
                        "doc_id": doc_id,
                    },
                )
            conn.commit()
    except Exception as exc:
        print(f"Warning: Failed to update DB status for {doc_id}: {exc}")


def _extract_text_from_file(file_path: str, file_type: str) -> str:
    """Extract text from supported file types or raise explicit errors for failure/unsupported types."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Source file not found at path: {file_path}")

    if file_type in [".txt", ".md"]:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    elif file_type == ".pdf":
        try:
            import PyPDF2

            text_acc = ""
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                if reader.is_encrypted:
                    raise RuntimeError("PDF is password-protected or encrypted; decryption key required.")
                for page in reader.pages:
                    extracted = page.extract_text()
                    if extracted:
                        text_acc += extracted + "\n"
            if not text_acc.strip():
                raise RuntimeError(
                    "PDF file yielded empty text stream (scanned or image-only PDF requires OCR)."
                )
            return text_acc
        except Exception as exc:
            raise RuntimeError(f"PDF extraction failed: {str(exc)}")

    elif file_type == ".docx":
        try:
            from docx import Document

            doc = Document(file_path)
            parts = [p.text for p in doc.paragraphs if p.text]
            for table in doc.tables:
                for row in table.rows:
                    cells = [c.text.strip() for c in row.cells if c.text.strip()]
                    if cells:
                        parts.append(" | ".join(cells))
            text_acc = "\n".join(parts)
            if not text_acc.strip():
                raise RuntimeError("Word document contained no extractable text.")
            return text_acc
        except Exception as exc:
            raise RuntimeError(f"DOCX extraction failed: {str(exc)}")

    elif file_type == ".doc":
        raise ValueError(
            "Legacy Microsoft Word 97-2003 (.doc) binary format is unsupported. Please convert to .docx or .pdf."
        )

    elif file_type == ".csv":
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    elif file_type == ".json":
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                data = json.load(f)
                return json.dumps(data, indent=2)
        except Exception as exc:
            raise RuntimeError(f"JSON validation error: {str(exc)}")

    elif file_type == ".xlsx":
        try:
            import openpyxl

            wb = openpyxl.load_workbook(file_path, data_only=True)
            lines = []
            for sheet in wb.sheetnames:
                lines.append(f"Sheet: {sheet}")
                ws = wb[sheet]
                for row in ws.iter_rows(values_only=True):
                    row_vals = [str(cell) for cell in row if cell is not None]
                    if row_vals:
                        lines.append("\t".join(row_vals))
            return "\n".join(lines)
        except Exception as exc:
            raise RuntimeError(f"Excel extraction failed: {str(exc)}")

    else:
        raise ValueError(
            f"Unsupported file format '{file_type}'. Supported: .pdf, .docx, .xlsx, .csv, .json, .txt, .md"
        )


def _generate_structured_output(text: str, filename: str, file_type: str, file_size: int) -> dict:
    """Deterministic metadata/keyword fallback helper preserved for non-AI unit tests."""
    words = text.split() if text else []
    word_count = len(words)
    stop_words = {
        "the", "a", "an", "is", "in", "at", "of", "and", "or", "to", "for",
        "with", "on", "be", "this", "that", "are", "was", "it", "as", "by",
    }
    word_freq = {}
    for w in words:
        w_clean = w.lower().strip(".,!?;:\"'()")
        if len(w_clean) > 3 and w_clean not in stop_words:
            word_freq[w_clean] = word_freq.get(w_clean, 0) + 1
    keywords = sorted(word_freq, key=word_freq.get, reverse=True)[:10]

    category = "General Document"
    text_lower = text.lower()
    if any(w in text_lower for w in ["invoice", "payment", "amount", "total", "price"]):
        category = "Financial / Invoice"
    elif any(w in text_lower for w in ["report", "analysis", "summary", "results"]):
        category = "Report / Analysis"
    elif any(w in text_lower for w in ["contract", "agreement", "terms", "parties"]):
        category = "Legal / Contract"

    summary = text[:300].replace("\n", " ").strip() if text else "No text content extracted."
    if len(text) > 300:
        summary += "..."

    return {
        "title": os.path.splitext(filename)[0].replace("_", " ").replace("-", " ").title(),
        "category": category,
        "summary": summary,
        "extracted_keywords": keywords,
        "word_count": word_count,
        "character_count": len(text),
        "language": "en",
        "file_metadata": {
            "filename": filename,
            "file_type": file_type,
            "file_size_bytes": file_size,
            "file_size_kb": round(file_size / 1024, 2),
        },
        "processing_info": {
            "text_extracted": len(text) > 0,
            "pages_estimated": max(1, word_count // 250),
        },
        "status": "extracted",
    }


class _ConnectionObj:
    """Lightweight container passed to ProviderFactory without exposing raw secrets in logs."""

    def __init__(self, row: Dict[str, Any]):
        self.id = row["id"]
        self.user_id = row["user_id"]
        self.provider = row["provider"]
        self.encrypted_api_key = row["encrypted_api_key"]
        self.model = row["model"]


@celery_app.task(bind=True, name="process_document", max_retries=3)
def process_document_task(self, doc_id: str, connection_id: Optional[str] = None):
    """Main Celery task for async AI document processing. Receives only IDs, never raw credentials."""
    doc = _load_document_record(doc_id)
    if not doc:
        return {"status": "missing", "doc_id": doc_id}

    current_status = str(doc.get("status") or "").lower()
    if current_status in ("completed", "finalized"):
        return {"status": "skipped", "reason": "already_completed", "doc_id": doc_id}

    if (
        current_status == "processing"
        and getattr(self.request, "retries", 0) == 0
        and doc.get("celery_task_id")
        and getattr(self.request, "id", None)
        and doc.get("celery_task_id") != self.request.id
    ):
        return {"status": "skipped", "reason": "already_processing", "doc_id": doc_id}

    file_path = doc["file_path"]
    filename = doc["original_filename"]
    file_type = doc["file_type"]
    file_size = int(doc["file_size"])
    user_id = doc.get("user_id")
    effective_conn_id = connection_id or doc.get("ai_connection_id")

    provider_name = "unknown"
    model_name = "unknown"
    resolved_conn_id = effective_conn_id

    try:
        # Stage 1: Job started
        _safe_publish(doc_id, "job_started", 5, "Job picked up by worker")
        _update_db_status(doc_id, "processing", 5, "job_started")

        # Stage 2: Document received
        _safe_publish(doc_id, "document_received", 12, "Document validated and ready for parsing")
        _update_db_status(doc_id, "processing", 12, "document_received")

        # Stage 3: Parsing started
        _safe_publish(doc_id, "document_parsing_started", 22, "Extracting text and layout...")
        _update_db_status(doc_id, "processing", 22, "document_parsing_started")

        text_content = _extract_text_from_file(file_path, file_type)
        _safe_publish(doc_id, "document_parsing_completed", 40, "Document text extracted")
        _update_db_status(doc_id, "processing", 40, "document_parsing_completed")

        # Stage 4: Resolve BYOK provider connection securely inside worker
        conn_row = _resolve_user_connection(user_id, effective_conn_id)
        if not conn_row:
            raise AIProviderError(
                category=ProviderErrorCategory.AUTH_FAILURE,
                user_message="No active AI provider connection configured. Add a Gemini or Groq API key in AI Settings and retry.",
                retryable=False,
            )

        resolved_conn_id = conn_row["id"]
        provider_name = conn_row["provider"]
        model_name = conn_row["model"]

        provider = ProviderFactory.from_encrypted_connection(_ConnectionObj(conn_row))

        # Stage 5: AI Analysis
        _safe_publish(
            doc_id,
            "ai_analysis_started",
            55,
            f"Analyzing document with {provider_name.title()} ({model_name})...",
        )
        _update_db_status(doc_id, "processing", 55, "ai_analysis_started")

        started_at = time.monotonic()
        ai_payload, provider_resp = extract_invoice_with_provider(
            provider=provider,
            document_text=text_content,
            model=model_name,
        )
        duration_sec = time.monotonic() - started_at

        _record_usage_log(
            user_id=user_id,
            connection_id=resolved_conn_id,
            document_id=doc_id,
            provider=provider_resp.provider,
            model=provider_resp.model,
            input_tokens=provider_resp.usage.input_tokens,
            output_tokens=provider_resp.usage.output_tokens,
            processing_duration=duration_sec,
            status="success",
        )

        _safe_publish(doc_id, "field_extraction_completed", 78, "AI structured fields extracted")
        _update_db_status(doc_id, "processing", 78, "field_extraction_completed")

        # Stage 6: Deterministic Validation & Duplicate Detection
        inv_num = ai_payload.invoice_number.value
        vendor = ai_payload.vendor_name.value
        duplicates = _find_duplicate_invoices(user_id, doc_id, inv_num)
        validation = validate_invoice_deterministically(ai_payload, existing_duplicates=duplicates)

        _safe_publish(doc_id, "validation_completed", 88, "Deterministic validation checks completed")
        _update_db_status(doc_id, "processing", 88, "validation_completed")

        result = build_extracted_document_payload(
            filename=filename,
            file_type=file_type,
            file_size=file_size,
            ai_payload=ai_payload,
            validation=validation,
            provider=provider_resp.provider,
            model=provider_resp.model,
            input_tokens=provider_resp.usage.input_tokens,
            output_tokens=provider_resp.usage.output_tokens,
            latency_ms=provider_resp.latency_ms,
        )

        # Stage 7: Storing result
        _safe_publish(doc_id, "storing_result", 95, "Saving extracted intelligence to database...")
        _update_db_status(doc_id, "processing", 95, "storing_result")

        # Stage 8: Completed
        _safe_publish(doc_id, "job_completed", 100, "AI processing complete!", data=result)
        _update_db_status(
            doc_id,
            "completed",
            100,
            "job_completed",
            result=result,
            ai_connection_id=resolved_conn_id,
            ai_provider=provider_resp.provider,
            ai_model=provider_resp.model,
            invoice_number=inv_num,
            vendor_name=vendor,
        )

        return {"status": "completed", "doc_id": doc_id}

    except AIProviderError as exc:
        _record_usage_log(
            user_id=user_id,
            connection_id=resolved_conn_id,
            document_id=doc_id,
            provider=exc.provider or provider_name,
            model=model_name,
            input_tokens=0,
            output_tokens=0,
            processing_duration=0.0,
            status="failed",
            error_category=exc.category.value,
        )
        if exc.retryable and getattr(self.request, "retries", 0) < self.max_retries:
            countdown = min(120, 15 * (2 ** getattr(self.request, "retries", 0)))
            _safe_publish(doc_id, "ai_retrying", 55, f"{exc.user_message} Retrying in {countdown}s...")
            raise self.retry(exc=exc, countdown=countdown)

        _safe_publish(doc_id, "job_failed", 0, exc.user_message)
        _update_db_status(doc_id, "failed", 0, "job_failed", error=exc.user_message)
        return {"status": "failed", "doc_id": doc_id, "error_category": exc.category.value}

    except Exception as exc:
        error_msg = str(exc)
        _safe_publish(doc_id, "job_failed", 0, f"Processing failed: {error_msg}")
        _update_db_status(doc_id, "failed", 0, "job_failed", error=error_msg)
        if getattr(self.request, "retries", 0) < self.max_retries and isinstance(exc, (OSError, TimeoutError)):
            raise self.retry(exc=exc, countdown=30)
        return {"status": "failed", "doc_id": doc_id}
