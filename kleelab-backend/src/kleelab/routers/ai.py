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
    Design,
    EditOperation,
    EditRequest,
    EditResponse,
    SectionContent,
)
from kleelab.services import design_library, llm
from kleelab.services.plans import enforce_ai_quota, limits_for, usage_for
from kleelab.services.site_brief import (
    BRIEF_SYSTEM,
    CONTENT_SYSTEM,
    brief_prompt,
    clean_brief,
    content_prompt,
    ensure_imagery,
)
from kleelab.services.site_edit import EDIT_SYSTEM, clean_operations, edit_prompt
from kleelab.services.stock_images import fill_images

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

    catalogue = {spec.id: spec for spec in payload.sections}
    allowed = set(catalogue)
    request_text = brief_prompt(
        prompt=payload.prompt,
        site_name=payload.site_name,
        sections=payload.sections,
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
        # A prompt asking for an image-bearing header is not a guarantee, and a
        # site that opens with no picture is the first thing anyone notices.
        brief = ensure_imagery(brief, catalogue)
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
        design=_design_for(brief, payload.prompt),
        model=result.model,
        tokens_in=result.tokens_in,
        tokens_out=result.tokens_out,
    )


def _design_for(brief: Brief, prompt: str) -> Design | None:
    """The design the library thinks this business should have.

    Matched on the model's own summary as well as what the customer typed: the
    summary has already resolved the description into something a keyword list can
    recognise, which is exactly what matching on industry needs.

    `None` is a normal answer. A business the library has no product type for keeps
    the neutral default rather than being given a design chosen from the wrong trade.
    """

    description = " ".join(
        part for part in (prompt, brief.summary, brief.business_name, brief.audience) if part
    )
    try:
        return design_library.choose_design(description=description)
    except (OSError, ValueError, KeyError):
        # A design is an enhancement; a build must not fail because the library is
        # unreadable. The site still gets its pages, its copy and a neutral theme.
        logger.warning("Could not choose a design from the library; using the default")
        return None


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
        # Photographs are filled in here rather than asked for: the model can name
        # an image slot but it cannot produce pixels, and a page of empty frames
        # is what makes a generated site look dead. The recipe's example is passed
        # so an image field the model omitted is restored rather than left blank.
        content = fill_images(
            content,
            describe=f"{payload.brief.business_name}-{section_id}",
            example=requested[section_id].example,
        )
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


@router.post("/edit", response_model=EditResponse)
async def edit_page(
    payload: EditRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EditResponse:
    """Answer one turn of the conversation, as a list of changes to make.

    An edit is not a build, so it counts against the daily call cap rather than
    the monthly build allowance — talking to a site should not cost a customer a
    generation.
    """

    await enforce_ai_quota(db, current_user)

    section_ids = {spec.id for spec in payload.sections}
    request_text = edit_prompt(payload)

    try:
        result = await llm.complete_json(system=EDIT_SYSTEM, user=request_text)
    except llm.LLMError as error:
        await _record(
            db,
            current_user,
            kind="edit",
            model=settings.DEEPSEEK_MODEL,
            prompt_chars=len(request_text),
            status="error",
            error=str(error),
        )
        raise _unavailable(error) from error

    raw = result.data if isinstance(result.data, dict) else {}
    raw_operations = raw.get("operations")
    claimed = _as_text(raw.get("summary"))

    proposed: list[EditOperation] = []
    if isinstance(raw_operations, list):
        for item in raw_operations:
            if not isinstance(item, dict):
                continue
            try:
                proposed.append(EditOperation.model_validate(item))
            except ValidationError:
                # One malformed operation must not discard an otherwise good turn.
                logger.warning("Discarded an unparseable edit operation")
                continue

    kept = clean_operations(
        proposed,
        outline=payload.outline,
        section_ids=section_ids,
        # A palette name is also accepted as a theme slot: asking for a warmer
        # site is a normal thing to say, and it would be odd to refuse it for
        # being phrased as one word instead of eight.
        theme_slots=set(payload.theme) | set(payload.palettes),
        allowed_style_keys=set(payload.style_tokens),
    )

    summary = _honest_summary(
        claimed=claimed,
        proposed=len(proposed),
        kept=len(kept),
    )

    await _record(
        db,
        current_user,
        kind="edit",
        model=result.model,
        prompt_chars=len(request_text),
        tokens_in=result.tokens_in,
        tokens_out=result.tokens_out,
        status="ok" if kept or not proposed else "rejected",
        payload={"ops": [operation.op for operation in kept], "proposed": len(proposed)},
    )

    return EditResponse(
        operations=kept,
        summary=summary,
        model=result.model,
        tokens_in=result.tokens_in,
        tokens_out=result.tokens_out,
    )


def _as_text(value: object, limit: int = 600) -> str:
    """Coerce a model's field to a trimmed string, whatever it actually sent."""

    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:limit]


def _honest_summary(*, claimed: str, proposed: int, kept: int) -> str:
    """Never let the assistant describe a change that will not happen.

    The summary is what the customer reads and believes. If the model says it
    enlarged the heading but every operation it returned was discarded, that
    sentence is a lie — and a lie that looks like a working feature, because the
    page will not have changed. Saying so is the only honest option.
    """

    if proposed == 0:
        # A question, or a refusal. Both are normal turns; pass the answer through.
        return claimed

    if kept == 0:
        return (
            "I could not make that change — it referred to parts of the page I could not "
            "identify. Try naming the section you mean, for example the header or the footer."
        )

    if kept < proposed:
        dropped = proposed - kept
        note = f" ({dropped} part of that could not be applied, so it was left out.)"
        return f"{claimed}{note}".strip()

    return claimed
