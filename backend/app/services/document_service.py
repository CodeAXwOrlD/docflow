import os
import uuid
import aiofiles
from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.models.document import Document, JobStatus
from app.schemas.document import ReviewUpdate
from app.core.config import settings
import pathlib


async def save_upload(file: UploadFile, upload_dir: str) -> tuple[str, str, int]:
    """Save uploaded file to disk, return (file_path, file_ext, size)."""
    upload_dir = os.path.abspath(upload_dir)
    os.makedirs(upload_dir, exist_ok=True)
    ext = pathlib.Path(file.filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed")
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(upload_dir, unique_name)
    size = 0
    async with aiofiles.open(file_path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
                os.remove(file_path)
                raise HTTPException(status_code=413, detail="File too large")
            await out.write(chunk)
    return file_path, unique_name, ext, size


async def create_document(db: AsyncSession, file: UploadFile) -> Document:
    file_path, unique_name, ext, size = await save_upload(file, settings.UPLOAD_DIR)
    doc = Document(
        id=str(uuid.uuid4()),
        filename=unique_name,
        original_filename=file.filename,
        file_path=file_path,
        file_size=size,
        file_type=ext,
        mime_type=file.content_type,
        status=JobStatus.QUEUED,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def get_document(db: AsyncSession, doc_id: str) -> Document:
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


async def list_documents(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status: str = None,
    search: str = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> tuple[list[Document], int]:
    query = select(Document)
    count_query = select(func.count(Document.id))

    if status:
        query = query.where(Document.status == status)
        count_query = count_query.where(Document.status == status)

    if search:
        like = f"%{search}%"
        query = query.where(or_(
            Document.original_filename.ilike(like),
            Document.file_type.ilike(like),
        ))
        count_query = count_query.where(or_(
            Document.original_filename.ilike(like),
            Document.file_type.ilike(like),
        ))

    sort_col = getattr(Document, sort_by, Document.created_at)
    if sort_order == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    docs = result.scalars().all()
    return list(docs), total


async def update_reviewed_data(db: AsyncSession, doc_id: str, update: ReviewUpdate) -> Document:
    doc = await get_document(db, doc_id)
    if doc.status not in [JobStatus.COMPLETED, JobStatus.FINALIZED]:
        raise HTTPException(status_code=400, detail="Document must be completed before review")
    doc.reviewed_data = update.reviewed_data
    doc.is_reviewed = True
    await db.commit()
    await db.refresh(doc)
    return doc


async def finalize_document(db: AsyncSession, doc_id: str) -> Document:
    doc = await get_document(db, doc_id)
    if not doc.is_reviewed:
        raise HTTPException(status_code=400, detail="Document must be reviewed before finalization")
    doc.status = JobStatus.FINALIZED
    await db.commit()
    await db.refresh(doc)
    return doc


async def retry_document(db: AsyncSession, doc_id: str) -> Document:
    doc = await get_document(db, doc_id)
    if doc.status != JobStatus.FAILED:
        raise HTTPException(status_code=400, detail="Only failed jobs can be retried")
    doc.status = JobStatus.QUEUED
    doc.progress = 0
    doc.current_stage = None
    doc.error_message = None
    doc.retry_count += 1
    await db.commit()
    await db.refresh(doc)
    return doc

async def delete_document(db: AsyncSession, doc_id: str) -> None:
    doc = await get_document(db, doc_id)
    
    # 1. Revoke the Celery task
    from app.workers.celery_app import celery_app
    if doc.celery_task_id:
        celery_app.control.revoke(doc.celery_task_id, terminate=True)
        
    # 2. Delete the physical file
    if doc.file_path and os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except OSError:
            pass  # If file doesn't exist or is locked, ignore
            
    # 3. Delete from database
    await db.delete(doc)
    await db.commit()
