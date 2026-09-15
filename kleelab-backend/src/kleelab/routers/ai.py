"""AI site builder.

Three small endpoints rather than one long one, deliberately. A single call that
briefs, writes and assembles takes half a minute, gives the customer no feedback,
and loses everything if the connection drops. Splitting it means each request is
short, progress is real rather than decorative, and the brief becomes an editable
checkpoint *before* the expensive call — which is the cheapest possible place to
correct a misunderstanding.

The section kit is the frontend's. This module names sections only as opaque
strings, and validates that the answers refer to sections the caller actually
asked for.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.core.database import get_db
from kleelab.core.exceptions import AIUnavailableError
from kleelab.core.security import get_current_user
from kleelab.models.ai_generation import AIGeneration
from kleelab.models.user import User
from kleelab.schemas.ai import (
    AIStatus,
    Brief,
    BriefRequest,
    BriefResponse,
    ContentRequest,
    ContentResponse,
    SectionContent,
)
from kleelab.services import llm
from kleelab.services.plans import enforce_ai_quota, limits_for, usage_for
from kleelab.services.site_brief import (
    BRIEF_SYSTEM,
    CONTENT_SYSTEM,
    brief_prompt,
    clean_brief,
    content_prompt,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])

# One section's copy should be a few hundred words at most. A generous ceiling
# that still stops a runaway answer from becoming a multi-megabyte document.
MAX_SECTION_CONTENT_CHARS = 6000


def _unavailable(error: llm.LLMError) -> AIUnavailableError:
    """Translate a service failure into something the interface can act on."""

    if isinstance(error, llm.LLMNotConfigured):
        return AIUnavailableError(
            "The AI builder is not switched on yet. You can still start from a template.",
            code="ai_not_configured",
            retryable=False,
        )
    if isinstance(error, llm.LLMRefused):
        return AIUnavailableError(
            "The AI builder gave an answer we could not use. Try describing your site again.",
            code="ai_unusable",
            retryable=True,
        )
    return AIUnavailableError(str(error), code="ai_unavailable", retryable=True)


async def _record(
    db: AsyncSession,
    user: User,
    *,
    kind: str,
    model: str,
    prompt_chars: int,
    tokens_in: int = 0,
    tokens_out: int = 0,
    status: str = "ok",
    error: str | None = None,
    payload: dict[str, Any] | None = None,
    site_id: Any = None,
) -> None:
    """Write the ledger row.

    Never allowed to fail the request: a customer should not lose a page they
    waited for because bookkeeping had a bad day. The row is the thing that makes
    spend auditable, though, so a failure is logged loudly.
    """

    try:
        db.add(
            AIGeneration(
                user_id=user.id,
                site_id=site_id,
                kind=kind,
                model=model,
                prompt_chars=prompt_chars,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                status=status,
                error=(error or "")[:2000] or None,
                payload=payload,
            )
        )
        await db.commit()
    except Exception:  # noqa: BLE001 - bookkeeping must not break the feature
        logger.exception("Could not record an AI generation")


@router.get("/status", response_model=AIStatus)
async def ai_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AIStatus:
    """Whether the builder can run, and how much allowance is left.

    The interface asks this *before* offering a prompt box, so "the AI is off"
    and "you have used this month's builds" are answered without the customer
    typing a paragraph first and being refused.
    """

    limits = limits_for(current_user)
    usage = await usage_for(db, current_user)
    remaining = max(0, limits.ai_builds_per_month - usage.ai_builds_this_month)

    if not settings.AI_ENABLED or not settings.DEEPSEEK_API_KEY:
        return AIStatus(
            available=False,
            reason="not_configured",
            builds_remaining=remaining,
            builds_per_month=limits.ai_builds_per_month,
        )

    return AIStatus(
        available=True,
        reason=None if remaining > 0 else "quota_exhausted",
        builds_remaining=remaining,
        builds_per_month=limits.ai_builds_per_month,
    )


@router.post("/brief", response_model=BriefResponse)
async def create_brief(
    payload: BriefRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BriefResponse:
    """Understand the business, and choose which sections its pages need."""

    await enforce_ai_quota(db, current_user)

    allowed = set(payload.section_ids)
    request_text = brief_prompt(
        prompt=payload.prompt,
        site_name=payload.site_name,
        section_ids=payload.section_ids,
    )

    try:
        result = await llm.complete_json(system=BRIEF_SYSTEM, user=request_text)
    except llm.LLMError as error:
        await _record(
            db,
            current_user,
            kind="brief",
            model=settings.DEEPSEEK_MODEL,
            prompt_chars=len(request_text),
            status="error",
            error=str(error),
        )
        raise _unavailable(error) from error

    try:
        # `extra="ignore"` on the model means a chatty answer is tolerated, but
        # everything the rest of the system relies on is still checked.
        brief = Brief.model_validate(result.data if isinstance(result.data, dict) else {})
        brief = clean_brief(brief, allowed)
    except (ValidationError, ValueError) as error:
        await _record(
            db,
            current_user,
            kind="brief",
            model=result.model,
            prompt_chars=len(request_text),
            tokens_in=result.tokens_in,
            tokens_out=result.tokens_out,
            status="rejected",
            error=str(error),
        )
        raise AIUnavailableError(
            "The AI builder did not return a usable structure. Try describing your site again.",
            code="ai_unusable",
        ) from error

    await _record(
        db,
        current_user,
        kind="brief",
        model=result.model,
        prompt_chars=len(request_text),
        tokens_in=result.tokens_in,
        tokens_out=result.tokens_out,
        payload=brief.model_dump(),
    )

    return BriefResponse(
        brief=brief,
        model=result.model,
        tokens_in=result.tokens_in,
        tokens_out=result.tokens_out,
    )


@router.post("/content", response_model=ContentResponse)
async def create_content(
    payload: ContentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContentResponse:
    """Write the copy for one page's sections.

    Sections missing from the answer are simply absent from the response. The
    frontend falls back to each recipe's own defaults for anything it did not
    receive, so a partial answer produces a plainer site rather than a broken one.
    """

    await enforce_ai_quota(db, current_user)

    if len(payload.sections) > settings.AI_MAX_SECTIONS_PER_REQUEST:
        raise AIUnavailableError(
            "That page has too many sections to write in one go.",
            code="ai_too_many_sections",
            retryable=False,
        )

    requested = {spec.id: spec for spec in payload.sections}
    request_text = content_prompt(
        brief=payload.brief,
        page_title=payload.page_title,
        sections=payload.sections,
    )

    try:
        result = await llm.complete_json(system=CONTENT_SYSTEM, user=request_text)
    except llm.LLMError as error:
        await _record(
            db,
            current_user,
            kind="content",
            model=settings.DEEPSEEK_MODEL,
            prompt_chars=len(request_text),
            status="error",
            error=str(error),
        )
        raise _unavailable(error) from error

    raw = result.data if isinstance(result.data, dict) else {}
    raw_sections = raw.get("sections")
    if not isinstance(raw_sections, list):
        await _record(
            db,
            current_user,
            kind="content",
            model=result.model,
            prompt_chars=len(request_text),
            tokens_in=result.tokens_in,
            tokens_out=result.tokens_out,
            status="rejected",
            error="no sections array in the answer",
        )
        raise AIUnavailableError(
            "The AI builder gave an answer we could not use. Try again.",
            code="ai_unusable",
        )

    written: list[SectionContent] = []
    for item in raw_sections:
        if not isinstance(item, dict):
            continue
        section_id = item.get("id")
        content = item.get("content")
        # Only sections that were actually asked for, so a response cannot
        # introduce a section the kit cannot build.
        if not isinstance(section_id, str) or section_id not in requested:
            continue
        if not isinstance(content, dict):
            continue
        if len(str(content)) > MAX_SECTION_CONTENT_CHARS:
            logger.warning("Discarded oversized content for %s", section_id)
            continue
        written.append(SectionContent(id=section_id, content=content))

    await _record(
        db,
        current_user,
        kind="content",
        model=result.model,
        prompt_chars=len(request_text),
        tokens_in=result.tokens_in,
        tokens_out=result.tokens_out,
        status="ok" if written else "rejected",
        payload={"ids": [item.id for item in written]},
    )

    return ContentResponse(
        sections=written,
        model=result.model,
        tokens_in=result.tokens_in,
        tokens_out=result.tokens_out,
    )
