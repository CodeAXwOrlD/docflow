"""
Comprehensive tests for DocFlow backend:
- Health and status
- Input validation (extension, empty file, signature)
- Sorting allowlists
- Document state machine (retry, review, finalize)
- Worker extraction correctness (no misleading fallbacks)
- Redis and Celery resilience
"""
import io
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock, AsyncMock
from app.models.document import JobStatus
from app.models.user import User
from app.services import document_service
from fastapi import HTTPException


@pytest.fixture
async def client():
    from app.main import app
    from app.core.security import get_current_user
    from app.core.database import get_db

    test_user = User(
        id="user-unit-1",
        email="unit@docflow.dev",
        full_name="Unit Tester",
        hashed_password="x",
        is_active=True,
    )

    async def override_user():
        return test_user

    async def override_db():
        yield AsyncMock()

    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_health_endpoint(client):
    """Health check endpoint returns status and environment."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "service" in data


@pytest.mark.asyncio
async def test_upload_disallowed_extension(client):
    """Uploading a disallowed file type (.exe) must be strictly rejected with HTTP 400."""
    fake_file = io.BytesIO(b"binary executable payload")
    with patch("app.api.routes.ai_connection_service.get_effective_connection", return_value=None):
        response = await client.post(
            "/api/v1/upload",
            files={"files": ("malicious.exe", fake_file, "application/octet-stream")},
        )
    assert response.status_code == 400
    assert "not permitted" in response.json()["detail"]


@pytest.mark.asyncio
async def test_upload_empty_file_rejected(client):
    """Uploading a 0-byte file must be rejected with HTTP 400."""
    empty_file = io.BytesIO(b"")
    with patch("app.api.routes.ai_connection_service.get_effective_connection", return_value=None):
        response = await client.post(
            "/api/v1/upload",
            files={"files": ("empty.txt", empty_file, "text/plain")},
        )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_upload_invalid_pdf_signature(client):
    """Uploading a .pdf file without %PDF- magic bytes must be rejected with HTTP 400."""
    bad_pdf = io.BytesIO(b"This is just plain text disguised as a pdf")
    with patch("app.api.routes.ai_connection_service.get_effective_connection", return_value=None):
        response = await client.post(
            "/api/v1/upload",
            files={"files": ("fake_invoice.pdf", bad_pdf, "application/pdf")},
        )
    assert response.status_code == 400
    assert "signature" in response.json()["detail"].lower() or "format" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_list_documents_sort_allowlist():
    """Verify list_documents safely handles arbitrary sort_by and sort_order."""
    mock_db = AsyncMock()
    mock_scalar_result = MagicMock()
    mock_scalar_result.scalar.return_value = 0
    mock_scalars_result = MagicMock()
    mock_scalars_result.scalars.return_value.all.return_value = []

    mock_db.execute.side_effect = [mock_scalar_result, mock_scalars_result]

    docs, total = await document_service.list_documents(
        db=mock_db,
        page=1,
        page_size=10,
        sort_by="non_existent_column; DROP TABLE documents;",
        sort_order="malicious_order",
    )
    assert docs == []
    assert total == 0


@pytest.mark.asyncio
async def test_retry_non_failed_document_raises_400():
    """Retrying a document that is not in FAILED state must raise HTTP 400."""
    mock_doc = MagicMock()
    mock_doc.status = JobStatus.COMPLETED
    mock_db = AsyncMock()

    with patch("app.services.document_service.get_document", return_value=mock_doc):
        with pytest.raises(HTTPException) as exc_info:
            await document_service.retry_document(mock_db, "doc-123")
        assert exc_info.value.status_code == 400
        assert "only failed jobs can be retried" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_retry_failed_document_resets_state():
    """Retrying a failed document resets progress, stage, error, and increments retry count."""
    mock_doc = MagicMock()
    mock_doc.status = JobStatus.FAILED
    mock_doc.progress = 45
    mock_doc.current_stage = "document_parsing_failed"
    mock_doc.error_message = "Corrupted format"
    mock_doc.retry_count = 1
    mock_db = AsyncMock()

    with patch("app.services.document_service.get_document", return_value=mock_doc):
        doc = await document_service.retry_document(mock_db, "doc-123")
        assert doc.status == JobStatus.QUEUED
        assert doc.progress == 0
        assert doc.current_stage is None
        assert doc.error_message is None
        assert doc.retry_count == 2


@pytest.mark.asyncio
async def test_finalize_unreviewed_document_raises_400():
    """Finalizing an unreviewed document must raise HTTP 400."""
    mock_doc = MagicMock()
    mock_doc.is_reviewed = False
    mock_db = AsyncMock()

    with patch("app.services.document_service.get_document", return_value=mock_doc):
        with pytest.raises(HTTPException) as exc_info:
            await document_service.finalize_document(mock_db, "doc-123")
        assert exc_info.value.status_code == 400
        assert "must be reviewed" in exc_info.value.detail.lower()


def test_extraction_unsupported_format_raises_cleanly(tmp_path):
    """Worker extraction of unsupported legacy .doc binary must raise explicit error."""
    from app.workers.celery_app import _extract_text_from_file
    p = tmp_path / "legacy.doc"
    p.write_bytes(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")

    with pytest.raises(ValueError) as exc_info:
        _extract_text_from_file(str(p), ".doc")
    assert "unsupported" in str(exc_info.value).lower()


def test_extraction_corrupted_pdf_raises_error(tmp_path):
    """Worker extraction of corrupted/unreadable PDF must raise explicit error, not return fake text."""
    from app.workers.celery_app import _extract_text_from_file
    p = tmp_path / "corrupt.pdf"
    p.write_bytes(b"%PDF-1.4\ncorrupted invalid stream data\n%%EOF")

    with pytest.raises(RuntimeError) as exc_info:
        _extract_text_from_file(str(p), ".pdf")
    assert "pdf extraction failed" in str(exc_info.value).lower()


def test_structured_output_generation():
    """Verify fallback structured output generator builds normalized schema."""
    from app.workers.celery_app import _generate_structured_output
    text = "Contract agreement between parties regarding indemnification liabilities and terms"
    result = _generate_structured_output(
        text=text,
        filename="Corporate_Agreement.docx",
        file_type=".docx",
        file_size=2048,
    )
    assert result["category"] == "Legal / Contract"
    assert result["title"] == "Corporate Agreement"
    assert result["file_metadata"]["file_size_bytes"] == 2048
    assert "contract" in result["extracted_keywords"] or "agreement" in result["extracted_keywords"]


@pytest.mark.asyncio
async def test_delete_document_handles_celery_broker_offline():
    """Deleting a document must safely succeed even if Celery/Redis revoke raises an exception."""
    mock_doc = MagicMock()
    mock_doc.celery_task_id = "task-broker-down"
    mock_doc.file_path = "/nonexistent/test.pdf"
    mock_db = AsyncMock()

    with patch("app.services.document_service.get_document", return_value=mock_doc):
        with patch("app.workers.celery_app.celery_app.control.revoke", side_effect=Exception("Redis Connection Refused")):
            await document_service.delete_document(mock_db, "doc-123")
            mock_db.delete.assert_called_once_with(mock_doc)
            mock_db.commit.assert_called_once()
