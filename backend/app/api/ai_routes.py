from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.ai import (
    AIConnectionCreate,
    AIConnectionOut,
    AIConnectionTestRequest,
    AIConnectionTestResponse,
    AIConnectionUpdate,
    AIModelOut,
    AIUsageResponse,
)
from app.services import ai_connection_service
from app.services.ai_providers import AIProviderError, ProviderFactory

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


@router.get("/connections", response_model=List[AIConnectionOut])
async def get_connections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the authenticated user's configured AI provider connections (masked keys only)."""
    conns = await ai_connection_service.list_connections(db, current_user.id)
    return [ai_connection_service.to_connection_out(c) for c in conns]


@router.post("/connections", response_model=AIConnectionOut, status_code=status.HTTP_201_CREATED)
async def create_connection(
    payload: AIConnectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Encrypt and save a new BYOK AI provider connection for the authenticated user."""
    conn = await ai_connection_service.create_connection(db, current_user.id, payload)
    return ai_connection_service.to_connection_out(conn)


@router.post("/connections/test", response_model=AIConnectionTestResponse)
async def test_connection(
    payload: AIConnectionTestRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate a saved or draft API key via backend-only provider connection test."""
    return await ai_connection_service.test_connection(db, current_user.id, payload)


@router.patch("/connections/{connection_id}", response_model=AIConnectionOut)
async def update_connection(
    connection_id: str,
    payload: AIConnectionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace key, switch model, activate/deactivate, or set default provider connection."""
    conn = await ai_connection_service.update_connection(db, current_user.id, connection_id, payload)
    return ai_connection_service.to_connection_out(conn)


@router.delete("/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    connection_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a user's AI provider connection."""
    await ai_connection_service.delete_connection(db, current_user.id, connection_id)
    return None


@router.get("/models", response_model=dict[str, List[AIModelOut]])
async def get_models(
    provider: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    """Return supported models grouped by AI provider."""
    try:
        catalog = ProviderFactory.get_catalog_models(provider=provider)
    except AIProviderError as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=exc.user_message) from exc
    return {
        prov: [AIModelOut(**m) for m in models]
        for prov, models in catalog.items()
    }


@router.get("/usage", response_model=AIUsageResponse)
async def get_usage(
    limit: int = Query(default=25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregated AI token usage and recent telemetry logs for the authenticated user."""
    return await ai_connection_service.get_usage_summary(db, current_user.id, limit=limit)

