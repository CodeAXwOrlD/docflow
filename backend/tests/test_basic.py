"""
Basic tests for DocFlow backend.
Run with: pytest tests/ -v
"""
import io
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, MagicMock, AsyncMock
from app.models.user import User


@pytest.fixture
def mock_user():
    return User(
        id="user-test-1",
        email="tester@docflow.dev",
        full_name="Test User",
        hashed_password="x",
        is_active=True,
    )


@pytest.fixture
async def client(mock_user):
    """Create authenticated test client with mocked DB/user."""
    from app.main import app
    from app.core.security import get_current_user
    from app.core.database import get_db

    async def override_user():
        return mock_user

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
    fake_file = io.BytesIO(b"fake exe content")
    with patch("app.api.routes.ai_connection_service.get_effective_connection", return_value=None):
        response = await client.post(
            "/api/v1/upload",
            files={"files": ("malicious.exe", fake_file, "application/octet-stream")},
        )
    assert response.status_code == 400
    assert "not permitted" in response.json()["detail"]


def test_generate_structured_output():
    """Unit test the fallback extraction helper."""
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
