from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_serializer, field_validator

ProviderLiteral = Literal["gemini", "groq"]


class AIConnectionCreate(BaseModel):
    provider: ProviderLiteral
    api_key: str = Field(..., min_length=8, max_length=512)
    model: str = Field(..., min_length=2, max_length=120)
    label: Optional[str] = Field(default=None, max_length=100)
    is_active: bool = True
    is_default: bool = False
    test_before_save: bool = True

    @field_validator("api_key", "model")
    @classmethod
    def strip_required(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Value cannot be blank.")
        return cleaned


class AIConnectionUpdate(BaseModel):
    api_key: Optional[str] = Field(default=None, min_length=8, max_length=512)
    model: Optional[str] = Field(default=None, min_length=2, max_length=120)
    label: Optional[str] = Field(default=None, max_length=100)
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None

    @field_validator("api_key", "model")
    @classmethod
    def strip_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Value cannot be blank.")
        return cleaned


class AIConnectionTestRequest(BaseModel):
    connection_id: Optional[str] = None
    provider: Optional[ProviderLiteral] = None
    api_key: Optional[str] = Field(default=None, min_length=8, max_length=512)
    model: Optional[str] = Field(default=None, min_length=2, max_length=120)


class AIConnectionOut(BaseModel):
    id: str
    provider: str
    label: Optional[str] = None
    masked_api_key: str
    key_last_four: str
    model: str
    is_active: bool
    is_default: bool
    connection_status: str
    last_tested_at: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at", "last_tested_at", check_fields=False)
    def serialize_dt(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()


class AIConnectionTestResponse(BaseModel):
    valid: bool
    status: str
    message: str
    provider: str
    model: Optional[str] = None
    error_category: Optional[str] = None
    usage_info: Dict[str, Any] = Field(default_factory=dict)
    connection: Optional[AIConnectionOut] = None


class AIModelOut(BaseModel):
    id: str
    display_name: str
    provider: str
    context_window: Optional[int] = None
    supports_structured_output: bool = True
    description: str = ""


class AIUsageLogOut(BaseModel):
    id: str
    connection_id: Optional[str] = None
    document_id: Optional[str] = None
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    processing_duration: float
    status: str
    error_category: Optional[str] = None
    created_at: datetime

    @field_serializer("created_at", check_fields=False)
    def serialize_dt(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    model_config = {"from_attributes": True}


class AIUsageProviderSummary(BaseModel):
    provider: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    avg_duration_seconds: float


class AIUsageResponse(BaseModel):
    totals: Dict[str, Any]
    by_provider: List[AIUsageProviderSummary]
    recent_logs: List[AIUsageLogOut]

