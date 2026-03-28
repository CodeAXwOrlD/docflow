import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Text, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
import enum


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    FINALIZED = "finalized"
    CANCELLED = "cancelled"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    file_type: Mapped[str] = mapped_column(String(100), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=True)

    status: Mapped[JobStatus] = mapped_column(SAEnum(JobStatus), default=JobStatus.QUEUED, nullable=False)
    celery_task_id: Mapped[str] = mapped_column(String(255), nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    current_stage: Mapped[str] = mapped_column(String(100), nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    # Extracted / processed data
    extracted_data: Mapped[dict] = mapped_column(JSON, nullable=True)
    reviewed_data: Mapped[dict] = mapped_column(JSON, nullable=True)
    is_reviewed: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
