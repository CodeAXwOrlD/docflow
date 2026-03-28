import json
import csv
import io
import asyncio
from fastapi import APIRouter, Depends, UploadFile, File, Query, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.redis_client import get_async_redis
from app.schemas.document import DocumentOut, DocumentListResponse, ReviewUpdate, DocumentListOut
from app.services import document_service
from app.workers.celery_app import process_document_task

router = APIRouter(prefix="/api/v1", tags=["documents"])


@router.post("/upload", response_model=list[DocumentOut])
async def upload_documents(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    results = []
    for file in files:
        doc = await document_service.create_document(db, file)
        # Dispatch Celery task
        task = process_document_task.apply_async(
            args=[doc.id, doc.file_path, doc.original_filename, doc.file_type, doc.file_size],
            task_id=None,
        )
        doc.celery_task_id = task.id
        await db.commit()
        await db.refresh(doc)
        results.append(doc)
    return results


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    search: str = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    db: AsyncSession = Depends(get_db),
):
    docs, total = await document_service.list_documents(db, page, page_size, status, search, sort_by, sort_order)
    return DocumentListResponse(
        items=[DocumentListOut.model_validate(d) for d in docs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/documents/{doc_id}", response_model=DocumentOut)
async def get_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    return await document_service.get_document(db, doc_id)

@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    await document_service.delete_document(db, doc_id)
    return None


@router.get("/documents/{doc_id}/progress")
async def get_progress(doc_id: str):
    """Poll-based progress endpoint reading from Redis."""
    redis = await get_async_redis()
    data = await redis.hgetall(f"job_status:{doc_id}")
    if not data:
        return {"job_id": doc_id, "event": "unknown", "progress": 0, "message": "No status available"}
    return {
        "job_id": doc_id,
        "event": data.get("event", "unknown"),
        "progress": int(data.get("progress", 0)),
        "message": data.get("message", ""),
    }


@router.get("/documents/{doc_id}/stream")
async def stream_progress(doc_id: str):
    """SSE endpoint for real-time progress streaming via Redis Pub/Sub."""
    async def event_generator():
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

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.put("/documents/{doc_id}/review", response_model=DocumentOut)
async def update_review(doc_id: str, update: ReviewUpdate, db: AsyncSession = Depends(get_db)):
    return await document_service.update_reviewed_data(db, doc_id, update)


@router.post("/documents/{doc_id}/finalize", response_model=DocumentOut)
async def finalize(doc_id: str, db: AsyncSession = Depends(get_db)):
    return await document_service.finalize_document(db, doc_id)


@router.post("/documents/{doc_id}/retry", response_model=DocumentOut)
async def retry(doc_id: str, db: AsyncSession = Depends(get_db)):
    doc = await document_service.retry_document(db, doc_id)
    task = process_document_task.apply_async(
        args=[doc.id, doc.file_path, doc.original_filename, doc.file_type, doc.file_size],
    )
    doc.celery_task_id = task.id
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/documents/{doc_id}/export/{format}")
async def export_document(doc_id: str, format: str, db: AsyncSession = Depends(get_db)):
    doc = await document_service.get_document(db, doc_id)
    data = doc.reviewed_data or doc.extracted_data
    if not data:
        return JSONResponse(status_code=400, content={"detail": "No processed data to export"})

    if format == "json":
        content = json.dumps(data, indent=2)
        return StreamingResponse(
            io.StringIO(content),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{doc.original_filename}.json"'}
        )
    elif format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Field", "Value"])
        for k, v in data.items():
            writer.writerow([k, json.dumps(v) if isinstance(v, (dict, list)) else v])
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{doc.original_filename}.csv"'}
        )
    else:
        return JSONResponse(status_code=400, content={"detail": "Unsupported format. Use json or csv"})


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text
    result = await db.execute(text("""
        SELECT status, COUNT(*) as count FROM documents GROUP BY status
    """))
    rows = result.fetchall()
    return {row[0]: row[1] for row in rows}
