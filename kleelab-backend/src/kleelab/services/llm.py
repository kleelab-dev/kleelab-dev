"""Language model access.

One module knows how to talk to the model. Everything else — the prompts, the
validation, the section kit — is written against this interface, so changing
provider is a change here plus a config value rather than a rewrite.

Both supported providers speak the OpenAI chat-completions dialect, so a provider
is four values and the loop below is identical for each. A task names the
providers it prefers in order, and a pass whose preferred provider is missing or
unreachable falls back to the next rather than failing. One key is enough to run
the whole builder.

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
    "Provider",
    "available",
    "complete_json",
    "configured_providers",
    "preferred_model",
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
    # Defaulted so a test written before providers existed still constructs one.
    provider: str = ""
    task: str = ""


@dataclass(frozen=True)
class Provider:
    """One chat-completions endpoint, with the credential and model for it."""

    name: str
    base_url: str
    api_key: str
    model: str


DEFAULT_TASK = "default"

# Which provider each pass prefers, best first. An unknown task falls to
# "default", and "default" is DeepSeek-first so that a caller naming no task
# behaves exactly as this module did before it had more than one provider.
_TASK_PREFERENCES: dict[str, tuple[str, ...]] = {
    "default": ("deepseek", "gemini"),
    "brief": ("deepseek", "gemini"),
    # Whole-page judgements that benefit from reasoning: which direction, and how
    # the page is actually put together.
    "design": ("gemini", "deepseek"),
    "compose": ("gemini", "deepseek"),
    # Volume prose and small surgical edits, where DeepSeek is proven.
    "content": ("deepseek", "gemini"),
    "edit": ("deepseek", "gemini"),
}


def _providers() -> dict[str, Provider]:
    """The providers holding a credential, in declaration order.

    Built per call rather than cached at import: settings come from the
    environment, and a cached registry would make a test that sets a key unable
    to observe it.
    """

    found: dict[str, Provider] = {}
    if settings.DEEPSEEK_API_KEY:
        found["deepseek"] = Provider(
            name="deepseek",
            base_url=settings.DEEPSEEK_BASE_URL,
            api_key=settings.DEEPSEEK_API_KEY,
            model=settings.DEEPSEEK_MODEL,
        )
    if settings.GEMINI_API_KEY:
        found["gemini"] = Provider(
            name="gemini",
            base_url=settings.GEMINI_BASE_URL,
            api_key=settings.GEMINI_API_KEY,
            model=settings.GEMINI_MODEL,
        )
    return found


def configured_providers() -> tuple[str, ...]:
    """Names of the providers holding a credential.

    Read by the boot log and the status endpoint so that "switched off", "no
    key" and "running on one provider instead of two" are distinguishable without
    guessing which one happened.
    """

    return tuple(_providers())


def available() -> bool:
    """Whether a call could be attempted at all.

    Read by the API so the interface can say "not switched on" instead of
    offering a button that fails. Exposed rather than inferred from an exception
    because the frontend should be able to decide *before* the customer commits
    to a prompt.
    """

    return bool(settings.AI_ENABLED and _providers())


def _require_configured() -> None:
    if not settings.AI_ENABLED:
        raise LLMNotConfigured("The AI builder is switched off.")
    if not _providers():
        raise LLMNotConfigured("No AI provider credential is configured.")


def _provider_chain(task: str) -> list[Provider]:
    """Providers to try for this task, best first.

    The final `or` is the safety net: a task whose preference names only providers
    we hold no key for is still served by whatever is configured, rather than
    failing with a message about a provider nobody asked for.
    """

    configured = _providers()
    preference = _TASK_PREFERENCES.get(task, _TASK_PREFERENCES[DEFAULT_TASK])
    chain = [configured[name] for name in preference if name in configured]
    return chain or list(configured.values())


def preferred_model(task: str = DEFAULT_TASK) -> str:
    """The model a pass will try first, or "" if no provider is configured.

    Used to label a *failed* generation, where there is no result to take a model
    name from. Naming a hardcoded provider there would put a model in the ledger
    that was never called.
    """

    chain = _provider_chain(task)
    return chain[0].model if chain else ""


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


async def _call(
    provider: Provider,
    *,
    system: str,
    user: str,
    max_tokens: int | None,
    temperature: float,
    task: str,
    attempts: int,
) -> LLMResult:
    """One provider's turn, retried `attempts` times on a malformed answer.

    A transport error is not retried here: if the provider is unreachable, a second
    attempt doubles the wait to produce the same result. Falling through to a
    different provider is what `complete_json` does about that instead.
    """

    payload = {
        "model": provider.model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        # Both providers use the word "json" appearing in the prompt as the signal
        # for this mode, and both callers' prompts say so explicitly. Gemini's
        # compatibility layer does not promise JSON mode on every version, which is
        # why `_extract_json` also tolerates a fenced block.
        "response_format": {"type": "json_object"},
        "temperature": temperature,
        "max_tokens": max_tokens or settings.AI_MAX_OUTPUT_TOKENS,
    }

    url = f"{provider.base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {provider.api_key}",
        "Content-Type": "application/json",
    }

    last_error: LLMRefused | None = None
    for attempt in range(1, attempts + 1):
        try:
            async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
                response = await client.post(url, json=payload, headers=headers)
        except httpx.HTTPError as error:
            # No key or prompt content in the log line: it is a credential, and
            # the prompt can contain whatever the customer typed.
            logger.exception("%s unreachable for task %r", provider.name, task)
            raise LLMError("We could not reach the AI builder. Please try again.") from error

        if response.status_code >= 400:
            logger.error("%s returned %s for task %r", provider.name, response.status_code, task)
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
            logger.warning(
                "AI answer was not valid JSON (attempt %s on %s)", attempt, provider.name
            )
            continue

        return LLMResult(
            data=data,
            model=str(body.get("model") or provider.model),
            tokens_in=int(usage.get("prompt_tokens") or 0),
            tokens_out=int(usage.get("completion_tokens") or 0),
            provider=provider.name,
            task=task,
        )

    raise last_error or LLMRefused("The model did not return valid JSON.")


async def complete_json(
    *,
    system: str,
    user: str,
    max_tokens: int | None = None,
    task: str = DEFAULT_TASK,
    temperature: float = 0.7,
) -> LLMResult:
    """Ask the best-placed provider for a single JSON object.

    A task names its preferred providers in order and they are tried in turn, so a
    pass does not fail merely because one credential is missing or one host is
    having a bad minute.

    The total number of requests is bounded at two, either way: one call per
    provider when two are configured, or two calls to the same provider when only
    one is — which is exactly the retry this function performed before it could
    choose. A malformed answer is retried, because truncation or a stray character
    is usually transient and discarding a generation the customer has already
    waited for is the worst outcome available. A transport error is retried too,
    but by the *other* provider.

    Raises:
        LLMNotConfigured: switched off, or no key for any provider.
        LLMRefused: every provider attempted answered with something unusable.
        LLMError: no provider could be reached.
    """

    _require_configured()
    chain = _provider_chain(task)
    attempts = 2 if len(chain) == 1 else 1
    last_error: LLMError | None = None

    for index, provider in enumerate(chain):
        if index:
            logger.warning(
                "AI pass %r falling back to %s (from %s)",
                task,
                provider.name,
                chain[0].name,
            )
        try:
            return await _call(
                provider,
                system=system,
                user=user,
                max_tokens=max_tokens,
                temperature=temperature,
                task=task,
                attempts=attempts,
            )
        except LLMError as error:
            # Deliberately the base class: a refusal means this model could not
            # produce usable JSON, which is the case another model may handle. The
            # retry budget above keeps the worst case at two requests.
            last_error = error
            logger.warning("AI pass %r failed on %s", task, provider.name)

    raise last_error or LLMNotConfigured("No AI provider is configured.")
