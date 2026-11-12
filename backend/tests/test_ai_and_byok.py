"""
Tests for BYOK security, encryption, auth isolation, Gemini/Groq adapters,
provider factory, structured invoice extraction, deterministic validation,
and Celery task integration.
"""
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.core.security import (
    EncryptionError,
    EncryptionService,
    create_access_token,
    create_stream_token,
    decode_access_token,
    format_masked_from_last_four,
    hash_password,
    mask_api_key,
    verify_password,
    verify_stream_token,
)
from app.models.ai import AIProviderConnection
from app.models.user import User
from app.schemas.invoice import DuplicateMatch, InvoiceExtractionPayload
from app.services import ai_connection_service, document_service
from app.services.ai_providers import (
    AIProviderError,
    GeminiProvider,
    GroqProvider,
    ProviderErrorCategory,
    ProviderFactory,
)
from app.services.invoice_extraction_service import extract_invoice_with_provider
from app.services.invoice_validator import validate_invoice_deterministically


# ─── 1. Encryption, Masking & Password/JWT Security ──────────────────────────

def test_fernet_encryption_decryption_and_rotation():
    key1 = Fernet.generate_key().decode()
    key2 = Fernet.generate_key().decode()

    svc1 = EncryptionService(master_key=key1, allow_dev_fallback=False)
    secret = "AIzaSyExampleSecretKey12345"
    encrypted = svc1.encrypt(secret)
    assert secret not in encrypted
    assert svc1.decrypt(encrypted) == secret

    # Rotate using MultiFernet (new primary key2, old key1)
    svc_rotated = EncryptionService(master_key=f"{key2},{key1}", allow_dev_fallback=False)
    assert svc_rotated.decrypt(encrypted) == secret
    new_token = svc_rotated.rotate(encrypted)

    svc2_only = EncryptionService(master_key=key2, allow_dev_fallback=False)
    assert svc2_only.decrypt(new_token) == secret
    with pytest.raises(EncryptionError):
        svc2_only.decrypt(encrypted)


def test_encryption_fails_closed_on_missing_or_invalid_key():
    with pytest.raises(EncryptionError):
        EncryptionService(master_key="", allow_dev_fallback=False)

    with pytest.raises(EncryptionError):
        EncryptionService(master_key="not-a-valid-fernet-key", allow_dev_fallback=False)

    svc = EncryptionService(master_key=Fernet.generate_key().decode(), allow_dev_fallback=False)
    with pytest.raises(EncryptionError):
        svc.encrypt("   ")
    with pytest.raises(EncryptionError):
        svc.decrypt("corrupted-ciphertext")


def test_api_key_masking_never_leaks_prefix():
    masked, last4 = mask_api_key("gsk_secret1234567890abcd")
    assert last4 == "abcd"
    assert masked.endswith("abcd")
    assert "gsk_" not in masked
    assert "secret" not in masked

    short_masked, short_last4 = mask_api_key("abc")
    assert short_masked == "••••"
    assert short_last4 == ""
    assert format_masked_from_last_four("9876") == "••••••••9876"


def test_password_and_jwt_tokens():
    hashed = hash_password("StrongPassword!1")
    assert verify_password("StrongPassword!1", hashed) is True
    assert verify_password("WrongPassword", hashed) is False

    token = create_access_token("user-1", "a@b.com")
    payload = decode_access_token(token)
    assert payload["sub"] == "user-1"

    stoken = create_stream_token("user-1", "doc-99")
    assert verify_stream_token(stoken, "doc-99") == "user-1"
    with pytest.raises(HTTPException):
        verify_stream_token(stoken, "doc-other")


# ─── 2. API Authorization & User/Tenant Isolation ────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_endpoints_rejected():
    from app.main import app
    app.dependency_overrides.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        assert (await ac.get("/api/v1/documents")).status_code == 401
        assert (await ac.get("/api/v1/ai/connections")).status_code == 401
        assert (await ac.get("/api/v1/ai/usage")).status_code == 401
        assert (await ac.get("/api/v1/stats")).status_code == 401


@pytest.mark.asyncio
async def test_user_isolation_on_documents_and_connections():
    mock_db = AsyncMock()
    empty_res = MagicMock()
    empty_res.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = empty_res

    with pytest.raises(HTTPException) as doc_exc:
        await document_service.get_document(mock_db, "doc-belongs-to-user-b", user_id="user-a")
    assert doc_exc.value.status_code == 404

    with pytest.raises(HTTPException) as conn_exc:
        await ai_connection_service.get_user_connection(mock_db, "user-a", "conn-belongs-to-user-b")
    assert conn_exc.value.status_code == 404


@pytest.mark.asyncio
async def test_connection_response_never_exposes_raw_or_encrypted_key():
    from app.main import app
    from app.core.database import get_db
    from app.core.security import get_current_user

    user = User(id="u1", email="u1@test.com", full_name="U1", hashed_password="h", is_active=True)
    enc = EncryptionService(master_key=Fernet.generate_key().decode(), allow_dev_fallback=False)
    raw_secret = "AIzaSyVerySecretKey9999"
    conn = AIProviderConnection(
        id="conn-1",
        user_id="u1",
        provider="gemini",
        label="Personal Gemini",
        encrypted_api_key=enc.encrypt(raw_secret),
        key_last_four="9999",
        model="gemini-2.5-flash",
        is_active=True,
        is_default=True,
        connection_status="connected",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    try:
        with patch("app.api.ai_routes.ai_connection_service.list_connections", return_value=[conn]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/ai/connections")
        assert resp.status_code == 200
        body_text = resp.text
        assert raw_secret not in body_text
        assert conn.encrypted_api_key not in body_text
        assert resp.json()[0]["masked_api_key"] == "••••••••9999"
    finally:
        app.dependency_overrides.clear()


# ─── 3. Gemini & Groq Adapters + Provider Factory ────────────────────────────

def _mock_httpx_response(status_code: int, json_body: dict, headers: dict = None) -> httpx.Response:
    req = httpx.Request("POST", "https://example.com")
    return httpx.Response(status_code=status_code, json=json_body, headers=headers or {}, request=req)


def test_gemini_adapter_validate_and_generate_mocked():
    adapter = GeminiProvider(api_key="AIzaSyFakeKey1234", model="gemini-2.5-flash")

    models_resp = _mock_httpx_response(
        200,
        {"models": [{"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]}]},
    )
    with patch("httpx.Client.get", return_value=models_resp):
        val = adapter.validate_key("gemini-2.5-flash")
    assert val.valid is True
    assert val.status == "connected"

    bad_resp = _mock_httpx_response(400, {"error": {"message": "API key not valid."}})
    with patch("httpx.Client.get", return_value=bad_resp):
        bad_val = adapter.validate_key("gemini-2.5-flash")
    assert bad_val.valid is False
    assert bad_val.error_category == ProviderErrorCategory.INVALID_KEY

    gen_resp = _mock_httpx_response(
        200,
        {
            "candidates": [{"content": {"parts": [{"text": '{"invoice_number": {"value": "INV-1", "confidence": 0.99}}'}]}}],
            "usageMetadata": {"promptTokenCount": 120, "candidatesTokenCount": 45, "totalTokenCount": 165},
        },
    )
    with patch("httpx.Client.post", return_value=gen_resp):
        out = adapter.generate_structured("prompt", "sys")
    assert out.parsed_json["invoice_number"]["value"] == "INV-1"
    assert out.usage.input_tokens == 120
    assert out.usage.output_tokens == 45


def test_groq_adapter_validate_rate_limits_and_errors_mocked():
    adapter = GroqProvider(api_key="gsk_fake_key_9999", model="llama-3.3-70b-versatile")

    models_resp = _mock_httpx_response(
        200,
        {"data": [{"id": "llama-3.3-70b-versatile", "active": True, "context_window": 131072}]},
        headers={"x-ratelimit-remaining-requests": "29", "x-ratelimit-remaining-tokens": "5000"},
    )
    with patch("httpx.Client.get", return_value=models_resp):
        val = adapter.validate_key("llama-3.3-70b-versatile")
    assert val.valid is True
    assert val.usage_info["rate_limits"]["x-ratelimit-remaining-requests"] == "29"

    rate_resp = _mock_httpx_response(429, {"error": {"message": "Rate limit exceeded", "code": "rate_limit_exceeded"}})
    with patch("httpx.Client.post", return_value=rate_resp):
        with pytest.raises(AIProviderError) as exc_info:
            adapter.generate_structured("prompt", "sys")
    assert exc_info.value.category == ProviderErrorCategory.RATE_LIMIT
    assert exc_info.value.retryable is True

    quota_resp = _mock_httpx_response(429, {"error": {"message": "Insufficient quota", "code": "insufficient_quota"}})
    with patch("httpx.Client.post", return_value=quota_resp):
        with pytest.raises(AIProviderError) as quota_exc:
            adapter.generate_structured("prompt", "sys")
    assert quota_exc.value.category == ProviderErrorCategory.QUOTA_EXHAUSTED
    assert quota_exc.value.retryable is False


def test_provider_factory_selection_and_encryption_error():
    enc = EncryptionService(master_key=Fernet.generate_key().decode(), allow_dev_fallback=False)
    conn = MagicMock()
    conn.provider = "groq"
    conn.model = "llama-3.3-70b-versatile"
    conn.encrypted_api_key = enc.encrypt("gsk_factory_test_1234")

    provider = ProviderFactory.from_encrypted_connection(conn, encryption_service=enc)
    assert isinstance(provider, GroqProvider)
    assert provider.model == "llama-3.3-70b-versatile"

    bad_conn = MagicMock()
    bad_conn.provider = "gemini"
    bad_conn.model = "gemini-2.5-flash"
    bad_conn.encrypted_api_key = "tampered-token"
    with pytest.raises(AIProviderError) as exc_info:
        ProviderFactory.from_encrypted_connection(bad_conn, encryption_service=enc)
    assert exc_info.value.category == ProviderErrorCategory.ENCRYPTION_ERROR


# ─── 4. Structured Invoice Extraction & Deterministic Validation ─────────────

def test_invoice_extraction_and_gst_deterministic_validation():
    sample_text = """
    TAX INVOICE
    Invoice No: INV-GST-2026-01
    Invoice Date: 2026-10-01
    Due Date: 2026-10-31
    Vendor: Apex Cloud India Pvt Ltd
    Vendor GSTIN: 29ABCDE1234F1Z5
    Customer: Acme Corp
    Currency: INR
    Item 1: Cloud Compute (HSN 998314) Qty 2 x 5000.00 = 10000.00
    Subtotal: 10000.00
    CGST (9%): 900.00
    SGST (9%): 900.00
    Total Tax: 1800.00
    Grand Total: 11800.00
    """

    mock_ai_json = {
        "document_classification": "invoice",
        "summary": "Tax invoice from Apex Cloud India Pvt Ltd for cloud compute.",
        "invoice_number": {"value": "INV-GST-2026-01", "confidence": 0.99, "evidence": "Invoice No: INV-GST-2026-01"},
        "invoice_date": {"value": "2026-10-01", "confidence": 0.98, "evidence": "Invoice Date: 2026-10-01"},
        "due_date": {"value": "2026-10-31", "confidence": 0.97, "evidence": "Due Date: 2026-10-31"},
        "vendor_name": {"value": "Apex Cloud India Pvt Ltd", "confidence": 0.99, "evidence": "Vendor: Apex Cloud India Pvt Ltd"},
        "customer_name": {"value": "Acme Corp", "confidence": 0.95, "evidence": "Customer: Acme Corp"},
        "currency": {"value": "INR", "confidence": 0.99, "evidence": "Currency: INR"},
        "subtotal": {"value": 10000.0, "confidence": 0.99, "evidence": "Subtotal: 10000.00"},
        "tax_amount": {"value": 1800.0, "confidence": 0.98, "evidence": "Total Tax: 1800.00"},
        "total_amount": {"value": 11800.0, "confidence": 0.99, "evidence": "Grand Total: 11800.00"},
        "purchase_order_reference": {"value": None, "confidence": 0.0, "evidence": None},
        "gst": {
            "vendor_gstin": {"value": "29ABCDE1234F1Z5", "confidence": 0.97, "evidence": "Vendor GSTIN: 29ABCDE1234F1Z5"},
            "taxable_value": {"value": 10000.0, "confidence": 0.96, "evidence": "Subtotal: 10000.00"},
            "cgst": {"value": 900.0, "confidence": 0.98, "evidence": "CGST (9%): 900.00"},
            "sgst": {"value": 900.0, "confidence": 0.98, "evidence": "SGST (9%): 900.00"},
            "igst": {"value": None, "confidence": 0.0, "evidence": None},
        },
        "line_items": [
            {
                "description": "Cloud Compute",
                "hsn_sac_code": "998314",
                "quantity": 2,
                "unit_price": 5000.0,
                "total": 10000.0,
                "confidence": 0.98,
                "evidence": "Cloud Compute (HSN 998314) Qty 2 x 5000.00 = 10000.00",
            }
        ],
    }

    provider = GeminiProvider(api_key="AIzaSyMock123456")
    gen_resp = _mock_httpx_response(
        200,
        {
            "candidates": [{"content": {"parts": [{"text": json.dumps(mock_ai_json)}]}}],
            "usageMetadata": {"promptTokenCount": 300, "candidatesTokenCount": 200, "totalTokenCount": 500},
        },
    )
    with patch("httpx.Client.post", return_value=gen_resp):
        extracted, _ = extract_invoice_with_provider(provider, sample_text)

    assert extracted.purchase_order_reference.value is None
    assert extracted.purchase_order_reference.validation_status == "missing"

    report = validate_invoice_deterministically(extracted)
    assert report.overall_status == "valid"
    assert report.computed_line_items_sum == 10000.0
    assert report.computed_tax_sum == 1800.0
    assert report.computed_total == 11800.0


def test_deterministic_validator_catches_math_mismatch_and_duplicates():
    payload = InvoiceExtractionPayload.model_validate(
        {
            "invoice_number": {"value": "INV-DUP-1", "confidence": 0.9},
            "invoice_date": {"value": "2026-10-15", "confidence": 0.9},
            "due_date": {"value": "2026-10-01", "confidence": 0.9},  # before invoice_date!
            "vendor_name": {"value": "Bad Math Corp", "confidence": 0.9},
            "currency": {"value": "USD", "confidence": 0.9},
            "subtotal": {"value": 100.0, "confidence": 0.9},
            "tax_amount": {"value": 10.0, "confidence": 0.9},
            "total_amount": {"value": 999.0, "confidence": 0.9},  # wrong total!
            "line_items": [{"description": "Widget", "quantity": 2, "unit_price": 40.0, "total": 80.0, "confidence": 0.9}],
        }
    )
    dup = DuplicateMatch(
        document_id="doc-old-1",
        original_filename="old_invoice.pdf",
        invoice_number="INV-DUP-1",
        vendor_name="Bad Math Corp",
        status="completed",
    )
    report = validate_invoice_deterministically(payload, existing_duplicates=[dup])
    assert report.overall_status == "invalid"
    codes = {c.code: c.status for c in report.checks}
    assert codes["subtotal_consistency"] == "failed"
    assert codes["total_consistency"] == "failed"
    assert codes["date_order"] == "failed"
    assert codes["duplicate_invoice"] == "warning"


# ─── 5. Celery Task Integration & Failure Scenarios ──────────────────────────

def test_celery_task_processes_invoice_securely(tmp_path):
    from app.workers.celery_app import process_document_task

    inv_file = tmp_path / "invoice.txt"
    inv_file.write_text("Invoice No: INV-555\nDate: 2026-11-01\nVendor: Demo LLC\nCurrency: USD\nTotal: 50.00")

    enc = EncryptionService()
    encrypted_key = enc.encrypt("gsk_worker_secret_8888")

    doc_row = {
        "id": "doc-w1",
        "user_id": "user-w1",
        "file_path": str(inv_file),
        "original_filename": "invoice.txt",
        "file_type": ".txt",
        "file_size": inv_file.stat().st_size,
        "document_type": "invoice",
        "ai_connection_id": "conn-w1",
        "status": "queued",
        "celery_task_id": None,
    }
    conn_row = {
        "id": "conn-w1",
        "user_id": "user-w1",
        "provider": "groq",
        "encrypted_api_key": encrypted_key,
        "model": "llama-3.3-70b-versatile",
        "is_active": True,
    }

    ai_json = {
        "document_classification": "invoice",
        "summary": "Demo LLC invoice.",
        "invoice_number": {"value": "INV-555", "confidence": 0.99, "evidence": "Invoice No: INV-555"},
        "invoice_date": {"value": "2026-11-01", "confidence": 0.99, "evidence": "Date: 2026-11-01"},
        "vendor_name": {"value": "Demo LLC", "confidence": 0.99, "evidence": "Vendor: Demo LLC"},
        "currency": {"value": "USD", "confidence": 0.99, "evidence": "Currency: USD"},
        "total_amount": {"value": 50.0, "confidence": 0.99, "evidence": "Total: 50.00"},
        "line_items": [],
    }
    groq_resp = _mock_httpx_response(
        200,
        {
            "choices": [{"message": {"content": json.dumps(ai_json)}}],
            "usage": {"prompt_tokens": 50, "completion_tokens": 40, "total_tokens": 90},
        },
    )

    with (
        patch("app.workers.celery_app._load_document_record", return_value=doc_row),
        patch("app.workers.celery_app._resolve_user_connection", return_value=conn_row),
        patch("app.workers.celery_app._find_duplicate_invoices", return_value=[]),
        patch("app.workers.celery_app._safe_publish") as mock_pub,
        patch("app.workers.celery_app._update_db_status") as mock_db_upd,
        patch("app.workers.celery_app._record_usage_log") as mock_usage,
        patch("httpx.Client.post", return_value=groq_resp),
    ):
        res = process_document_task.run("doc-w1", "conn-w1")

    assert res["status"] == "completed"
    mock_usage.assert_called_once()
    assert mock_usage.call_args.kwargs["status"] == "success"
    assert mock_usage.call_args.kwargs["input_tokens"] == 50
    final_call = mock_db_upd.call_args_list[-1]
    assert final_call.args[1] == "completed"
    assert final_call.kwargs["invoice_number"] == "INV-555"
    assert any(c.args[1] == "job_completed" for c in mock_pub.call_args_list)


def test_celery_task_handles_missing_connection_and_skips_completed(tmp_path):
    from app.workers.celery_app import process_document_task

    # Already completed -> idempotent skip
    with patch(
        "app.workers.celery_app._load_document_record",
        return_value={"id": "doc-done", "status": "completed"},
    ):
        skip_res = process_document_task.run("doc-done", None)
    assert skip_res["status"] == "skipped"

    # Missing AI connection -> clean failure without retry loop
    txt = tmp_path / "doc.txt"
    txt.write_text("Invoice total 100")
    doc_row = {
        "id": "doc-nokey",
        "user_id": "user-nokey",
        "file_path": str(txt),
        "original_filename": "doc.txt",
        "file_type": ".txt",
        "file_size": 17,
        "document_type": "auto",
        "ai_connection_id": None,
        "status": "queued",
    }
    with (
        patch("app.workers.celery_app._load_document_record", return_value=doc_row),
        patch("app.workers.celery_app._resolve_user_connection", return_value=None),
        patch("app.workers.celery_app._safe_publish"),
        patch("app.workers.celery_app._update_db_status") as mock_upd,
        patch("app.workers.celery_app._record_usage_log"),
    ):
        fail_res = process_document_task.run("doc-nokey", None)
    assert fail_res["status"] == "failed"
    assert fail_res["error_category"] == "auth_failure"
    assert "AI Settings" in mock_upd.call_args_list[-1].kwargs["error"]


def test_celery_task_retries_transient_error_and_fails_permanent_error(tmp_path):
    from celery.exceptions import Retry
    from app.workers.celery_app import process_document_task

    inv_file = tmp_path / "retry_inv.txt"
    inv_file.write_text("Invoice No: INV-RETRY\nVendor: Retry Corp\nTotal: 25.00")

    enc = EncryptionService()
    encrypted_key = enc.encrypt("AIzaSyRetryKey9999")
    doc_row = {
        "id": "doc-retry-1",
        "user_id": "user-r1",
        "file_path": str(inv_file),
        "original_filename": "retry_inv.txt",
        "file_type": ".txt",
        "file_size": inv_file.stat().st_size,
        "document_type": "invoice",
        "ai_connection_id": "conn-r1",
        "status": "queued",
    }
    conn_row = {
        "id": "conn-r1",
        "user_id": "user-r1",
        "provider": "gemini",
        "encrypted_api_key": encrypted_key,
        "model": "gemini-2.5-flash",
        "is_active": True,
    }

    # Case A: Transient rate limit triggers self.retry and logs error_category='rate_limit'
    rate_err = AIProviderError(
        category=ProviderErrorCategory.RATE_LIMIT,
        user_message="Gemini rate limit hit.",
        provider="gemini",
        retryable=True,
    )
    with (
        patch("app.workers.celery_app._load_document_record", return_value=doc_row),
        patch("app.workers.celery_app._resolve_user_connection", return_value=conn_row),
        patch("app.workers.celery_app._safe_publish") as mock_pub,
        patch("app.workers.celery_app._update_db_status"),
        patch("app.workers.celery_app._record_usage_log") as mock_usage,
        patch("app.workers.celery_app.extract_invoice_with_provider", side_effect=rate_err),
        patch.object(process_document_task, "retry", side_effect=Retry("retrying")) as mock_retry,
    ):
        with pytest.raises(Retry):
            process_document_task.run("doc-retry-1", "conn-r1")

    mock_retry.assert_called_once()
    assert mock_usage.call_args.kwargs["error_category"] == "rate_limit"
    assert any(c.args[1] == "ai_retrying" for c in mock_pub.call_args_list)

    # Case B: Non-retryable quota exhaustion fails immediately without retry
    quota_err = AIProviderError(
        category=ProviderErrorCategory.QUOTA_EXHAUSTED,
        user_message="Provider quota exhausted.",
        provider="gemini",
        retryable=False,
    )
    with (
        patch("app.workers.celery_app._load_document_record", return_value=doc_row),
        patch("app.workers.celery_app._resolve_user_connection", return_value=conn_row),
        patch("app.workers.celery_app._safe_publish"),
        patch("app.workers.celery_app._update_db_status") as mock_upd,
        patch("app.workers.celery_app._record_usage_log") as mock_usage2,
        patch("app.workers.celery_app.extract_invoice_with_provider", side_effect=quota_err),
        patch.object(process_document_task, "retry") as mock_retry2,
    ):
        perm_res = process_document_task.run("doc-retry-1", "conn-r1")

    mock_retry2.assert_not_called()
    assert perm_res["status"] == "failed"
    assert perm_res["error_category"] == "quota_exhausted"
    assert mock_usage2.call_args.kwargs["error_category"] == "quota_exhausted"
    assert mock_upd.call_args_list[-1].args[1] == "failed"


# ─── 6. Auth & BYOK Connection API Routes ────────────────────────────────────

@pytest.mark.asyncio
async def test_auth_register_login_and_me_routes():
    from app.main import app
    from app.core.database import get_db

    app.dependency_overrides.clear()
    stored_users = {}

    class FakeResult:
        def __init__(self, user_obj):
            self._user_obj = user_obj

        def scalar_one_or_none(self):
            return self._user_obj

    class FakeAsyncSession:
        async def execute(self, stmt):
            params = stmt.compile().params
            lookup_val = next(iter(params.values()), None)
            return FakeResult(stored_users.get(lookup_val))

        def add(self, obj):
            stored_users[obj.email] = obj
            stored_users[obj.id] = obj

        async def commit(self):
            return None

        async def refresh(self, obj):
            if obj.created_at is None:
                obj.created_at = datetime.utcnow()

    fake_db = FakeAsyncSession()
    app.dependency_overrides[get_db] = lambda: fake_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            reg = await ac.post(
                "/api/v1/auth/register",
                json={"email": "alice@docflow.io", "full_name": "Alice Doe", "password": "Password123!"},
            )
            assert reg.status_code == 201
            token = reg.json()["access_token"]
            assert reg.json()["user"]["email"] == "alice@docflow.io"

            # Duplicate email -> 409
            dup = await ac.post(
                "/api/v1/auth/register",
                json={"email": "alice@docflow.io", "full_name": "Alice Doe", "password": "Password123!"},
            )
            assert dup.status_code == 409

            # Wrong password -> 401
            bad_login = await ac.post(
                "/api/v1/auth/login",
                json={"email": "alice@docflow.io", "password": "WrongPassword!"},
            )
            assert bad_login.status_code == 401

            # Valid login -> 200
            good_login = await ac.post(
                "/api/v1/auth/login",
                json={"email": "alice@docflow.io", "password": "Password123!"},
            )
            assert good_login.status_code == 200
            assert "access_token" in good_login.json()

            # /me with Bearer token -> 200
            me = await ac.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
            assert me.status_code == 200
            assert me.json()["email"] == "alice@docflow.io"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_ai_connections_crud_test_models_and_usage_routes():
    from app.main import app
    from app.core.database import get_db
    from app.core.security import get_current_user
    from app.schemas.ai import AIConnectionTestResponse, AIUsageProviderSummary, AIUsageResponse

    user = User(id="u-byok", email="byok@test.com", full_name="BYOK User", hashed_password="h", is_active=True)
    enc = EncryptionService(master_key=Fernet.generate_key().decode(), allow_dev_fallback=False)
    sample_conn = AIProviderConnection(
        id="conn-byok-1",
        user_id="u-byok",
        provider="groq",
        label="Work Groq",
        encrypted_api_key=enc.encrypt("gsk_secret_live_5678"),
        key_last_four="5678",
        model="llama-3.3-70b-versatile",
        is_active=True,
        is_default=True,
        connection_status="connected",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # GET /models
            models_resp = await ac.get("/api/v1/ai/models?provider=gemini")
            assert models_resp.status_code == 200
            assert "gemini" in models_resp.json()
            assert len(models_resp.json()["gemini"]) >= 1

            # POST /connections
            with patch("app.api.ai_routes.ai_connection_service.create_connection", return_value=sample_conn):
                create_resp = await ac.post(
                    "/api/v1/ai/connections",
                    json={
                        "provider": "groq",
                        "label": "Work Groq",
                        "api_key": "gsk_secret_live_5678",
                        "model": "llama-3.3-70b-versatile",
                        "is_default": True,
                        "test_before_save": True,
                    },
                )
            assert create_resp.status_code == 201
            assert create_resp.json()["masked_api_key"] == "••••••••5678"
            assert "gsk_secret_live_5678" not in create_resp.text

            # POST /connections/test
            test_res = AIConnectionTestResponse(
                valid=True,
                status="connected",
                message="Connected to Groq",
                provider="groq",
                model="llama-3.3-70b-versatile",
                supported_models=["llama-3.3-70b-versatile"],
            )
            with patch("app.api.ai_routes.ai_connection_service.test_connection", return_value=test_res):
                test_resp = await ac.post(
                    "/api/v1/ai/connections/test",
                    json={"provider": "groq", "api_key": "gsk_secret_live_5678", "model": "llama-3.3-70b-versatile"},
                )
            assert test_resp.status_code == 200
            assert test_resp.json()["valid"] is True

            # PATCH /connections/{id}
            updated_conn = sample_conn
            updated_conn.model = "openai/gpt-oss-120b"
            with patch("app.api.ai_routes.ai_connection_service.update_connection", return_value=updated_conn):
                patch_resp = await ac.patch(
                    "/api/v1/ai/connections/conn-byok-1",
                    json={"model": "openai/gpt-oss-120b"},
                )
            assert patch_resp.status_code == 200
            assert patch_resp.json()["model"] == "openai/gpt-oss-120b"

            # DELETE /connections/{id}
            with patch("app.api.ai_routes.ai_connection_service.delete_connection", return_value=None):
                del_resp = await ac.delete("/api/v1/ai/connections/conn-byok-1")
            assert del_resp.status_code == 204

            # GET /usage
            usage_payload = AIUsageResponse(
                totals={
                    "total_requests": 3,
                    "successful_requests": 2,
                    "failed_requests": 1,
                    "input_tokens": 1500,
                    "output_tokens": 600,
                    "total_tokens": 2100,
                },
                by_provider=[
                    AIUsageProviderSummary(
                        provider="groq",
                        total_requests=3,
                        successful_requests=2,
                        failed_requests=1,
                        input_tokens=1500,
                        output_tokens=600,
                        total_tokens=2100,
                        avg_duration_seconds=1.12,
                    )
                ],
                recent_logs=[],
            )
            with patch("app.api.ai_routes.ai_connection_service.get_usage_summary", return_value=usage_payload):
                usage_resp = await ac.get("/api/v1/ai/usage")
            assert usage_resp.status_code == 200
            assert usage_resp.json()["totals"]["input_tokens"] == 1500
    finally:
        app.dependency_overrides.clear()

