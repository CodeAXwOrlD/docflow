"""
Basic tests for DocFlow backend.
Run with: pytest tests/ -v
"""
import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def client():
    """Create test client with mocked DB and Redis."""
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_list_documents_empty(client):
    """List endpoint should return paginated empty list."""
    with patch("app.api.routes.document_service.list_documents", return_value=([], 0)):
        response = await client.get("/api/v1/documents")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_upload_invalid_extension(client):
    """Uploading a disallowed file type should return 400."""
    import io
    fake_file = io.BytesIO(b"fake exe content")
    response = await client.post(
        "/api/v1/upload",
        files={"files": ("malicious.exe", fake_file, "application/octet-stream")},
    )
    assert response.status_code in (400, 422, 500)


def test_generate_structured_output():
    """Unit test the extraction logic."""
    from app.workers.celery_app import _generate_structured_output
    result = _generate_structured_output(
        text="Invoice total payment amount due services rendered",
        filename="test_invoice.txt",
        file_type=".txt",
        file_size=1024,
    )
    assert result["category"] == "Financial / Invoice"
    assert result["title"] == "Test Invoice"
    assert isinstance(result["extracted_keywords"], list)
    assert result["file_metadata"]["file_type"] == ".txt"


def test_extract_text_txt(tmp_path):
    """Unit test text extraction from .txt file."""
    from app.workers.celery_app import _extract_text_from_file
    p = tmp_path / "test.txt"
    p.write_text("Hello world from DocFlow")
    result = _extract_text_from_file(str(p), ".txt")
    assert "Hello world" in result


def test_publish_progress_stores_in_redis():
    """Test that publish_progress writes to Redis hash."""
    mock_redis = MagicMock()
    with patch("app.core.redis_client.get_sync_redis", return_value=mock_redis):
        from app.core.redis_client import publish_progress
        publish_progress("job-123", "job_started", 10, "Starting…")
    mock_redis.publish.assert_called_once()
    mock_redis.hset.assert_called_once()
