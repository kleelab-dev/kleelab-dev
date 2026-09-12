"""Public agency contact and lead capture."""

import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_optional_user
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.user import User
from kleelab.schemas.agency import LeadCreate, LeadReceived
from kleelab.services.email import send_agency_lead_notification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agency", tags=["agency"])


@router.post("/leads", response_model=LeadReceived, status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: LeadCreate,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> LeadReceived:
    """Record an enquiry from the marketing site's contact form.

    Public by design - the whole point is that a visitor who has not signed up
    can make contact - but it still attaches the enquiry to an account when the
    visitor happens to be signed in, so follow-up has context.
    """

    if payload.website:
        # Answer exactly as we would for a real submission, so the bot has no
        # signal to adapt, but store nothing.
        logger.info("Discarded lead from %s: honeypot field was filled", payload.email)
        return LeadReceived(status="received")

    lead = AgencyLead(
        user_id=user.id if user is not None else None,
        email=str(payload.email).lower(),
        name=payload.name,
        feature_requested=payload.project_type,
        message=payload.message,
        status="new",
    )
    db.add(lead)
    await db.commit()

    try:
        send_agency_lead_notification(lead.email, lead.feature_requested or "General enquiry")
    except Exception:  # noqa: BLE001 - the lead is already safely stored
        # Losing the notification is survivable. Telling the visitor their message
        # failed, or dropping it because email is down, is not.
        logger.exception("Could not send the agency lead notification for %s", lead.email)

    return LeadReceived(status="received")
