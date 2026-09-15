"""Plan limits, usage accounting, and the single quota gate.

Every commercial restriction in the product reads from this module. That is the
whole point of it existing: quotas that are enforced in several places drift,
and a quota that is enforced nowhere quietly turns a paid tier into a promise.

Two rules this module deliberately follows:

* **Fail closed.** An unrecognised plan value resolves to the free tier, so a
  typo in a database row cannot hand out a paid allowance.
* **Limits are config, not schema.** They live in ``PLAN_LIMITS`` below. Changing
  what a plan includes is a one-line edit and does not need a migration, because
  tiers are commercial decisions and commercial decisions change.
"""

from dataclasses import dataclass
from datetime import datetime, time
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.exceptions import PlanLimitError
from kleelab.core.time import utcnow
from kleelab.models.ai_generation import AIGeneration
from kleelab.models.page import Page
from kleelab.models.site import Site
from kleelab.models.user import User

__all__ = [
    "DEFAULT_PLAN",
    "PLAN_LIMITS",
    "PLAN_KEYS",
    "PlanLimits",
    "PlanUsage",
    "limits_for",
    "usage_for",
    "plan_state",
    "enforce_site_quota",
    "enforce_page_quota",
    "enforce_ai_quota",
    "enforce_feature",
]

DEFAULT_PLAN = "free"


@dataclass(frozen=True)
class PlanLimits:
    """What one commercial tier includes."""

    key: str
    label: str
    blurb: str
    sites: int
    pages_per_site: int
    ai_builds_per_month: int
    ai_calls_per_day: int
    custom_domain: bool
    storefront: bool


PLAN_LIMITS: dict[str, PlanLimits] = {
    "free": PlanLimits(
        key="free",
        label="Free",
        blurb="Build a site with the AI builder and publish it on a kleelab.com address.",
        sites=1,
        pages_per_site=5,
        ai_builds_per_month=3,
        ai_calls_per_day=40,
        custom_domain=False,
        storefront=False,
    ),
    "pro": PlanLimits(
        key="pro",
        label="Pro",
        blurb="Custom domain, a shop, and enough AI allowance to keep building.",
        sites=5,
        pages_per_site=25,
        ai_builds_per_month=100,
        ai_calls_per_day=400,
        custom_domain=True,
        storefront=True,
    ),
    "enterprise": PlanLimits(
        key="enterprise",
        label="Enterprise",
        blurb="Built with you, by us. Nothing here limits that work.",
        sites=1000,
        pages_per_site=1000,
        ai_builds_per_month=100_000,
        ai_calls_per_day=100_000,
        custom_domain=True,
        storefront=True,
    ),
}

PLAN_KEYS: tuple[str, ...] = tuple(PLAN_LIMITS)


@dataclass(frozen=True)
class PlanUsage:
    """What the account has actually used."""

    sites: int
    ai_builds_this_month: int
    ai_calls_today: int


def limits_for(user: User) -> PlanLimits:
    """Limits for a user's plan, falling back to the free tier.

    Unknown values resolve downwards on purpose. A row that says ``"Premium"``
    is a bug, and the safe reading of a bug is "the customer has not paid".
    """

    return PLAN_LIMITS.get(getattr(user, "plan", DEFAULT_PLAN), PLAN_LIMITS[DEFAULT_PLAN])


def _month_start(now: datetime) -> datetime:
    return datetime.combine(now.date().replace(day=1), time.min)


def _day_start(now: datetime) -> datetime:
    return datetime.combine(now.date(), time.min)


async def usage_for(db: AsyncSession, user: User) -> PlanUsage:
    """Count what the account has used, ignoring deleted rows automatically."""

    now = utcnow()
    sites = await db.scalar(
        select(func.count()).select_from(Site).where(Site.user_id == user.id)
    )
    # One build is one brief: filling a brief with content is the same build, and
    # edits are bounded by the daily call cap instead. Counting every call here
    # would make the advertised "3 builds" mean "1.5 builds".
    builds = await db.scalar(
        select(func.count())
        .select_from(AIGeneration)
        .where(
            AIGeneration.user_id == user.id,
            AIGeneration.kind == "brief",
            AIGeneration.created_at >= _month_start(now),
        )
    )
    calls = await db.scalar(
        select(func.count())
        .select_from(AIGeneration)
        .where(
            AIGeneration.user_id == user.id,
            AIGeneration.created_at >= _day_start(now),
        )
    )
    return PlanUsage(
        sites=int(sites or 0),
        ai_builds_this_month=int(builds or 0),
        ai_calls_today=int(calls or 0),
    )


async def plan_state(db: AsyncSession, user: User) -> dict:
    """The plan and its usage, shaped for the API.

    Sent with ``/api/auth/me`` so the interface never has to guess what it may
    offer. A client that hardcodes limits ends up disagreeing with the server the
    moment a limit changes.
    """

    limits = limits_for(user)
    usage = await usage_for(db, user)
    return {
        "plan": limits.key,
        "label": limits.label,
        "blurb": limits.blurb,
        "limits": {
            "sites": limits.sites,
            "pages_per_site": limits.pages_per_site,
            "ai_builds_per_month": limits.ai_builds_per_month,
            "ai_calls_per_day": limits.ai_calls_per_day,
            "custom_domain": limits.custom_domain,
            "storefront": limits.storefront,
        },
        "usage": {
            "sites": usage.sites,
            "ai_builds_this_month": usage.ai_builds_this_month,
            "ai_calls_today": usage.ai_calls_today,
        },
    }


async def enforce_site_quota(db: AsyncSession, user: User) -> None:
    """Refuse to create a site beyond the plan's allowance."""

    limits = limits_for(user)
    current = await db.scalar(
        select(func.count()).select_from(Site).where(Site.user_id == user.id)
    )
    current = int(current or 0)
    if current >= limits.sites:
        raise PlanLimitError(
            resource="sites",
            limit=limits.sites,
            current=current,
            plan=limits.key,
            message=_quota_message("site", current, limits.sites, limits.label),
        )


async def enforce_page_quota(db: AsyncSession, user: User, site_id: UUID) -> None:
    """Refuse to create a page beyond the plan's per-site allowance."""

    limits = limits_for(user)
    current = await db.scalar(
        select(func.count()).select_from(Page).where(Page.site_id == site_id)
    )
    current = int(current or 0)
    if current >= limits.pages_per_site:
        raise PlanLimitError(
            resource="pages",
            limit=limits.pages_per_site,
            current=current,
            plan=limits.key,
            message=_quota_message("page", current, limits.pages_per_site, limits.label),
        )


async def enforce_ai_quota(db: AsyncSession, user: User) -> None:
    """Refuse an AI call beyond the monthly build allowance or the daily cap.

    Both are checked here because both protect the same thing from different
    directions: the monthly allowance is what a customer buys, and the daily cap
    is what stops one account from spending a month's budget in a minute.
    """

    limits = limits_for(user)
    now = utcnow()

    builds = await db.scalar(
        select(func.count())
        .select_from(AIGeneration)
        .where(
            AIGeneration.user_id == user.id,
            AIGeneration.kind == "brief",
            AIGeneration.created_at >= _month_start(now),
        )
    )
    builds = int(builds or 0)
    if builds >= limits.ai_builds_per_month:
        raise PlanLimitError(
            resource="ai_builds",
            limit=limits.ai_builds_per_month,
            current=builds,
            plan=limits.key,
            message=(
                f"Your {limits.label} plan includes {limits.ai_builds_per_month} AI builds "
                f"per month and you have used all of them. Upgrade to keep building, or "
                f"start from a template instead."
            ),
        )

    calls = await db.scalar(
        select(func.count())
        .select_from(AIGeneration)
        .where(
            AIGeneration.user_id == user.id,
            AIGeneration.created_at >= _day_start(now),
        )
    )
    calls = int(calls or 0)
    if calls >= limits.ai_calls_per_day:
        raise PlanLimitError(
            resource="ai_calls",
            limit=limits.ai_calls_per_day,
            current=calls,
            plan=limits.key,
            message=(
                "You have reached today's AI limit. It resets at midnight UTC — "
                "your existing sites are unaffected."
            ),
            retryable_tomorrow=True,
        )


def enforce_feature(user: User, feature: str) -> None:
    """Refuse a boolean plan feature (``custom_domain``, ``storefront``)."""

    limits = limits_for(user)
    if getattr(limits, feature, False):
        return
    readable = feature.replace("_", " ")
    raise PlanLimitError(
        resource=feature,
        limit=0,
        current=0,
        plan=limits.key,
        message=f"{readable.capitalize()} is not included in the {limits.label} plan.",
    )


def _quota_message(noun: str, current: int, limit: int, label: str) -> str:
    plural = "" if limit == 1 else "s"
    return (
        f"Your {label} plan includes {limit} {noun}{plural} and you already have {current}. "
        f"Upgrade to add more, or delete one you no longer need."
    )
