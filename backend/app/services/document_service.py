import os
import uuid
import pathlib
from typing import Optional
import aiofiles
from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.models.document import Document, JobStatus
from app.schemas.document import ReviewUpdate
from app.core.config import settings

ALLOWED_SORT_COLUMNS = {
    "created_at": Document.created_at,
    "updated_at": Document.updated_at,
    "original_filename": Document.original_filename,
    "file_size": Document.file_size,
    "file_type": Document.file_type,
    "status": Document.status,
    "progress": Document.progress,
}


def _validate_file_signature(ext: str, first_bytes: bytes) -> None:
    """Validate magic bytes / file signatures to prevent disguised executables or malformed uploads."""
    if ext == ".pdf":
        if not first_bytes.startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="Invalid PDF file format or corrupted signature.")
    elif ext in [".docx", ".xlsx"]:
        if not first_bytes.startswith(b"PK\x03\x04"):
            raise HTTPException(status_code=400, detail=f"Invalid {ext.upper()} archive header or corrupted signature.")


async def save_upload(file: UploadFile, upload_dir: str) -> tuple[str, str, str, int]:
    """Save uploaded file to disk with strict validation, signature checks, and size capping."""
    upload_dir = os.path.abspath(upload_dir)
    os.makedirs(upload_dir, exist_ok=True)

    raw_filename = file.filename or "uploaded_document"
    safe_name = pathlib.Path(raw_filename).name  # strips directory traversal '../'
    ext = pathlib.Path(safe_name).suffix.lower()

    if not ext or ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File extension '{ext}' is not permitted. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )

    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(upload_dir, unique_name)
    size = 0
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024

    try:
        first_chunk = await file.read(1024 * 64)
        if not first_chunk or len(first_chunk) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

        _validate_file_signature(ext, first_chunk)

        async with aiofiles.open(file_path, "wb") as out:
            await out.write(first_chunk)
            size += len(first_chunk)

            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_MB}MB"
                    )
                await out.write(chunk)

    except Exception:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
        raise

    return file_path, unique_name, ext, size


async def create_document(
    db: AsyncSession,
    file: UploadFile,
    user_id: Optional[str] = None,
    document_type: str = "auto",
    batch_id: Optional[str] = None,
    ai_connection_id: Optional[str] = None,
) -> Document:
    raw_filename = file.filename or "uploaded_document"
    safe_name = pathlib.Path(raw_filename).name
    file_path, unique_name, ext, size = await save_upload(file, settings.UPLOAD_DIR)

    doc = Document(
        id=str(uuid.uuid4()),
        user_id=user_id,
        filename=unique_name,
        original_filename=safe_name,
        file_path=file_path,
        file_size=size,
        file_type=ext,
        mime_type=file.content_type or "application/octet-stream",
        document_type=document_type if document_type in ("auto", "invoice") else "auto",
        batch_id=batch_id,
        ai_connection_id=ai_connection_id,
        status=JobStatus.QUEUED,
    )

    try:
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
    except Exception:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass
        raise

    return doc


async def get_document(db: AsyncSession, doc_id: str, user_id: Optional[str] = None) -> Document:
    query = select(Document).where(Document.id == doc_id)
    if user_id is not None:
        query = query.where(Document.user_id == user_id)
    result = await db.execute(query)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


async def list_documents(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    user_id: Optional[str] = None,
    batch_id: Optional[str] = None,
) -> tuple[list[Document], int]:
    query = select(Document)
    count_query = select(func.count(Document.id))

    if user_id is not None:
        query = query.where(Document.user_id == user_id)
        count_query = count_query.where(Document.user_id == user_id)

    if batch_id:
        query = query.where(Document.batch_id == batch_id)
        count_query = count_query.where(Document.batch_id == batch_id)

    if status:
        status_clean = status.lower()
        query = query.where(Document.status == status_clean)
        count_query = count_query.where(Document.status == status_clean)

    if search:
        like = f"%{search.strip()}%"
        search_filter = or_(
            Document.original_filename.ilike(like),
            Document.file_type.ilike(like),
            Document.invoice_number.ilike(like),
            Document.vendor_name.ilike(like),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    sort_col = ALLOWED_SORT_COLUMNS.get(sort_by, Document.created_at)
    order_direction = sort_order.lower() if sort_order in ("asc", "desc") else "desc"

    if order_direction == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    docs = result.scalars().all()
    return list(docs), total


async def list_documents_by_ids(
    db: AsyncSession, doc_ids: list[str], user_id: str
) -> list[Document]:
    if not doc_ids:
        return []
    result = await db.execute(
        select(Document).where(Document.id.in_(doc_ids), Document.user_id == user_id)
    )
    return list(result.scalars().all())


async def update_reviewed_data(
    db: AsyncSession, doc_id: str, update: ReviewUpdate, user_id: Optional[str] = None
) -> Document:
    doc = await get_document(db, doc_id, user_id=user_id)
    if doc.status not in [JobStatus.COMPLETED, JobStatus.FINALIZED]:
        raise HTTPException(status_code=400, detail="Document must be completed before review")
    doc.reviewed_data = update.reviewed_data
    doc.is_reviewed = True
    await db.commit()
    await db.refresh(doc)
    return doc


async def finalize_document(
    db: AsyncSession, doc_id: str, user_id: Optional[str] = None
) -> Document:
    doc = await get_document(db, doc_id, user_id=user_id)
    if not doc.is_reviewed:
        raise HTTPException(status_code=400, detail="Document must be reviewed before finalization")
    doc.status = JobStatus.FINALIZED
    await db.commit()
    await db.refresh(doc)
    return doc


async def retry_document(
    db: AsyncSession, doc_id: str, user_id: Optional[str] = None
) -> Document:
    doc = await get_document(db, doc_id, user_id=user_id)
    if doc.status != JobStatus.FAILED:
        raise HTTPException(status_code=400, detail="Only failed jobs can be retried")
    doc.status = JobStatus.QUEUED
    doc.progress = 0
    doc.current_stage = None
    doc.error_message = None
    doc.completed_at = None
    doc.retry_count += 1
    await db.commit()
    await db.refresh(doc)
    return doc


async def prepare_reprocess_document(
    db: AsyncSession,
    doc_id: str,
    user_id: str,
    connection_id: Optional[str] = None,
    document_type: Optional[str] = None,
) -> Document:
    doc = await get_document(db, doc_id, user_id=user_id)
    if doc.status in (JobStatus.QUEUED, JobStatus.PROCESSING):
        raise HTTPException(status_code=409, detail="Document is already queued or processing.")
    if connection_id is not None:
        doc.ai_connection_id = connection_id
    if document_type is not None:
        doc.document_type = document_type
    doc.status = JobStatus.QUEUED
    doc.progress = 0
    doc.current_stage = None
    doc.error_message = None
    doc.completed_at = None
    doc.is_reviewed = False
    doc.reviewed_data = None
    doc.retry_count += 1
    await db.commit()
    await db.refresh(doc)
    return doc


async def delete_document(
    db: AsyncSession, doc_id: str, user_id: Optional[str] = None
) -> None:
    doc = await get_document(db, doc_id, user_id=user_id)

    if doc.celery_task_id:
        try:
            from app.workers.celery_app import celery_app
            celery_app.control.revoke(doc.celery_task_id, terminate=True)
        except Exception:
            pass

    if doc.file_path and os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except OSError:
            pass

    await db.delete(doc)
    await db.commit()
