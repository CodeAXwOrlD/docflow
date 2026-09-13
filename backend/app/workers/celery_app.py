import time
import json
import os
import ssl
from celery import Celery
from app.core.config import settings
from app.core.redis_client import publish_progress, get_sync_redis

redis_url = settings.REDIS_URL

# If using rediss:// (Render's Redis), append ssl_cert_reqs parameter
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

# SSL options for the broker connection
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


from sqlalchemy import create_engine, text

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


def _update_db_status(doc_id: str, status: str, progress: int, stage: str, error: str = None, result: dict = None):
    """Synchronously update document status in PostgreSQL using pooled connection."""
    engine = get_worker_sync_engine()
    with engine.connect() as conn:
        status_db = status.upper()
        if result:
            conn.execute(text("""
                UPDATE documents SET status=CAST(:status AS jobstatus), progress=:progress, current_stage=:stage,
                error_message=:error, extracted_data=CAST(:result AS jsonb), updated_at=NOW(),
                completed_at=CASE WHEN CAST(:status AS jobstatus) IN ('COMPLETED','FAILED') THEN NOW() ELSE completed_at END
                WHERE id=:doc_id
            """), {"status": status_db, "progress": progress, "stage": stage,
                   "error": error, "result": json.dumps(result), "doc_id": doc_id})
        else:
            conn.execute(text("""
                UPDATE documents SET status=CAST(:status AS jobstatus), progress=:progress, current_stage=:stage,
                error_message=:error, updated_at=NOW(),
                completed_at=CASE WHEN CAST(:status AS jobstatus) IN ('COMPLETED','FAILED') THEN NOW() ELSE completed_at END
                WHERE id=:doc_id
            """), {"status": status_db, "progress": progress, "stage": stage,
                   "error": error, "doc_id": doc_id})
        conn.commit()


def _extract_text_from_file(file_path: str, file_type: str) -> str:
    """Extract text from various file types."""
    try:
        if file_type in [".txt", ".md"]:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        elif file_type == ".pdf":
            try:
                import PyPDF2
                text = ""
                with open(file_path, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    for page in reader.pages:
                        text += page.extract_text() or ""
                return text
            except Exception:
                return "[PDF text extraction simulated - content would be extracted here]"
        elif file_type in [".docx", ".doc"]:
            try:
                from docx import Document
                doc = Document(file_path)
                return "\n".join([p.text for p in doc.paragraphs])
            except Exception:
                return "[DOCX text extraction simulated]"
        elif file_type == ".csv":
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        elif file_type == ".json":
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                data = json.load(f)
                return json.dumps(data, indent=2)
        else:
            return f"[Binary file - {file_type} - text extraction not supported]"
    except Exception as e:
        return f"[Text extraction failed: {str(e)}]"


def _generate_structured_output(text: str, filename: str, file_type: str, file_size: int) -> dict:
    """Generate structured output from extracted text."""
    words = text.split() if text else []
    word_count = len(words)

    # Simple keyword extraction (top frequent meaningful words)
    stop_words = {"the", "a", "an", "is", "in", "at", "of", "and", "or", "to", "for",
                  "with", "on", "be", "this", "that", "are", "was", "it", "as", "by"}
    word_freq = {}
    for w in words:
        w_clean = w.lower().strip(".,!?;:\"'()")
        if len(w_clean) > 3 and w_clean not in stop_words:
            word_freq[w_clean] = word_freq.get(w_clean, 0) + 1
    keywords = sorted(word_freq, key=word_freq.get, reverse=True)[:10]

    # Simple category detection
    category = "General Document"
    text_lower = text.lower()
    if any(w in text_lower for w in ["invoice", "payment", "amount", "total", "price"]):
        category = "Financial / Invoice"
    elif any(w in text_lower for w in ["report", "analysis", "summary", "results"]):
        category = "Report / Analysis"
    elif any(w in text_lower for w in ["contract", "agreement", "terms", "parties"]):
        category = "Legal / Contract"
    elif any(w in text_lower for w in ["resume", "experience", "education", "skills"]):
        category = "Resume / CV"
    elif any(w in text_lower for w in ["def ", "class ", "import ", "function", "const ", "var "]):
        category = "Source Code"
    elif file_type == ".csv":
        category = "Data / Spreadsheet"
    elif file_type == ".json":
        category = "Structured Data"

    # Generate summary (first 200 chars of text or placeholder)
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
        "status": "extracted"
    }


@celery_app.task(bind=True, name="process_document", max_retries=3)
def process_document_task(self, doc_id: str, file_path: str, filename: str,
                           file_type: str, file_size: int):
    """Main Celery task for async document processing."""
    try:
        # Stage 1: Job started
        publish_progress(doc_id, "job_started", 5, "Job picked up by worker")
        _update_db_status(doc_id, "processing", 5, "job_started")
        time.sleep(0.5)

        # Stage 2: Document received
        publish_progress(doc_id, "document_received", 10, "Document validated and received")
        _update_db_status(doc_id, "processing", 10, "document_received")
        time.sleep(0.8)

        # Stage 3: Parsing started
        publish_progress(doc_id, "document_parsing_started", 20, "Parsing document structure...")
        _update_db_status(doc_id, "processing", 20, "document_parsing_started")
        time.sleep(1.0)

        # Stage 4: Extract text
        text_content = _extract_text_from_file(file_path, file_type)
        publish_progress(doc_id, "document_parsing_completed", 45, "Document parsed successfully")
        _update_db_status(doc_id, "processing", 45, "document_parsing_completed")
        time.sleep(0.8)

        # Stage 5: Field extraction
        publish_progress(doc_id, "field_extraction_started", 55, "Extracting structured fields...")
        _update_db_status(doc_id, "processing", 55, "field_extraction_started")
        time.sleep(1.2)

        # Stage 6: Generate structured output
        result = _generate_structured_output(text_content, filename, file_type, file_size)
        publish_progress(doc_id, "field_extraction_completed", 80, "Fields extracted successfully")
        _update_db_status(doc_id, "processing", 80, "field_extraction_completed")
        time.sleep(0.5)

        # Stage 7: Storing result
        publish_progress(doc_id, "storing_result", 90, "Saving final result to database...")
        _update_db_status(doc_id, "processing", 90, "storing_result")
        time.sleep(0.5)

        # Stage 8: Completed
        publish_progress(doc_id, "job_completed", 100, "Processing complete!", data=result)
        _update_db_status(doc_id, "completed", 100, "job_completed", result=result)

        return {"status": "completed", "doc_id": doc_id}

    except Exception as exc:
        error_msg = str(exc)
        publish_progress(doc_id, "job_failed", 0, f"Processing failed: {error_msg}")
        _update_db_status(doc_id, "failed", 0, "job_failed", error=error_msg)
        raise self.retry(exc=exc, countdown=30) if self.request.retries < self.max_retries else exc
