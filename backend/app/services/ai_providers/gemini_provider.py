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

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

CURATED_GEMINI_MODELS: List[ModelInfo] = [
    ModelInfo(
        id="gemini-2.5-flash",
        display_name="Gemini 2.5 Flash",
        provider=AIProviderName.GEMINI.value,
        context_window=1048576,
        supports_structured_output=True,
        description="Fast, cost-efficient multimodal & structured extraction model.",
    ),
    ModelInfo(
        id="gemini-2.5-flash-lite",
        display_name="Gemini 2.5 Flash-Lite",
        provider=AIProviderName.GEMINI.value,
        context_window=1048576,
        supports_structured_output=True,
        description="Ultra-low-latency model for high-volume invoice batches.",
    ),
    ModelInfo(
        id="gemini-2.5-pro",
        display_name="Gemini 2.5 Pro",
        provider=AIProviderName.GEMINI.value,
        context_window=1048576,
        supports_structured_output=True,
        description="Highest reasoning accuracy for complex multi-page tax invoices.",
    ),
    ModelInfo(
        id="gemini-2.0-flash",
        display_name="Gemini 2.0 Flash",
        provider=AIProviderName.GEMINI.value,
        context_window=1048576,
        supports_structured_output=True,
        description="Balanced general-purpose structured JSON model.",
    ),
]


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


class GeminiProvider(BaseAIProvider):
    """Google Gemini REST API adapter isolated from document-processing logic."""

    provider_name = AIProviderName.GEMINI.value

    def __init__(self, api_key: str, model: Optional[str] = None, timeout: float = 45.0):
        super().__init__(api_key=api_key, model=model, timeout=timeout)
        self._last_usage_info: Dict[str, Any] = {
            "provider": self.provider_name,
            "quota_api_supported": False,
            "note": "Gemini bills per token in Google AI Studio; per-request token counts are logged in DocFlow.",
        }

    @property
    def default_model(self) -> str:
        return "gemini-2.5-flash"

    def get_supported_models(self) -> List[ModelInfo]:
        return list(CURATED_GEMINI_MODELS)

    def get_usage_info(self) -> Dict[str, Any]:
        return dict(self._last_usage_info)

    def _headers(self) -> Dict[str, str]:
        return {
            "Content-Type": "application/json",
            "x-goog-api-key": self._api_key,
        }

    def _map_http_error(self, response: httpx.Response, model: Optional[str] = None) -> AIProviderError:
        status_code = response.status_code
        detail = ""
        err_status = ""
        try:
            body = response.json()
            err = body.get("error", {}) if isinstance(body, dict) else {}
            detail = str(err.get("message", ""))
            err_status = str(err.get("status", ""))
        except Exception:
            detail = ""

        detail_lower = detail.lower()
        if status_code == 400 and ("api key" in detail_lower or "api_key_invalid" in detail_lower):
            return AIProviderError(
                category=ProviderErrorCategory.INVALID_KEY,
                user_message="Gemini rejected the API key. Check that your key is valid and active.",
                provider=self.provider_name,
                status_code=status_code,
                retryable=False,
            )
        if status_code in (401, 403):
            cat = (
                ProviderErrorCategory.INVALID_KEY
                if "key" in detail_lower
                else ProviderErrorCategory.AUTH_FAILURE
            )
            return AIProviderError(
                category=cat,
                user_message="Gemini authentication failed. Verify your API key permissions in Google AI Studio.",
                provider=self.provider_name,
                status_code=status_code,
                retryable=False,
            )
        if status_code == 404 or "not found" in detail_lower or "not supported" in detail_lower:
            return AIProviderError(
                category=ProviderErrorCategory.INVALID_MODEL,
                user_message=f"Selected Gemini model '{model or self.model}' is unavailable or unsupported.",
                provider=self.provider_name,
                status_code=status_code,
                retryable=False,
            )
        if status_code == 429 or err_status == "RESOURCE_EXHAUSTED":
            if "quota" in detail_lower or "billing" in detail_lower or "exceeded your current quota" in detail_lower:
                return AIProviderError(
                    category=ProviderErrorCategory.QUOTA_EXHAUSTED,
                    user_message="Gemini API quota exhausted for this key. Check your Google AI Studio quota or billing.",
                    provider=self.provider_name,
                    status_code=status_code,
                    retryable=False,
                )
            return AIProviderError(
                category=ProviderErrorCategory.RATE_LIMIT,
                user_message="Gemini rate limit reached. Processing will retry shortly.",
                provider=self.provider_name,
                status_code=status_code,
                retryable=True,
            )
        if status_code in (500, 502, 503, 504):
            return AIProviderError(
                category=ProviderErrorCategory.PROVIDER_OUTAGE,
                user_message="Gemini service is temporarily unavailable. Please retry shortly.",
                provider=self.provider_name,
                status_code=status_code,
                retryable=True,
            )
        return AIProviderError(
            category=ProviderErrorCategory.UNKNOWN,
            user_message=f"Gemini request failed (HTTP {status_code}).",
            provider=self.provider_name,
            status_code=status_code,
            retryable=False,
        )

    def validate_key(self, model: Optional[str] = None) -> KeyValidationResult:
        target_model = (model or self.model).strip()
        try:
            with httpx.Client(timeout=min(self.timeout, 15.0)) as client:
                resp = client.get(f"{GEMINI_API_BASE}/models", headers={"x-goog-api-key": self._api_key})
        except httpx.TimeoutException:
            return KeyValidationResult(
                valid=False,
                status="error",
                message="Timed out connecting to Gemini API.",
                error_category=ProviderErrorCategory.TIMEOUT,
            )
        except httpx.HTTPError:
            return KeyValidationResult(
                valid=False,
                status="error",
                message="Network error reaching Gemini API.",
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
        remote_models = payload.get("models", []) if isinstance(payload, dict) else []
        available_ids = {
            str(m.get("name", "")).removeprefix("models/")
            for m in remote_models
            if isinstance(m, dict) and "generateContent" in (m.get("supportedGenerationMethods") or [])
        }

        curated = self.get_supported_models()
        curated_ids = {m.id for m in curated}
        if available_ids:
            filtered = [m for m in curated if m.id in available_ids]
            # Include any extra gemini generateContent models discovered dynamically
            for mid in sorted(available_ids - curated_ids):
                if mid.startswith("gemini-"):
                    filtered.append(
                        ModelInfo(
                            id=mid,
                            display_name=mid,
                            provider=self.provider_name,
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
                message=f"API key is valid, but model '{target_model}' is not available for this key.",
                models=models_out,
                error_category=ProviderErrorCategory.INVALID_MODEL,
            )

        usage_info = {
            "provider": self.provider_name,
            "available_models_count": len(models_out),
            "quota_api_supported": False,
            "note": "Gemini API verified. Per-request token usage is tracked in DocFlow logs.",
        }
        self._last_usage_info = usage_info
        return KeyValidationResult(
            valid=True,
            status="connected",
            message="Gemini API key verified successfully.",
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
        url = f"{GEMINI_API_BASE}/models/{target_model}:generateContent"

        generation_config: Dict[str, Any] = {
            "temperature": temperature,
            "responseMimeType": "application/json",
        }
        if json_schema:
            generation_config["responseJsonSchema"] = json_schema

        body: Dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": generation_config,
        }

        start = time.monotonic()
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(url, headers=self._headers(), json=body)
        except httpx.TimeoutException as exc:
            raise AIProviderError(
                category=ProviderErrorCategory.TIMEOUT,
                user_message="Gemini API request timed out while analyzing the document.",
                provider=self.provider_name,
                retryable=True,
            ) from exc
        except httpx.HTTPError as exc:
            raise AIProviderError(
                category=ProviderErrorCategory.PROVIDER_OUTAGE,
                user_message="Unable to reach Gemini API due to a network error.",
                provider=self.provider_name,
                retryable=True,
            ) from exc

        latency_ms = int((time.monotonic() - start) * 1000)

        # Fallback: if Gemini rejects responseJsonSchema syntax for a specific schema, retry once with responseMimeType=application/json only
        if resp.status_code == 400 and json_schema is not None:
            try:
                err_msg = str(resp.json().get("error", {}).get("message", "")).lower()
            except Exception:
                err_msg = ""
            if "schema" in err_msg:
                body["generationConfig"] = {"temperature": temperature, "responseMimeType": "application/json"}
                try:
                    with httpx.Client(timeout=self.timeout) as client:
                        resp = client.post(url, headers=self._headers(), json=body)
                except httpx.TimeoutException as exc:
                    raise AIProviderError(
                        category=ProviderErrorCategory.TIMEOUT,
                        user_message="Gemini API request timed out.",
                        provider=self.provider_name,
                        retryable=True,
                    ) from exc

        if resp.status_code != 200:
            raise self._map_http_error(resp, target_model)

        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise AIProviderError(
                category=ProviderErrorCategory.MALFORMED_OUTPUT,
                user_message="Gemini returned no candidates for this document.",
                provider=self.provider_name,
                retryable=False,
            )

        parts = candidates[0].get("content", {}).get("parts", [])
        raw_text = "".join(str(p.get("text", "")) for p in parts if isinstance(p, dict)).strip()
        if not raw_text:
            raise AIProviderError(
                category=ProviderErrorCategory.MALFORMED_OUTPUT,
                user_message="Gemini returned an empty response.",
                provider=self.provider_name,
                retryable=False,
            )

        cleaned_text = _strip_code_fences(raw_text)
        try:
            parsed = json.loads(cleaned_text)
        except json.JSONDecodeError as exc:
            raise AIProviderError(
                category=ProviderErrorCategory.MALFORMED_OUTPUT,
                user_message="Gemini output was not valid JSON.",
                provider=self.provider_name,
                retryable=False,
            ) from exc

        if not isinstance(parsed, dict):
            raise AIProviderError(
                category=ProviderErrorCategory.MALFORMED_OUTPUT,
                user_message="Gemini output JSON must be an object.",
                provider=self.provider_name,
                retryable=False,
            )

        usage_meta = data.get("usageMetadata") or {}
        input_tokens = int(usage_meta.get("promptTokenCount") or 0)
        output_tokens = int(usage_meta.get("candidatesTokenCount") or 0)
        total_tokens = int(usage_meta.get("totalTokenCount") or (input_tokens + output_tokens))

        return ProviderResponse(
            raw_text=cleaned_text,
            parsed_json=parsed,
            provider=self.provider_name,
            model=target_model,
            usage=ProviderUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
            ),
            latency_ms=latency_ms,
        )

