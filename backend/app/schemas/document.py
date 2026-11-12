from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_serializer
from app.models.document import JobStatus


class DocumentBase(BaseModel):
    filename: str
    original_filename: str
    file_size: int
    file_type: str


class DocumentCreate(DocumentBase):
    file_path: str
    mime_type: Optional[str] = None


class DocumentOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    filename: str
    original_filename: str
    file_size: int
    file_type: str
    mime_type: Optional[str] = None
    document_type: str = "auto"
    batch_id: Optional[str] = None
    ai_connection_id: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    invoice_number: Optional[str] = None
    vendor_name: Optional[str] = None
    status: JobStatus
    celery_task_id: Optional[str] = None
    progress: int
    current_stage: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int
    extracted_data: Optional[Dict[str, Any]] = None
    reviewed_data: Optional[Dict[str, Any]] = None
    is_reviewed: bool
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    @field_serializer("created_at", "updated_at", "completed_at", check_fields=False)
    def serialize_dt(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    model_config = {"from_attributes": True}


class DocumentListOut(BaseModel):
    id: str
    original_filename: str
    file_size: int
    file_type: str
    document_type: str = "auto"
    batch_id: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    invoice_number: Optional[str] = None
    vendor_name: Optional[str] = None
    status: JobStatus
    progress: int
    current_stage: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int
    is_reviewed: bool
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at", check_fields=False)
    def serialize_dt(self, dt: datetime, _info):
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    items: List[DocumentListOut]
    total: int
    page: int
    page_size: int


class ReviewUpdate(BaseModel):
    reviewed_data: Dict[str, Any]


class ReprocessRequest(BaseModel):
    connection_id: Optional[str] = None
    document_type: Optional[Literal["auto", "invoice"]] = None


class ProgressEvent(BaseModel):
    job_id: str
    event: str
    progress: int
    message: str
    data: Dict[str, Any] = Field(default_factory=dict)


class JobStatusOut(BaseModel):
    job_id: str
    event: str
    progress: int
    message: str
