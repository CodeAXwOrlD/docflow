from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
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
    filename: str
    original_filename: str
    file_size: int
    file_type: str
    mime_type: Optional[str] = None
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

    model_config = {"from_attributes": True}


class DocumentListOut(BaseModel):
    id: str
    original_filename: str
    file_size: int
    file_type: str
    status: JobStatus
    progress: int
    current_stage: Optional[str] = None
    retry_count: int
    is_reviewed: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    items: List[DocumentListOut]
    total: int
    page: int
    page_size: int


class ReviewUpdate(BaseModel):
    reviewed_data: Dict[str, Any]


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
