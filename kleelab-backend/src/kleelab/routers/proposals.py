"""Proposals: the team writes one from an enquiry, the client accepts it online.

Two routers. The team's, under /api/admin, writes and sends proposals. The
public one, under /api/proposals/{token}, is what the client's link opens: no
account needed, since most people reading a proposal do not have one yet.
Accepting starts the project, creates the client's account if needed and
raises the deposit invoice, all in one transaction.
"""

import logging
from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from kleelab.core.database import get_db
from kleelab.core.rate_limiter import client_ip
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.project import ProjectInvoice
from kleelab.models.proposal import Proposal
from kleelab.models.user import User
from kleelab.routers.admin import require_staff
from kleelab.schemas.proposal import (
    ProposalAccept,
    ProposalAccepted,
    ProposalCreate,
    ProposalDecline,
    ProposalDetail,
    ProposalPatch,
    PublicProposal,
)
from kleelab.services import activity
from kleelab.services import email as email_svc
from kleelab.services import projects as project_svc
from kleelab.services import proposals as svc
from kleelab.services.activity import quoted

logger = logging.getLogger(__name__)

team_router = APIRouter(prefix="/api/admin/proposals", tags=["admin"], dependencies=[Depends(require_staff)])
router = APIRouter(prefix="/api/proposals", tags=["proposals"])

# Days the deposit invoice gives the client to pay.
DEPOSIT_DUE_DAYS = 7
# How long a new proposal stays open unless the team picks a date.
DEFAULT_VALID_DAYS = 30
OPEN = ("draft", "sent")


def _money(proposal: Proposal, cents: int) -> str:
    return project_svc.money(cents, proposal.currency)


async def _load(db: AsyncSession, proposal_id: UUID) -> Proposal:
    proposal = await db.scalar(
        select(Proposal)
        .where(Proposal.id == proposal_id)
        .options(selectinload(Proposal.author), selectinload(Proposal.lead))
        .execution_options(populate_existing=True)
    )
    if proposal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")
    return proposal


async def _check_client_email(db: AsyncSession, email: str) -> None:
    user = await db.scalar(select(User).where(User.email == email.lower()))
    if user is not None and project_svc.is_staff(user):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That email belongs to a team member. Use the client's own email.",
        )


def _apply(proposal: Proposal, changes: dict) -> None:
    for field, value in changes.items():
        if field == "client_email" and value is not None:
            value = str(value).lower()
        elif field in ("items", "stages") and value is not None:
            value = [dict(entry) for entry in value]
        elif field == "title" and value is not None:
            value = value.strip()
        setattr(proposal, field, value)


# --- The team's side ------------------------------------------------------------


@team_router.post("", response_model=ProposalDetail, status_code=status.HTTP_201_CREATED)
async def create_proposal(
    payload: ProposalCreate, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> ProposalDetail:
    """Start a draft from an enquiry, filled in with what the enquiry already says."""

    lead = await db.get(AgencyLead, payload.lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found")
    changes = payload.model_dump(exclude_unset=True, exclude={"lead_id"})
    proposal = Proposal(
        lead_id=lead.id,
        created_by=staff.id,
        reference=await svc.next_reference(db),
        token=svc.new_token(),
        status="draft",
        client_name=lead.name,
        client_email=lead.email,
        title=(lead.company and f"A new website for {lead.company}") or "Your new website",
        summary=None,
        items=[],
        currency="NGN",
        deposit_percent=50,
        stages=list(svc.DEFAULT_STAGES),
        terms=svc.DEFAULT_TERMS,
        valid_until=date.today() + timedelta(days=DEFAULT_VALID_DAYS),
    )
    _apply(proposal, changes)
    await _check_client_email(db, proposal.client_email)
    db.add(proposal)
    await db.flush()
    activity.record(db, staff, "proposal.create",
                    f"Started proposal {proposal.reference} for {lead.name or lead.email}",
                    subject_type="lead", subject_id=lead.id)
    await db.commit()
    return svc.detail(await _load(db, proposal.id))


@team_router.get("/{proposal_id}", response_model=ProposalDetail)
async def get_proposal(proposal_id: UUID, db: AsyncSession = Depends(get_db)) -> ProposalDetail:
    return svc.detail(await _load(db, proposal_id))


@team_router.patch("/{proposal_id}", response_model=ProposalDetail)
async def patch_proposal(
    proposal_id: UUID,
    payload: ProposalPatch,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProposalDetail:
    """Edit a draft, or a sent proposal the client has not answered.

    Editing a sent one bumps its revision, so a client with the old version open
    is asked to reload before they can accept.
    """

    proposal = await _load(db, proposal_id)
    if proposal.status not in OPEN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This proposal has been answered or withdrawn. Make a new version to change it.",
        )
    changes = payload.model_dump(exclude_unset=True)
    for required in ("client_email", "title", "items", "currency", "deposit_percent", "stages"):
        if required in changes and changes[required] is None:
            changes.pop(required)
    if not changes:
        return svc.detail(proposal)
    _apply(proposal, changes)
    await _check_client_email(db, proposal.client_email)
    proposal.revision += 1
    if proposal.status == "sent":
        activity.record(db, staff, "proposal.update", f"Edited proposal {proposal.reference} after sending it",
                        subject_type="lead", subject_id=proposal.lead_id)
    await db.commit()
    return svc.detail(await _load(db, proposal.id))


@team_router.post("/{proposal_id}/send", response_model=ProposalDetail)
async def send_proposal(
    proposal_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> ProposalDetail:
    """Email the client their link. Sending again re-sends the same link."""

    proposal = await _load(db, proposal_id)
    if proposal.status not in OPEN:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only an open proposal can be sent")
    if not proposal.items or svc.total_cents(proposal) <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Add at least one priced item before sending")
    if not proposal.stages:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Add at least one step so the client can see how the work runs")
    if proposal.valid_until is not None and proposal.valid_until < date.today():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="The 'open until' date has passed. Pick a later one before sending.")
    await _check_client_email(db, proposal.client_email)

    total = _money(proposal, svc.total_cents(proposal))
    sent = email_svc.send_proposal_email(
        proposal.client_email,
        proposal.client_name,
        proposal.title,
        proposal.reference,
        svc.public_url(proposal),
        total,
        f"{proposal.valid_until:%d %B %Y}" if proposal.valid_until else None,
        project_svc.display_name(staff),
    )
    if not sent:
        # Nothing changes, so the proposal never claims to be sent when it was not.
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="The email could not be sent. Check the email settings and try again.")
    again = proposal.status == "sent"
    proposal.status = "sent"
    proposal.sent_at = project_svc.now()
    lead = proposal.lead
    if lead is not None and lead.status not in ("won", "lost"):
        lead.status = "proposal"
    activity.record(
        db, staff, "proposal.send",
        f"{'Sent again' if again else 'Sent'} proposal {proposal.reference} ({total}) to {proposal.client_email}",
        subject_type="lead", subject_id=proposal.lead_id,
    )
    await db.commit()
    return svc.detail(await _load(db, proposal.id))


@team_router.post("/{proposal_id}/withdraw", response_model=ProposalDetail)
async def withdraw_proposal(
    proposal_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> ProposalDetail:
    """Take a proposal back. The client's link then says it is no longer open."""

    proposal = await _load(db, proposal_id)
    if proposal.status != "sent":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only a sent, unanswered proposal can be withdrawn")
    proposal.status = "withdrawn"
    activity.record(db, staff, "proposal.withdraw", f"Withdrew proposal {proposal.reference}",
                    subject_type="lead", subject_id=proposal.lead_id)
    await db.commit()
    return svc.detail(await _load(db, proposal.id))


@team_router.post("/{proposal_id}/copy", response_model=ProposalDetail, status_code=status.HTTP_201_CREATED)
async def copy_proposal(
    proposal_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> ProposalDetail:
    """A new draft with the same content, for a declined, withdrawn or expired one."""

    source = await _load(db, proposal_id)
    proposal = Proposal(
        lead_id=source.lead_id,
        created_by=staff.id,
        reference=await svc.next_reference(db),
        token=svc.new_token(),
        status="draft",
        client_name=source.client_name,
        client_email=source.client_email,
        title=source.title,
        summary=source.summary,
        scope=source.scope,
        items=[dict(item) for item in source.items],
        currency=source.currency,
        deposit_percent=source.deposit_percent,
        duration_weeks=source.duration_weeks,
        stages=[dict(stage) for stage in source.stages],
        terms=source.terms,
        valid_until=max(source.valid_until or date.today(), date.today() + timedelta(days=DEFAULT_VALID_DAYS)),
    )
    db.add(proposal)
    await db.flush()
    activity.record(db, staff, "proposal.create",
                    f"Started proposal {proposal.reference} as a new version of {source.reference}",
                    subject_type="lead", subject_id=proposal.lead_id)
    await db.commit()
    return svc.detail(await _load(db, proposal.id))


@team_router.delete("/{proposal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_proposal(
    proposal_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> None:
    """Throw away a draft. Anything the client has seen is kept as a record."""

    proposal = await _load(db, proposal_id)
    if proposal.status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Only a draft can be deleted. Withdraw a sent proposal instead.")
    activity.record(db, staff, "proposal.delete", f"Deleted the draft proposal {proposal.reference}",
                    subject_type="lead", subject_id=proposal.lead_id)
    await db.delete(proposal)
    await db.commit()


# --- The client's side ------------------------------------------------------------


async def _by_token(db: AsyncSession, token: str, lock: bool = False) -> Proposal:
    query = select(Proposal).where(Proposal.token == token).options(
        selectinload(Proposal.author), selectinload(Proposal.lead)
    )
    if lock:
        # Two clicks on Accept must not start two projects.
        query = query.with_for_update(of=Proposal)
    proposal = await db.scalar(query.execution_options(populate_existing=True))
    # A draft has no public page: the team may still be writing the price.
    if proposal is None or proposal.status == "draft":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")
    return proposal


def _check_answerable(proposal: Proposal, revision: int) -> None:
    if proposal.status == "withdrawn":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="This proposal was withdrawn. Get in touch and we will send a new one.")
    if proposal.status != "sent":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This proposal has already been answered.")
    if svc.is_expired(proposal):
        raise HTTPException(status_code=status.HTTP_410_GONE,
                            detail="This proposal has expired. Get in touch and we will send a fresh one.")
    if revision != proposal.revision:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="We updated this proposal while you had it open. Reload the page to see the latest version.")


def _team_notice(proposal: Proposal, subject: str, lines: list[str], project_id: UUID | None = None) -> None:
    owner = proposal.author
    also = [owner.email] if owner is not None and project_svc.is_staff(owner) and owner.is_active else []
    try:
        email_svc.send_team_notice(subject, lines, str(project_id) if project_id else None, also_to=also)
    except Exception:  # noqa: BLE001 - the answer is already saved
        logger.exception("Could not tell the team about %s", proposal.reference)


@router.get("/{token}", response_model=PublicProposal)
async def read_proposal(token: str, request: Request, db: AsyncSession = Depends(get_db)) -> PublicProposal:
    proposal = await _by_token(db, token)
    if proposal.status == "sent" and proposal.viewed_at is None:
        proposal.viewed_at = project_svc.now()
        activity.record(db, None, "proposal.viewed", f"Opened proposal {proposal.reference}",
                        subject_type="lead", subject_id=proposal.lead_id, request=request,
                        label=proposal.client_name or proposal.client_email)
        await db.commit()
    return svc.public(proposal)


@router.post("/{token}/accept", response_model=ProposalAccepted)
async def accept_proposal(
    token: str, payload: ProposalAccept, request: Request, db: AsyncSession = Depends(get_db)
) -> ProposalAccepted:
    """Say yes: start the project and raise the first invoice, for the deposit or the whole price."""

    proposal = await _by_token(db, token, lock=True)
    _check_answerable(proposal, payload.revision)

    owner = proposal.author
    owner_id = owner.id if owner is not None and project_svc.is_staff(owner) and owner.is_active else None
    today = date.today()
    project, client, invited = await project_svc.start_project(
        db,
        client_email=proposal.client_email,
        client_name=proposal.client_name or payload.name.strip(),
        title=proposal.title,
        summary=proposal.summary,
        stages=project_svc.build_stages_from([(s["name"], s.get("description")) for s in proposal.stages]),
        owner_id=owner_id,
        welcome_author_id=owner_id,
        lead=proposal.lead,
        start_date=today,
        target_date=today + timedelta(weeks=proposal.duration_weeks) if proposal.duration_weeks else None,
    )

    # A 100% deposit is the whole price, so there is nothing to choose.
    full = payload.payment == "full" or proposal.deposit_percent >= 100
    amount = svc.total_cents(proposal) if full else svc.deposit_cents(proposal)
    invoice = None
    if amount > 0:
        invoice = ProjectInvoice(
            project_id=project.id,
            number=await project_svc.next_invoice_number(db),
            title=(f"Full payment: {proposal.title}" if full
                   else f"Deposit ({proposal.deposit_percent}%): {proposal.title}")[:150],
            amount_cents=amount,
            currency=proposal.currency,
            due_date=today + timedelta(days=DEPOSIT_DUE_DAYS),
            status="unpaid",
            kind="full" if full else "deposit",
            client_name=client.full_name,
            client_email=client.email,
            project_reference=project.reference,
            project_title=project.title,
        )
        db.add(invoice)

    proposal.status = "accepted"
    proposal.accepted_at = project_svc.now()
    proposal.accepted_name = payload.name.strip()
    proposal.accepted_ip = client_ip(request)[:64]
    proposal.payment_choice = "full" if full else "deposit"
    proposal.project_id = project.id

    total = _money(proposal, svc.total_cents(proposal))
    activity.record(
        db, client, "proposal.accepted",
        f"Accepted proposal {proposal.reference} ({total}), signed {quoted(proposal.accepted_name)}",
        project_id=project.id, subject_type="proposal", subject_id=proposal.id, request=request,
    )
    if invoice is not None:
        await db.flush()
        activity.record(
            db, owner if owner_id else None, "invoice.create",
            f"Billed {invoice.number}: {invoice.title}, {_money(proposal, amount)}",
            project_id=project.id, subject_type="invoice", subject_id=invoice.id,
            label=None if owner_id else "KleeLab",
        )
    await db.commit()

    invite_sent = False
    if invited:
        invite_sent = project_svc.send_invite(client, project)
    else:
        project_svc.notify_client(
            project,
            "Your project has started."
            + (f" Your {'invoice' if full else 'deposit invoice'} {invoice.number} is ready to pay." if invoice else ""),
        )
    _team_notice(
        proposal,
        f"Proposal accepted: {proposal.title}",
        [
            f"{proposal.accepted_name} accepted {proposal.reference} for {total}.",
            f"The project {project.reference} has started"
            + (f" and {'the full-payment' if full else 'the deposit'} invoice {invoice.number} ({_money(proposal, amount)}) is waiting to be paid."
               if invoice is not None else "."),
        ] + (["Their invite email did not go out. Resend it from the project page."] if invited and not invite_sent else []),
        project.id,
    )
    return ProposalAccepted(proposal=svc.public(await _by_token(db, token)), invited=invited, invite_sent=invite_sent, email=client.email)


@router.post("/{token}/decline", response_model=PublicProposal)
async def decline_proposal(
    token: str, payload: ProposalDecline, request: Request, db: AsyncSession = Depends(get_db)
) -> PublicProposal:
    proposal = await _by_token(db, token, lock=True)
    _check_answerable(proposal, payload.revision)
    proposal.status = "declined"
    proposal.declined_at = project_svc.now()
    proposal.decline_reason = (payload.reason or "").strip() or None
    who = proposal.client_name or proposal.client_email
    activity.record(
        db, None, "proposal.declined",
        f"Declined proposal {proposal.reference}"
        + (f": {quoted(proposal.decline_reason)}" if proposal.decline_reason else ""),
        subject_type="lead", subject_id=proposal.lead_id, request=request, label=who,
    )
    await db.commit()
    _team_notice(
        proposal,
        f"Proposal declined: {proposal.title}",
        [f"{who} declined {proposal.reference}.",
         f"Their reason: {proposal.decline_reason}" if proposal.decline_reason else "They did not give a reason."],
    )
    return svc.public(proposal)
