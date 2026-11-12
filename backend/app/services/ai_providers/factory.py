from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.security import EncryptionError, EncryptionService, get_encryption_service
from app.services.ai_providers.base import (
    AIProviderError,
    AIProviderName,
    BaseAIProvider,
    ModelInfo,
    ProviderErrorCategory,
)
from app.services.ai_providers.gemini_provider import CURATED_GEMINI_MODELS, GeminiProvider
from app.services.ai_providers.groq_provider import CURATED_GROQ_MODELS, GroqProvider


class ProviderFactory:
    """Factory that instantiates the configured AI provider adapter without leaking SDK details."""

    _REGISTRY = {
        AIProviderName.GEMINI.value: GeminiProvider,
        AIProviderName.GROQ.value: GroqProvider,
    }

    @classmethod
    def supported_providers(cls) -> List[str]:
        return list(cls._REGISTRY.keys())

    @classmethod
    def get_catalog_models(cls, provider: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
        catalog = {
            AIProviderName.GEMINI.value: [m.to_dict() for m in CURATED_GEMINI_MODELS],
            AIProviderName.GROQ.value: [m.to_dict() for m in CURATED_GROQ_MODELS],
        }
        if provider:
            key = provider.strip().lower()
            if key not in catalog:
                raise AIProviderError(
                    category=ProviderErrorCategory.UNKNOWN,
                    user_message=f"Unsupported AI provider '{provider}'.",
                    retryable=False,
                )
            return {key: catalog[key]}
        return catalog

    @classmethod
    def create_provider(
        cls,
        provider: str,
        api_key: str,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> BaseAIProvider:
        key = (provider or "").strip().lower()
        provider_cls = cls._REGISTRY.get(key)
        if not provider_cls:
            raise AIProviderError(
                category=ProviderErrorCategory.UNKNOWN,
                user_message=f"Unsupported AI provider '{provider}'. Choose 'gemini' or 'groq'.",
                retryable=False,
            )
        return provider_cls(
            api_key=api_key,
            model=model,
            timeout=timeout or settings.AI_REQUEST_TIMEOUT_SECONDS,
        )

    @classmethod
    def from_encrypted_connection(
        cls,
        connection: Any,
        encryption_service: Optional[EncryptionService] = None,
    ) -> BaseAIProvider:
        """Decrypt an AIProviderConnection's key in memory and return an initialized adapter."""
        enc = encryption_service or get_encryption_service()
        try:
            plaintext_key = enc.decrypt(connection.encrypted_api_key)
        except EncryptionError as exc:
            raise AIProviderError(
                category=ProviderErrorCategory.ENCRYPTION_ERROR,
                user_message="Failed to decrypt the configured AI API key. Please re-save your key in AI Settings.",
                provider=getattr(connection, "provider", None),
                retryable=False,
            ) from exc

        return cls.create_provider(
            provider=connection.provider,
            api_key=plaintext_key,
            model=connection.model,
        )

