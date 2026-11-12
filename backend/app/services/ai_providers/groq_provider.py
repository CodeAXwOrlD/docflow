import json
import time
from typing import Any, Dict, List, Optional
import httpx

from app.services.ai_providers.base import (
    AIProviderError,
    AIProviderName,
    BaseAIProvider,
    KeyValidationResult,
    ModelInfo,
    ProviderErrorCategory,
    ProviderResponse,
    ProviderUsage,
)

GROQ_API_BASE = "https://api.groq.com/openai/v1"

CURATED_GROQ_MODELS: List[ModelInfo] = [
    ModelInfo(
        id="llama-3.3-70b-versatile",
        display_name="Llama 3.3 70B Versatile",
        provider=AIProviderName.GROQ.value,
        context_window=131072,
        supports_structured_output=True,
        description="High-accuracy 70B model on Groq LPU for structured invoice extraction.",
    ),
    ModelInfo(
        id="llama-3.1-8b-instant",
        display_name="Llama 3.1 8B Instant",
        provider=AIProviderName.GROQ.value,
        context_window=131072,
        supports_structured_output=True,
        description="Ultra-fast 8B model optimized for rapid batch processing.",
    ),
    ModelInfo(
        id="meta-llama/llama-4-scout-17b-16e-instruct",
        display_name="Llama 4 Scout 17B",
        provider=AIProviderName.GROQ.value,
        context_window=131072,
        supports_structured_output=True,
        description="Compact mixture-of-experts model with strong JSON adherence.",
    ),
    ModelInfo(
        id="qwen/qwen3-32b",
        display_name="Qwen 3 32B",
        provider=AIProviderName.GROQ.value,
        context_window=131072,
        supports_structured_output=True,
        description="Strong multilingual and numerical reasoning for invoices.",
    ),
]


def _extract_ratelimit_headers(headers: httpx.Headers) -> Dict[str, Any]:
    rate_info: Dict[str, Any] = {}
    for key in (
        "x-ratelimit-limit-requests",
        "x-ratelimit-remaining-requests",
        "x-ratelimit-reset-requests",
        "x-ratelimit-limit-tokens",
        "x-ratelimit-remaining-tokens",
        "x-ratelimit-reset-tokens",
    ):
        val = headers.get(key)
        if val is not None:
            rate_info[key] = val
    return rate_info


def _strip_code_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


class GroqProvider(BaseAIProvider):
    """Groq Cloud OpenAI-compatible REST adapter isolated from business logic."""

    provider_name = AIProviderName.GROQ.value

    def __init__(self, api_key: str, model: Optional[str] = None, timeout: float = 45.0):
        super().__init__(api_key=api_key, model=model, timeout=timeout)
        self._last_usage_info: Dict[str, Any] = {
            "provider": self.provider_name,
            "quota_api_supported": True,
            "rate_limits": {},
        }

    @property
    def default_model(self) -> str:
        return "llama-3.3-70b-versatile"

    def get_supported_models(self) -> List[ModelInfo]:
        return list(CURATED_GROQ_MODELS)

    def get_usage_info(self) -> Dict[str, Any]:
        return dict(self._last_usage_info)

    def _headers(self) -> Dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
        }

    def _map_http_error(self, response: httpx.Response, model: Optional[str] = None) -> AIProviderError:
        status_code = response.status_code
        detail = ""
        err_code = ""
        try:
            body = response.json()
            err = body.get("error", {}) if isinstance(body, dict) else {}
            detail = str(err.get("message", ""))
            err_code = str(err.get("code", ""))
        except Exception:
            detail = ""

        detail_lower = detail.lower()
        if status_code == 401 or err_code == "invalid_api_key":
            return AIProviderError(
                category=ProviderErrorCategory.INVALID_KEY,
                user_message="Groq rejected the API key. Check that your key is valid and active.",
                provider=self.provider_name,
                status_code=status_code,
                retryable=False,
            )
        if status_code == 403:
            return AIProviderError(
                category=ProviderErrorCategory.AUTH_FAILURE,
                user_message="Groq authentication failed or access is restricted for this key.",
                provider=self.provider_name,
                status_code=status_code,
                retryable=False,
            )
        if status_code == 404 or err_code == "model_not_found" or "model" in detail_lower and "not found" in detail_lower:
            return AIProviderError(
                category=ProviderErrorCategory.INVALID_MODEL,
                user_message=f"Selected Groq model '{model or self.model}' is unavailable or decommissioned.",
                provider=self.provider_name,
                status_code=status_code,
                retryable=False,
            )
        if status_code == 429:
            if err_code == "insufficient_quota" or "quota" in detail_lower or "billing" in detail_lower:
                return AIProviderError(
                    category=ProviderErrorCategory.QUOTA_EXHAUSTED,
                    user_message="Groq quota exhausted for this API key. Review your Groq Console limits.",
                    provider=self.provider_name,
                    status_code=status_code,
                    retryable=False,
                )
            return AIProviderError(
                category=ProviderErrorCategory.RATE_LIMIT,
                user_message="Groq rate limit reached. Processing will retry shortly.",
                provider=self.provider_name,
                status_code=status_code,
                retryable=True,
            )
        if status_code in (500, 502, 503, 504):
            return AIProviderError(
                category=ProviderErrorCategory.PROVIDER_OUTAGE,
                user_message="Groq service is temporarily unavailable. Please retry shortly.",
                provider=self.provider_name,
                status_code=status_code,
                retryable=True,
            )
        return AIProviderError(
            category=ProviderErrorCategory.UNKNOWN,
            user_message=f"Groq request failed (HTTP {status_code}).",
            provider=self.provider_name,
            status_code=status_code,
            retryable=False,
        )

    def validate_key(self, model: Optional[str] = None) -> KeyValidationResult:
        target_model = (model or self.model).strip()
        try:
            with httpx.Client(timeout=min(self.timeout, 15.0)) as client:
                resp = client.get(f"{GROQ_API_BASE}/models", headers={"Authorization": f"Bearer {self._api_key}"})
        except httpx.TimeoutException:
            return KeyValidationResult(
                valid=False,
                status="error",
                message="Timed out connecting to Groq API.",
                error_category=ProviderErrorCategory.TIMEOUT,
            )
        except httpx.HTTPError:
            return KeyValidationResult(
                valid=False,
                status="error",
                message="Network error reaching Groq API.",
                error_category=ProviderErrorCategory.PROVIDER_OUTAGE,
            )

        if resp.status_code != 200:
            mapped = self._map_http_error(resp, target_model)
            return KeyValidationResult(
                valid=False,
                status="invalid" if mapped.category in (ProviderErrorCategory.INVALID_KEY, ProviderErrorCategory.AUTH_FAILURE) else "error",
                message=mapped.user_message,
                error_category=mapped.category,
            )

        payload = resp.json() if resp.content else {}
        remote_models = payload.get("data", []) if isinstance(payload, dict) else []
        available_ids = {
            str(m.get("id", ""))
            for m in remote_models
            if isinstance(m, dict) and m.get("active", True) and not str(m.get("id", "")).startswith("whisper")
        }

        curated = self.get_supported_models()
        curated_ids = {m.id for m in curated}
        if available_ids:
            filtered = [m for m in curated if m.id in available_ids]
            for m in remote_models:
                mid = str(m.get("id", ""))
                if mid and mid in available_ids and mid not in curated_ids:
                    filtered.append(
                        ModelInfo(
                            id=mid,
                            display_name=mid,
                            provider=self.provider_name,
                            context_window=m.get("context_window"),
                            supports_structured_output=True,
                        )
                    )
            models_out = filtered or curated
        else:
            models_out = curated

        if target_model and available_ids and target_model not in available_ids:
            return KeyValidationResult(
                valid=False,
                status="error",
                message=f"API key is valid, but model '{target_model}' is not available on Groq.",
                models=models_out,
                error_category=ProviderErrorCategory.INVALID_MODEL,
            )

        rate_limits = _extract_ratelimit_headers(resp.headers)
        usage_info = {
            "provider": self.provider_name,
            "available_models_count": len(models_out),
            "quota_api_supported": bool(rate_limits),
            "rate_limits": rate_limits,
            "note": "Groq API verified. Live rate-limit headers & token usage are tracked.",
        }
        self._last_usage_info = usage_info
        return KeyValidationResult(
            valid=True,
            status="connected",
            message="Groq API key verified successfully.",
            models=models_out,
            usage_info=usage_info,
        )

    def generate_structured(
        self,
        prompt: str,
        system_prompt: str,
        json_schema: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
        temperature: float = 0.0,
    ) -> ProviderResponse:
        target_model = (model or self.model).strip() or self.default_model
        url = f"{GROQ_API_BASE}/chat/completions"

        schema_instruction = ""
        if json_schema:
            schema_instruction = (
                "\n\nReturn ONLY a valid JSON object strictly conforming to this JSON Schema:\n"
                + json.dumps(json_schema)
            )

        body: Dict[str, Any] = {
            "model": target_model,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": f"{system_prompt}{schema_instruction}"},
                {"role": "user", "content": prompt},
            ],
        }

        start = time.monotonic()
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(url, headers=self._headers(), json=body)
        except httpx.TimeoutException as exc:
            raise AIProviderError(
                category=ProviderErrorCategory.TIMEOUT,
                user_message="Groq API request timed out while analyzing the document.",
                provider=self.provider_name,
                retryable=True,
            ) from exc
        except httpx.HTTPError as exc:
            raise AIProviderError(
                category=ProviderErrorCategory.PROVIDER_OUTAGE,
                user_message="Unable to reach Groq API due to a network error.",
                provider=self.provider_name,
                retryable=True,
            ) from exc

        latency_ms = int((time.monotonic() - start) * 1000)

        if resp.status_code != 200:
            raise self._map_http_error(resp, target_model)

        rate_limits = _extract_ratelimit_headers(resp.headers)
        if rate_limits:
            self._last_usage_info["rate_limits"] = rate_limits

        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            raise AIProviderError(
                category=ProviderErrorCategory.MALFORMED_OUTPUT,
                user_message="Groq returned no completion choices.",
                provider=self.provider_name,
                retryable=False,
            )

        raw_text = str(choices[0].get("message", {}).get("content", "")).strip()
        if not raw_text:
            raise AIProviderError(
                category=ProviderErrorCategory.MALFORMED_OUTPUT,
                user_message="Groq returned an empty response.",
                provider=self.provider_name,
                retryable=False,
            )

        cleaned_text = _strip_code_fences(raw_text)
        try:
            parsed = json.loads(cleaned_text)
        except json.JSONDecodeError as exc:
            raise AIProviderError(
                category=ProviderErrorCategory.MALFORMED_OUTPUT,
                user_message="Groq output was not valid JSON.",
                provider=self.provider_name,
                retryable=False,
            ) from exc

        if not isinstance(parsed, dict):
            raise AIProviderError(
                category=ProviderErrorCategory.MALFORMED_OUTPUT,
                user_message="Groq output JSON must be an object.",
                provider=self.provider_name,
                retryable=False,
            )

        usage_meta = data.get("usage") or {}
        input_tokens = int(usage_meta.get("prompt_tokens") or 0)
        output_tokens = int(usage_meta.get("completion_tokens") or 0)
        total_tokens = int(usage_meta.get("total_tokens") or (input_tokens + output_tokens))

        return ProviderResponse(
            raw_text=cleaned_text,
            parsed_json=parsed,
            provider=self.provider_name,
            model=target_model,
            usage=ProviderUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                rate_limit_info=rate_limits,
            ),
            latency_ms=latency_ms,
        )

