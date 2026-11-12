import asyncio
import csv
import io
import json
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.redis_client import get_async_redis
from app.core.security import create_stream_token, get_current_user, get_sse_user
from app.models.document import JobStatus
from app.models.user import User
from app.schemas.auth import StreamTokenOut
from app.schemas.document import (
    DocumentListOut,
    DocumentListResponse,
    DocumentOut,
    ReprocessRequest,
    ReviewUpdate,
)
from app.services import ai_connection_service, document_service
from app.workers.celery_app import process_document_task

router = APIRouter(prefix="/api/v1", tags=["documents"])


def _flatten_export_rows(doc_name: str, data: dict) -> list[list[str]]:
    """Build clean CSV rows for either structured AI invoice outputs or generic flat schemas."""
    rows: list[list[str]] = []
    if isinstance(data, dict) and "invoice" in data and isinstance(data["invoice"], dict):
        invoice = data["invoice"]
        for key, val in invoice.items():
            if key == "line_items" and isinstance(val, list):
                for idx, item in enumerate(val, start=1):
                    if isinstance(item, dict):
                        for sub_k, sub_v in item.items():
                            rows.append([doc_name, f"line_item_{idx}.{sub_k}", "" if sub_v is None else str(sub_v), "", "", ""])
            elif isinstance(val, dict) and "value" in val:
                rows.append([
                    doc_name,
                    key,
                    "" if val.get("value") is None else (json.dumps(val["value"]) if isinstance(val["value"], (dict, list)) else str(val["value"])),
                    str(val.get("confidence", "")),
                    str(val.get("validation_status", "")),
                    str(val.get("evidence") or ""),
                ])
            else:
                rows.append([doc_name, key, json.dumps(val) if isinstance(val, (dict, list)) else ("" if val is None else str(val)), "", "", ""])
        return rows

    for k, v in data.items():
        rows.append([doc_name, k, json.dumps(v) if isinstance(v, (dict, list)) else ("" if v is None else str(v))])
    return rows


@router.post("/upload", response_model=list[DocumentOut])
async def upload_documents(
    files: list[UploadFile] = File(...),
    document_type: str = Form("auto"),
    connection_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided for ingestion.")

    resolved_connection_id: Optional[str] = None
    if connection_id:
        conn = await ai_connection_service.get_effective_connection(db, current_user.id, connection_id)
        resolved_connection_id = conn.id if conn else None
    else:
        conn = await ai_connection_service.get_effective_connection(db, current_user.id)
        resolved_connection_id = conn.id if conn else None

    batch_id = str(uuid.uuid4()) if len(files) > 1 else None

    docs = []
    for file in files:
        doc = await document_service.create_document(
            db,
            file,
            user_id=current_user.id,
            document_type=document_type,
            batch_id=batch_id,
            ai_connection_id=resolved_connection_id,
        )
        docs.append(doc)

    # Pass only identifiers to Celery — never raw or encrypted API keys
    for doc in docs:
        try:
            task = process_document_task.apply_async(
                args=[doc.id, resolved_connection_id],
                task_id=None,
            )
            doc.celery_task_id = task.id
        except Exception as exc:
            doc.status = JobStatus.FAILED
            doc.error_message = f"Broker enqueue failed: {str(exc)}"

    await db.commit()
    for doc in docs:
        await db.refresh(doc)
    return docs


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    batch_id: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    docs, total = await document_service.list_documents(
        db,
        page=page,
        page_size=page_size,
        status=status,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        user_id=current_user.id,
        batch_id=batch_id,
    )
    return DocumentListResponse(
        items=[DocumentListOut.model_validate(d) for d in docs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/documents/export/batch")
async def export_batch_documents(
    ids: str = Query(..., description="Comma-separated document IDs"),
    format: str = Query("json"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc_ids = [i.strip() for i in ids.split(",") if i.strip()]
    if not doc_ids:
        raise HTTPException(status_code=400, detail="Provide at least one document ID.")

    docs = await document_service.list_documents_by_ids(db, doc_ids, user_id=current_user.id)
    exportable = [d for d in docs if (d.reviewed_data or d.extracted_data)]
    if not exportable:
        raise HTTPException(status_code=400, detail="No processed documents found to export.")

    if format == "json":
        payload = [
            {
                "document_id": d.id,
                "filename": d.original_filename,
                "status": d.status.value if hasattr(d.status, "value") else str(d.status),
                "ai_provider": d.ai_provider,
                "ai_model": d.ai_model,
                "data": d.reviewed_data or d.extracted_data,
            }
            for d in exportable
        ]
        return StreamingResponse(
            io.StringIO(json.dumps(payload, indent=2)),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="docflow_batch_export.json"'},
        )
    elif format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Document", "Field", "Value", "Confidence", "Validation Status", "Evidence"])
        for d in exportable:
            data = d.reviewed_data or d.extracted_data or {}
            for row in _flatten_export_rows(d.original_filename, data):
                if len(row) == 3:
                    writer.writerow([row[0], row[1], row[2], "", "", ""])
                else:
                    writer.writerow(row)
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="docflow_batch_export.csv"'},
        )
    else:
        return JSONResponse(status_code=400, content={"detail": "Unsupported format. Use json or csv"})


@router.get("/documents/{doc_id}", response_model=DocumentOut)
async def get_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await document_service.get_document(db, doc_id, user_id=current_user.id)


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await document_service.delete_document(db, doc_id, user_id=current_user.id)
    return None


@router.get("/documents/{doc_id}/progress")
async def get_progress(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll-based progress endpoint reading from Redis after ownership check."""
    await document_service.get_document(db, doc_id, user_id=current_user.id)
    try:
        redis = await get_async_redis()
        data = await redis.hgetall(f"job_status:{doc_id}")
        if not data:
            return {"job_id": doc_id, "event": "unknown", "progress": 0, "message": "No active status available"}
        return {
            "job_id": doc_id,
            "event": data.get("event", "unknown"),
            "progress": int(data.get("progress", 0)),
            "message": data.get("message", ""),
        }
    except Exception as exc:
        return {"job_id": doc_id, "event": "offline", "progress": 0, "message": f"Redis cache unavailable: {str(exc)}"}


@router.post("/documents/{doc_id}/stream-token", response_model=StreamTokenOut)
async def issue_stream_token(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Issue a short-lived scoped token for browser EventSource SSE connections."""
    await document_service.get_document(db, doc_id, user_id=current_user.id)
    token = create_stream_token(current_user.id, doc_id)
    return StreamTokenOut(
        stream_token=token,
        expires_in_seconds=settings.STREAM_TOKEN_EXPIRE_SECONDS,
    )


@router.get("/documents/{doc_id}/stream")
async def stream_progress(
    doc_id: str,
    current_user: User = Depends(get_sse_user),
    db: AsyncSession = Depends(get_db),
):
    """Authenticated SSE endpoint for real-time progress streaming via Redis Pub/Sub."""
    await document_service.get_document(db, doc_id, user_id=current_user.id)

    async def event_generator():
        try:
            redis = await get_async_redis()
            pubsub = redis.pubsub()
            await pubsub.subscribe(f"job_progress:{doc_id}")
            try:
                yield f"data: {json.dumps({'event': 'connected', 'job_id': doc_id})}\n\n"
                timeout = 120
                elapsed = 0
                while elapsed < timeout:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                    if message and message["type"] == "message":
                        yield f"data: {message['data']}\n\n"
                        data = json.loads(message["data"])
                        if data.get("event") in ["job_completed", "job_failed"]:
                            break
                    else:
                        yield ": keepalive\n\n"
                        elapsed += 1
                    await asyncio.sleep(0.1)
            finally:
                await pubsub.unsubscribe(f"job_progress:{doc_id}")
                await pubsub.close()
        except Exception as exc:
            yield f"data: {json.dumps({'event': 'error', 'message': f'Stream unavailable: {str(exc)}'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.put("/documents/{doc_id}/review", response_model=DocumentOut)
async def update_review(
    doc_id: str,
    update: ReviewUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await document_service.update_reviewed_data(db, doc_id, update, user_id=current_user.id)


@router.post("/documents/{doc_id}/finalize", response_model=DocumentOut)
async def finalize(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await document_service.finalize_document(db, doc_id, user_id=current_user.id)


@router.post("/documents/{doc_id}/retry", response_model=DocumentOut)
async def retry(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await document_service.retry_document(db, doc_id, user_id=current_user.id)
    conn = await ai_connection_service.get_effective_connection(
        db, current_user.id, doc.ai_connection_id
    ) if doc.ai_connection_id else await ai_connection_service.get_effective_connection(db, current_user.id)
    conn_id = conn.id if conn else None
    try:
        task = process_document_task.apply_async(args=[doc.id, conn_id])
        doc.celery_task_id = task.id
    except Exception as exc:
        doc.status = JobStatus.FAILED
        doc.error_message = f"Failed to re-enqueue task to broker: {str(exc)}"

    await db.commit()
    await db.refresh(doc)
    return doc


@router.post("/documents/{doc_id}/reprocess", response_model=DocumentOut)
async def reprocess(
    doc_id: str,
    payload: Optional[ReprocessRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    req = payload or ReprocessRequest()
    conn_id = req.connection_id
    if conn_id:
        conn = await ai_connection_service.get_effective_connection(db, current_user.id, conn_id)
        conn_id = conn.id if conn else None
    else:
        conn = await ai_connection_service.get_effective_connection(db, current_user.id)
        conn_id = conn.id if conn else None

    doc = await document_service.prepare_reprocess_document(
        db,
        doc_id,
        user_id=current_user.id,
        connection_id=conn_id,
        document_type=req.document_type,
    )
    try:
        task = process_document_task.apply_async(args=[doc.id, conn_id])
        doc.celery_task_id = task.id
    except Exception as exc:
        doc.status = JobStatus.FAILED
        doc.error_message = f"Failed to re-enqueue task to broker: {str(exc)}"

    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/documents/{doc_id}/export/{format}")
async def export_document(
    doc_id: str,
    format: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await document_service.get_document(db, doc_id, user_id=current_user.id)
    data = doc.reviewed_data or doc.extracted_data
    if not data:
        return JSONResponse(status_code=400, content={"detail": "No processed data to export"})

    clean_filename = doc.original_filename.replace('"', "").replace(";", "")

    if format == "json":
        content = json.dumps(data, indent=2)
        return StreamingResponse(
            io.StringIO(content),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{clean_filename}.json"'},
        )
    elif format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        if isinstance(data, dict) and "invoice" in data:
            writer.writerow(["Document", "Field", "Value", "Confidence", "Validation Status", "Evidence"])
            for row in _flatten_export_rows(doc.original_filename, data):
                writer.writerow(row if len(row) == 6 else [row[0], row[1], row[2], "", "", ""])
        else:
            writer.writerow(["Field", "Value"])
            for k, v in data.items():
                writer.writerow([k, json.dumps(v) if isinstance(v, (dict, list)) else v])
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{clean_filename}.csv"'},
        )
    else:
        return JSONResponse(status_code=400, content={"detail": "Unsupported format. Use json or csv"})


@router.get("/stats")
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT status, COUNT(*) as count FROM documents WHERE user_id = :user_id GROUP BY status"),
        {"user_id": current_user.id},
    )
    rows = result.fetchall()
    return {str(row[0]).lower(): row[1] for row in rows}
