"""Language model access.

One module knows how to talk to the model. Everything else — the prompts, the
validation, the section kit — is written against this interface, so changing
provider is a change here plus a config value rather than a rewrite.

Two deliberate constraints:

* **JSON mode only.** Both endpoints ask for a single JSON object and parse it.
  Free-form prose would need parsing, and parsing model prose is how a feature
  becomes unreliable.
* **Untrusted by default.** A model's answer is data from the internet: it may be
  malformed, truncated, or contain an instruction someone smuggled in through the
  prompt. It is validated against a schema before anything acts on it, and a
  failure degrades to a clear error rather than a half-built site.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import httpx

from kleelab.core.config import settings

__all__ = [
    "LLMError",
    "LLMNotConfigured",
    "LLMRefused",
    "LLMResult",
    "available",
    "complete_json",
]

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """Base class for anything that stops a generation."""


class LLMNotConfigured(LLMError):
    """No key, or the feature is switched off. Callers answer 503."""


class LLMRefused(LLMError):
    """The model answered, but not with something usable."""


@dataclass(frozen=True)
class LLMResult:
    """A parsed answer, with what it cost."""

    data: object
    model: str
    tokens_in: int
    tokens_out: int


def available() -> bool:
    """Whether a call could be attempted at all.

    Read by the API so the interface can say "not switched on" instead of
    offering a button that fails. Exposed rather than inferred from an exception
    because the frontend should be able to decide *before* the customer commits
    to a prompt.
    """

    return bool(settings.AI_ENABLED and settings.DEEPSEEK_API_KEY)


def _require_configured() -> None:
    if not settings.AI_ENABLED:
        raise LLMNotConfigured("The AI builder is switched off.")
    if not settings.DEEPSEEK_API_KEY:
        raise LLMNotConfigured("No AI provider credential is configured.")


def _extract_json(text: str) -> object:
    """Parse the model's answer, tolerating a fenced code block.

    JSON mode should return bare JSON, but models occasionally wrap it in
    ``` fences anyway. Stripping them is cheaper than discarding a good answer.
    """

    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = candidate.split("\n", 1)[-1] if "\n" in candidate else candidate
        candidate = candidate.rsplit("```", 1)[0].strip()
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as error:
        raise LLMRefused(f"The model did not return valid JSON: {error.msg}") from error


async def complete_json(
    *,
    system: str,
    user: str,
    max_tokens: int | None = None,
) -> LLMResult:
    """Ask the model for a single JSON object.

    Retried once on a JSON failure, because a malformed answer is usually
    transient — truncation or a stray character — and discarding a generation the
    customer has already waited for is the worst outcome available. A transport
    error is *not* retried: if the provider is unreachable, a second attempt
    doubles the wait to produce the same result.

    Raises:
        LLMNotConfigured: switched off, or no key.
        LLMRefused: the provider answered with something unusable, twice.
        LLMError: the provider could not be reached.
    """

    _require_configured()
    payload = {
        "model": settings.DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        # DeepSeek requires the word "json" to appear in the prompt to use this
        # mode; both callers' prompts say so explicitly.
        "response_format": {"type": "json_object"},
        "temperature": 0.7,
        "max_tokens": max_tokens or settings.AI_MAX_OUTPUT_TOKENS,
    }

    url = f"{settings.DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }

    last_error: LLMRefused | None = None
    for attempt in (1, 2):
        try:
            async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
                response = await client.post(url, json=payload, headers=headers)
        except httpx.HTTPError as error:
            # No key or prompt content in the log line: it is a credential, and
            # the prompt can contain whatever the customer typed.
            logger.exception("AI provider unreachable")
            raise LLMError("We could not reach the AI builder. Please try again.") from error

        if response.status_code >= 400:
            logger.error("AI provider returned %s", response.status_code)
            raise LLMError("The AI builder is unavailable right now. Please try again.")

        body = response.json()
        try:
            content = body["choices"][0]["message"]["content"]
            usage = body.get("usage") or {}
        except (KeyError, IndexError, TypeError) as error:
            raise LLMRefused("The model returned an unexpected response shape.") from error

        try:
            data = _extract_json(content)
        except LLMRefused as error:
            last_error = error
            logger.warning("AI answer was not valid JSON (attempt %s)", attempt)
            continue

        return LLMResult(
            data=data,
            model=str(body.get("model") or settings.DEEPSEEK_MODEL),
            tokens_in=int(usage.get("prompt_tokens") or 0),
            tokens_out=int(usage.get("completion_tokens") or 0),
        )

    raise last_error or LLMRefused("The model did not return valid JSON.")
