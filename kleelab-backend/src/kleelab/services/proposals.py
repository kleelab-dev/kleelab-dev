"""Proposal rules shared by the team's editor and the client's public page."""

from __future__ import annotations

import secrets
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.models.proposal import Proposal
from kleelab.schemas.proposal import (
    ProposalDetail,
    ProposalItem,
    ProposalStage,
    ProposalSummary,
    PublicProposal,
)
from kleelab.services import projects as project_svc

# What we offer by default: the same steps every project runs through.
DEFAULT_STAGES = [{"name": name, "description": description} for name, description in project_svc.DEFAULT_STAGES]

DEFAULT_TERMS = (
    "Prices include everything listed above. Anything outside it is quoted separately before we start on it.\n\n"
    "The deposit is due when you accept, and work starts once it is paid. The rest is invoiced as the "
    "project goes, and the last payment is due at hand-over.\n\n"
    "Once the final invoice is paid, the site, its content and its code are yours."
)


def new_token() -> str:
    return secrets.token_urlsafe(32)


async def next_reference(db: AsyncSession) -> str:
    count = await db.scalar(select(func.count()).select_from(Proposal)) or 0
    number = count + 1
    while await db.scalar(select(Proposal.id).where(Proposal.reference == f"PRP-{number:04d}")):
        number += 1
    return f"PRP-{number:04d}"


def total_cents(proposal: Proposal) -> int:
    return sum(int(item.get("amount_cents", 0)) for item in proposal.items or [])


def deposit_cents(proposal: Proposal) -> int:
    # Rounded down to the whole unit, so a deposit never asks for odd kobo or cents.
    raw = total_cents(proposal) * proposal.deposit_percent // 100
    return raw - raw % 100


def is_expired(proposal: Proposal, today: date | None = None) -> bool:
    return (
        proposal.status == "sent"
        and proposal.valid_until is not None
        and proposal.valid_until < (today or date.today())
    )


def shown_status(proposal: Proposal) -> str:
    return "expired" if is_expired(proposal) else proposal.status


def public_url(proposal: Proposal) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/proposal/{proposal.token}"


def summarise(proposal: Proposal) -> ProposalSummary:
    return ProposalSummary(
        id=proposal.id,
        reference=proposal.reference,
        title=proposal.title,
        status=shown_status(proposal),
        currency=proposal.currency,
        total_cents=total_cents(proposal),
        sent_at=proposal.sent_at,
        viewed_at=proposal.viewed_at,
        accepted_at=proposal.accepted_at,
        declined_at=proposal.declined_at,
        valid_until=proposal.valid_until,
        created_at=proposal.created_at,
        updated_at=proposal.updated_at,
        lead_id=proposal.lead_id,
        project_id=proposal.project_id,
    )


def detail(proposal: Proposal) -> ProposalDetail:
    return ProposalDetail(
        **summarise(proposal).model_dump(),
        revision=proposal.revision,
        client_name=proposal.client_name,
        client_email=proposal.client_email,
        summary=proposal.summary,
        scope=proposal.scope,
        items=[ProposalItem(**item) for item in proposal.items or []],
        deposit_percent=proposal.deposit_percent,
        deposit_cents=deposit_cents(proposal),
        duration_weeks=proposal.duration_weeks,
        stages=[ProposalStage(**stage) for stage in proposal.stages or []],
        terms=proposal.terms,
        accepted_name=proposal.accepted_name,
        decline_reason=proposal.decline_reason,
        author_name=project_svc.display_name(proposal.author),
        public_url=public_url(proposal) if proposal.status != "draft" else None,
    )


def public(proposal: Proposal) -> PublicProposal:
    return PublicProposal(
        reference=proposal.reference,
        revision=proposal.revision,
        status=shown_status(proposal),
        client_name=proposal.client_name,
        title=proposal.title,
        summary=proposal.summary,
        scope=proposal.scope,
        items=[ProposalItem(**item) for item in proposal.items or []],
        currency=proposal.currency,
        total_cents=total_cents(proposal),
        deposit_percent=proposal.deposit_percent,
        deposit_cents=deposit_cents(proposal),
        duration_weeks=proposal.duration_weeks,
        stages=[ProposalStage(**stage) for stage in proposal.stages or []],
        terms=proposal.terms,
        valid_until=proposal.valid_until,
        sent_at=proposal.sent_at,
        accepted_at=proposal.accepted_at,
        accepted_name=proposal.accepted_name,
        declined_at=proposal.declined_at,
        prepared_by=project_svc.display_name(proposal.author),
    )
