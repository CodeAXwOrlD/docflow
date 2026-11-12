from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class AIProviderName(str, Enum):
    GEMINI = "gemini"
    GROQ = "groq"


class ProviderErrorCategory(str, Enum):
    INVALID_KEY = "invalid_key"
    AUTH_FAILURE = "auth_failure"
    RATE_LIMIT = "rate_limit"
    QUOTA_EXHAUSTED = "quota_exhausted"
    TIMEOUT = "timeout"
    PROVIDER_OUTAGE = "provider_outage"
    INVALID_MODEL = "invalid_model"
    MALFORMED_OUTPUT = "malformed_output"
    SCHEMA_VALIDATION = "schema_validation"
    ENCRYPTION_ERROR = "encryption_error"
    UNKNOWN = "unknown"


class AIProviderError(Exception):
    """Normalized provider exception safe to surface to users without leaking secrets."""

    def __init__(
        self,
        category: ProviderErrorCategory,
        user_message: str,
        provider: Optional[str] = None,
        status_code: Optional[int] = None,
        retryable: bool = False,
    ):
        self.category = category
        self.user_message = user_message
        self.provider = provider
        self.status_code = status_code
        self.retryable = retryable
        super().__init__(user_message)


@dataclass(frozen=True)
class ModelInfo:
    id: str
    display_name: str
    provider: str
    context_window: Optional[int] = None
    supports_structured_output: bool = True
    description: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "display_name": self.display_name,
            "provider": self.provider,
            "context_window": self.context_window,
            "supports_structured_output": self.supports_structured_output,
            "description": self.description,
        }


@dataclass
class ProviderUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    rate_limit_info: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ProviderResponse:
    raw_text: str
    parsed_json: Dict[str, Any]
    provider: str
    model: str
    usage: ProviderUsage
    latency_ms: int


@dataclass
class KeyValidationResult:
    valid: bool
    status: str  # "connected" | "invalid" | "error"
    message: str
    models: List[ModelInfo] = field(default_factory=list)
    usage_info: Dict[str, Any] = field(default_factory=dict)
    error_category: Optional[ProviderErrorCategory] = None


class BaseAIProvider(ABC):
    """Provider-agnostic interface for LLM structured extraction and key verification."""

    provider_name: str

    def __init__(self, api_key: str, model: Optional[str] = None, timeout: float = 45.0):
        cleaned = (api_key or "").strip()
        if not cleaned:
            raise AIProviderError(
                category=ProviderErrorCategory.INVALID_KEY,
                user_message="API key cannot be empty.",
                provider=getattr(self, "provider_name", None),
                retryable=False,
            )
        self._api_key = cleaned
        self.model = model or self.default_model
        self.timeout = timeout

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} provider={self.provider_name} model={self.model}>"

    @property
    @abstractmethod
    def default_model(self) -> str:
        """Default model identifier for this provider."""

    @abstractmethod
    def validate_key(self, model: Optional[str] = None) -> KeyValidationResult:
        """Validate the credential (and optional model) against the provider API."""

    @abstractmethod
    def generate_structured(
        self,
        prompt: str,
        system_prompt: str,
        json_schema: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
        temperature: float = 0.0,
    ) -> ProviderResponse:
        """Execute a structured JSON generation request."""

    def extract_document_data(
        self,
        document_text: str,
        system_prompt: str,
        user_prompt: str,
        json_schema: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
    ) -> ProviderResponse:
        """Extract structured data from document text using the configured provider."""
        combined_prompt = f"{user_prompt}\n\n--- DOCUMENT TEXT START ---\n{document_text}\n--- DOCUMENT TEXT END ---"
        return self.generate_structured(
            prompt=combined_prompt,
            system_prompt=system_prompt,
            json_schema=json_schema,
            model=model,
            temperature=0.0,
        )

    @abstractmethod
    def get_supported_models(self) -> List[ModelInfo]:
        """Return curated / supported models for this provider."""

    def get_usage_info(self) -> Dict[str, Any]:
        """Return provider-reported usage or rate-limit metadata when available."""
        return {
            "provider": self.provider_name,
            "quota_api_supported": False,
            "note": "Token usage is tracked per request in DocFlow usage logs.",
        }

