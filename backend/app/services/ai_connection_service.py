import uuid
from datetime import datetime
from typing import List, Optional, Tuple
import anyio
from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    EncryptionError,
    EncryptionService,
    format_masked_from_last_four,
    get_encryption_service,
    mask_api_key,
)
from app.models.ai import AIProviderConnection, AIUsageLog
from app.schemas.ai import (
    AIConnectionCreate,
    AIConnectionOut,
    AIConnectionTestRequest,
    AIConnectionTestResponse,
    AIConnectionUpdate,
    AIUsageLogOut,
    AIUsageProviderSummary,
    AIUsageResponse,
)
from app.services.ai_providers import AIProviderError, KeyValidationResult, ProviderFactory


def to_connection_out(conn: AIProviderConnection) -> AIConnectionOut:
    """Serialize AIProviderConnection without ever exposing encrypted or raw API keys."""
    return AIConnectionOut(
        id=conn.id,
        provider=conn.provider,
        label=conn.label,
        masked_api_key=format_masked_from_last_four(conn.key_last_four),
        key_last_four=conn.key_last_four,
        model=conn.model,
        is_active=conn.is_active,
        is_default=conn.is_default,
        connection_status=conn.connection_status,
        last_tested_at=conn.last_tested_at,
        last_error=conn.last_error,
        created_at=conn.created_at,
        updated_at=conn.updated_at,
    )


async def list_connections(db: AsyncSession, user_id: str) -> List[AIProviderConnection]:
    result = await db.execute(
        select(AIProviderConnection)
        .where(AIProviderConnection.user_id == user_id)
        .order_by(AIProviderConnection.is_default.desc(), AIProviderConnection.created_at.desc())
    )
    return list(result.scalars().all())


async def get_user_connection(
    db: AsyncSession, user_id: str, connection_id: str
) -> AIProviderConnection:
    result = await db.execute(
        select(AIProviderConnection).where(
            AIProviderConnection.id == connection_id,
            AIProviderConnection.user_id == user_id,
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI provider connection not found.",
        )
    return conn


async def get_effective_connection(
    db: AsyncSession, user_id: str, connection_id: Optional[str] = None
) -> Optional[AIProviderConnection]:
    """Resolve explicit active connection or the user's default/first active connection."""
    if connection_id:
        conn = await get_user_connection(db, user_id, connection_id)
        if not conn.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected AI provider connection is inactive. Activate it in AI Settings.",
            )
        return conn

    result = await db.execute(
        select(AIProviderConnection)
        .where(
            AIProviderConnection.user_id == user_id,
            AIProviderConnection.is_active.is_(True),
        )
        .order_by(AIProviderConnection.is_default.desc(), AIProviderConnection.updated_at.desc())
    )
    return result.scalars().first()


async def _clear_default_connections(db: AsyncSession, user_id: str, exclude_id: Optional[str] = None) -> None:
    stmt = (
        update(AIProviderConnection)
        .where(AIProviderConnection.user_id == user_id)
        .values(is_default=False)
    )
    if exclude_id:
        stmt = stmt.where(AIProviderConnection.id != exclude_id)
    await db.execute(stmt)


async def _run_provider_test(provider_name: str, api_key: str, model: Optional[str]) -> KeyValidationResult:
    adapter = ProviderFactory.create_provider(provider=provider_name, api_key=api_key, model=model)
    return await anyio.to_thread.run_sync(adapter.validate_key, model)


async def create_connection(
    db: AsyncSession,
    user_id: str,
    payload: AIConnectionCreate,
    encryption_service: Optional[EncryptionService] = None,
) -> AIProviderConnection:
    enc = encryption_service or get_encryption_service()

    connection_status = "untested"
    last_tested_at = None
    last_error = None

    if payload.test_before_save:
        validation = await _run_provider_test(payload.provider, payload.api_key, payload.model)
        last_tested_at = datetime.utcnow()
        connection_status = validation.status
        if not validation.valid:
            last_error = validation.message
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=validation.message,
            )

    try:
        encrypted_key = enc.encrypt(payload.api_key)
    except EncryptionError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    _, last_four = mask_api_key(payload.api_key)

    existing_count_res = await db.execute(
        select(func.count(AIProviderConnection.id)).where(AIProviderConnection.user_id == user_id)
    )
    existing_count = existing_count_res.scalar() or 0
    should_be_default = payload.is_default or existing_count == 0

    if should_be_default:
        await _clear_default_connections(db, user_id)

    conn = AIProviderConnection(
        id=str(uuid.uuid4()),
        user_id=user_id,
        provider=payload.provider,
        label=payload.label.strip() if payload.label else None,
        encrypted_api_key=encrypted_key,
        key_last_four=last_four,
        model=payload.model,
        is_active=payload.is_active,
        is_default=should_be_default,
        connection_status=connection_status,
        last_tested_at=last_tested_at,
        last_error=last_error,
    )
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return conn


async def test_connection(
    db: AsyncSession,
    user_id: str,
    payload: AIConnectionTestRequest,
    encryption_service: Optional[EncryptionService] = None,
) -> AIConnectionTestResponse:
    enc = encryption_service or get_encryption_service()

    if payload.connection_id:
        conn = await get_user_connection(db, user_id, payload.connection_id)
        try:
            plaintext_key = enc.decrypt(conn.encrypted_api_key)
        except EncryptionError as exc:
            conn.connection_status = "error"
            conn.last_tested_at = datetime.utcnow()
            conn.last_error = str(exc)
            await db.commit()
            await db.refresh(conn)
            return AIConnectionTestResponse(
                valid=False,
                status="error",
                message=str(exc),
                provider=conn.provider,
                model=payload.model or conn.model,
                error_category="encryption_error",
                connection=to_connection_out(conn),
            )

        target_model = payload.model or conn.model
        result = await _run_provider_test(conn.provider, plaintext_key, target_model)
        conn.connection_status = result.status
        conn.last_tested_at = datetime.utcnow()
        conn.last_error = None if result.valid else result.message
        await db.commit()
        await db.refresh(conn)
        return AIConnectionTestResponse(
            valid=result.valid,
            status=result.status,
            message=result.message,
            provider=conn.provider,
            model=target_model,
            error_category=result.error_category.value if result.error_category else None,
            usage_info=result.usage_info,
            connection=to_connection_out(conn),
        )

    if not payload.provider or not payload.api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either connection_id or both provider and api_key to test.",
        )

    result = await _run_provider_test(payload.provider, payload.api_key, payload.model)
    return AIConnectionTestResponse(
        valid=result.valid,
        status=result.status,
        message=result.message,
        provider=payload.provider,
        model=payload.model,
        error_category=result.error_category.value if result.error_category else None,
        usage_info=result.usage_info,
    )


async def update_connection(
    db: AsyncSession,
    user_id: str,
    connection_id: str,
    payload: AIConnectionUpdate,
    encryption_service: Optional[EncryptionService] = None,
) -> AIProviderConnection:
    enc = encryption_service or get_encryption_service()
    conn = await get_user_connection(db, user_id, connection_id)

    if payload.api_key is not None:
        try:
            conn.encrypted_api_key = enc.encrypt(payload.api_key)
        except EncryptionError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(exc),
            ) from exc
        _, last_four = mask_api_key(payload.api_key)
        conn.key_last_four = last_four
        conn.connection_status = "untested"
        conn.last_error = None

    if payload.model is not None:
        conn.model = payload.model
    if payload.label is not None:
        conn.label = payload.label.strip() or None
    if payload.is_active is not None:
        conn.is_active = payload.is_active
        if not payload.is_active and conn.is_default:
            conn.is_default = False

    if payload.is_default is True:
        await _clear_default_connections(db, user_id, exclude_id=conn.id)
        conn.is_default = True
        conn.is_active = True
    elif payload.is_default is False:
        conn.is_default = False

    await db.commit()
    await db.refresh(conn)
    return conn


async def delete_connection(db: AsyncSession, user_id: str, connection_id: str) -> None:
    conn = await get_user_connection(db, user_id, connection_id)
    was_default = conn.is_default
    await db.delete(conn)
    await db.commit()

    if was_default:
        replacement_res = await db.execute(
            select(AIProviderConnection)
            .where(
                AIProviderConnection.user_id == user_id,
                AIProviderConnection.is_active.is_(True),
            )
            .order_by(AIProviderConnection.created_at.desc())
        )
        replacement = replacement_res.scalars().first()
        if replacement:
            replacement.is_default = True
            await db.commit()


async def get_usage_summary(
    db: AsyncSession, user_id: str, limit: int = 25
) -> AIUsageResponse:
    logs_res = await db.execute(
        select(AIUsageLog)
        .where(AIUsageLog.user_id == user_id)
        .order_by(AIUsageLog.created_at.desc())
        .limit(limit)
    )
    recent_logs = list(logs_res.scalars().all())

    all_logs_res = await db.execute(
        select(AIUsageLog).where(AIUsageLog.user_id == user_id)
    )
    all_logs = list(all_logs_res.scalars().all())

    by_provider_map = {}
    total_input = 0
    total_output = 0
    total_success = 0
    total_failed = 0
    total_duration = 0.0

    for row in all_logs:
        total_input += row.input_tokens
        total_output += row.output_tokens
        total_duration += float(row.processing_duration or 0.0)
        if row.status == "success":
            total_success += 1
        else:
            total_failed += 1

        bucket = by_provider_map.setdefault(
            row.provider,
            {
                "provider": row.provider,
                "total_requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "duration_sum": 0.0,
            },
        )
        bucket["total_requests"] += 1
        if row.status == "success":
            bucket["successful_requests"] += 1
        else:
            bucket["failed_requests"] += 1
        bucket["input_tokens"] += row.input_tokens
        bucket["output_tokens"] += row.output_tokens
        bucket["duration_sum"] += float(row.processing_duration or 0.0)

    by_provider: List[AIUsageProviderSummary] = []
    for prov, b in sorted(by_provider_map.items()):
        cnt = b["total_requests"] or 1
        by_provider.append(
            AIUsageProviderSummary(
                provider=prov,
                total_requests=b["total_requests"],
                successful_requests=b["successful_requests"],
                failed_requests=b["failed_requests"],
                input_tokens=b["input_tokens"],
                output_tokens=b["output_tokens"],
                total_tokens=b["input_tokens"] + b["output_tokens"],
                avg_duration_seconds=round(b["duration_sum"] / cnt, 3),
            )
        )

    total_requests = len(all_logs)
    return AIUsageResponse(
        totals={
            "total_requests": total_requests,
            "successful_requests": total_success,
            "failed_requests": total_failed,
            "input_tokens": total_input,
            "output_tokens": total_output,
            "total_tokens": total_input + total_output,
            "avg_duration_seconds": round(total_duration / total_requests, 3) if total_requests else 0.0,
        },
        by_provider=by_provider,
        recent_logs=[AIUsageLogOut.model_validate(r) for r in recent_logs],
    )

