"""Team routes for care plans and time tracking."""

from collections import defaultdict
from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from kleelab.core.database import get_db
from kleelab.models.care import CarePlan, TimeEntry
from kleelab.models.project import Project
from kleelab.models.user import User
from kleelab.routers.admin import require_staff
from kleelab.schemas.care import (
    CarePlanCreate,
    CarePlanPatch,
    CarePlanRow,
    ProjectTime,
    TimeEntryIn,
    TimeEntryOut,
    TimeSheet,
    TimeTotal,
)
from kleelab.schemas.project import ProjectDetail
from kleelab.services import activity
from kleelab.services import care
from kleelab.services import projects as svc

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_staff)])

# The longest stretch the timesheet shows at once.
MAX_SHEET_DAYS = 93
PLAN_FIELD_WORDS = {
    "name": "the name",
    "includes": "what it covers",
    "amount_cents": "the price",
    "currency": "the currency",
    "interval": "how often it bills",
    "minutes_included": "the hours included",
    "next_bill_on": "the next billing date",
}


def _hours(minutes: int) -> str:
    hours, mins = divmod(minutes, 60)
    if not mins:
        return f"{hours}h"
    return f"{hours}h {mins}m" if hours else f"{mins}m"


def _plan_price(plan: CarePlan) -> str:
    return f"{svc.money(plan.amount_cents, plan.currency)} {care.INTERVAL_WORDS.get(plan.interval, '')}".strip()


async def _reload(db: AsyncSession, project_id: UUID, staff: User) -> ProjectDetail:
    project = await svc.load_project(db, project_id, staff)
    return svc.detail(project, team=True)


async def _bill_if_due(db: AsyncSession, plan: CarePlan, project: Project, staff: User) -> list:
    """Raise the invoice now when the plan's date has already come."""

    if plan.status == "active" and plan.next_bill_on <= date.today():
        return [await care.bill(db, plan, project, staff)]
    return []


# --- care plans ---------------------------------------------------------------


@router.post("/projects/{project_id}/care-plan", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def start_care_plan(
    project_id: UUID,
    payload: CarePlanCreate,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    project = await svc.load_project(db, project_id, staff)
    if project.care_plan is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This project already has a care plan")
    if project.status == "cancelled":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This project is cancelled")

    plan = CarePlan(
        project_id=project.id,
        name=payload.name.strip(),
        includes=payload.includes,
        amount_cents=payload.amount_cents,
        currency=payload.currency,
        interval=payload.interval,
        minutes_included=payload.minutes_included,
        status="active",
        started_on=payload.first_bill_on,
        next_bill_on=payload.first_bill_on,
        created_by_id=staff.id,
    )
    db.add(plan)
    await db.flush()
    activity.record(
        db, staff, "care.start", f"Started the care plan {plan.name}, {_plan_price(plan)}",
        project_id=project.id, subject_type="care_plan", subject_id=plan.id,
    )
    invoices = await _bill_if_due(db, plan, project, staff)
    await svc.touch(db, project)
    await db.commit()

    svc.notify_client(project, f"Your care plan has started: {plan.name}, {_plan_price(plan)}")
    for invoice in invoices:
        svc.notify_client(project, care.invoice_notice(invoice))
    return await _reload(db, project_id, staff)


@router.patch("/care-plans/{plan_id}", response_model=ProjectDetail)
async def patch_care_plan(
    plan_id: UUID,
    payload: CarePlanPatch,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    plan = await db.get(CarePlan, plan_id, with_for_update=True)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Care plan not found")
    if plan.status == "ended":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This care plan has ended")
    project = await svc.load_project(db, plan.project_id, staff)

    sent = payload.model_fields_set
    changed = []
    for field, words in PLAN_FIELD_WORDS.items():
        if field not in sent:
            continue
        value = getattr(payload, field)
        # Only hours can be cleared; everything else keeps its value when sent as null.
        if value is None and field != "minutes_included":
            continue
        if field == "name":
            value = value.strip()
        if getattr(plan, field) != value:
            setattr(plan, field, value)
            changed.append(words)

    notice = None
    if payload.status and payload.status != plan.status:
        plan.status = payload.status
        if plan.status == "ended":
            plan.ended_on = date.today()
            notice = f"Your care plan {plan.name} has ended"
            activity.record(
                db, staff, "care.end", f"Ended the care plan {plan.name}",
                project_id=project.id, subject_type="care_plan", subject_id=plan.id,
            )
        elif plan.status == "paused":
            notice = f"Your care plan {plan.name} is paused"
            activity.record(
                db, staff, "care.pause", f"Paused the care plan {plan.name}",
                project_id=project.id, subject_type="care_plan", subject_id=plan.id,
            )
        else:
            notice = f"Your care plan {plan.name} is running again"
            activity.record(
                db, staff, "care.resume", f"Resumed the care plan {plan.name}",
                project_id=project.id, subject_type="care_plan", subject_id=plan.id,
            )
    if changed:
        activity.record(
            db, staff, "care.edit", f"Changed {', '.join(changed)} on the care plan {plan.name}",
            project_id=project.id, subject_type="care_plan", subject_id=plan.id,
        )

    invoices = await _bill_if_due(db, plan, project, staff)
    await svc.touch(db, project)
    await db.commit()
    if notice:
        svc.notify_client(project, notice)
    for invoice in invoices:
        svc.notify_client(project, care.invoice_notice(invoice))
    return await _reload(db, project.id, staff)


@router.get("/care-plans", response_model=list[CarePlanRow])
async def list_care_plans(db: AsyncSession = Depends(get_db)) -> list[CarePlanRow]:
    """Every plan that has not ended, soonest bill first."""

    plans = (
        await db.scalars(
            select(CarePlan)
            .where(CarePlan.status != "ended")
            .options(
                selectinload(CarePlan.project).selectinload(Project.client),
                selectinload(CarePlan.project).selectinload(Project.time_entries),
            )
            .order_by(CarePlan.next_bill_on)
        )
    ).all()
    rows = []
    for plan in plans:
        project = plan.project
        rows.append(
            CarePlanRow(
                id=plan.id,
                project_id=project.id,
                project_reference=project.reference,
                project_title=project.title,
                client_name=svc.display_name(project.client),
                client_email=project.client.email if project.client else None,
                name=plan.name,
                amount_cents=plan.amount_cents,
                currency=plan.currency,
                interval=plan.interval,
                status=plan.status,
                next_bill_on=plan.next_bill_on,
                minutes_included=plan.minutes_included,
                minutes_used=care.minutes_used(project, plan) if plan.minutes_included else None,
            )
        )
    return rows


# --- time ---------------------------------------------------------------------


def _entry_out(entry: TimeEntry, me: User, with_project: bool = False) -> TimeEntryOut:
    return TimeEntryOut(
        id=entry.id,
        project_id=entry.project_id,
        user_id=entry.user_id,
        user_name=svc.display_name(entry.user),
        stage_id=entry.stage_id,
        stage_name=entry.stage.name if entry.stage else None,
        worked_on=entry.worked_on,
        minutes=entry.minutes,
        note=entry.note,
        mine=entry.user_id == me.id,
        project_reference=entry.project.reference if with_project else None,
        project_title=entry.project.title if with_project else None,
    )


def _totals(groups: dict) -> list[TimeTotal]:
    totals = [TimeTotal(id=key, name=name, minutes=minutes) for (key, name), minutes in groups.items()]
    return sorted(totals, key=lambda t: -t.minutes)


def _entry_options():
    return (selectinload(TimeEntry.user), selectinload(TimeEntry.stage), selectinload(TimeEntry.project))


async def _project_time(db: AsyncSession, project_id: UUID, me: User) -> ProjectTime:
    entries = (
        await db.scalars(
            select(TimeEntry)
            .where(TimeEntry.project_id == project_id)
            .options(*_entry_options())
            .order_by(TimeEntry.worked_on.desc(), TimeEntry.created_at.desc())
        )
    ).all()
    by_person: dict = defaultdict(int)
    by_stage: dict = defaultdict(int)
    for e in entries:
        by_person[(e.user_id, svc.display_name(e.user) or "Former team member")] += e.minutes
        by_stage[(e.stage_id, e.stage.name if e.stage else "Not for a step")] += e.minutes
    return ProjectTime(
        entries=[_entry_out(e, me) for e in entries],
        total_minutes=sum(e.minutes for e in entries),
        by_person=_totals(by_person),
        by_stage=_totals(by_stage),
    )


async def _check_stage(db: AsyncSession, project: Project, stage_id: UUID | None) -> None:
    if stage_id is not None and not any(s.id == stage_id for s in project.stages):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That step is not on this project")


def _check_day(day: date) -> None:
    if day > date.today() + timedelta(days=1):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Time can't be logged ahead")


@router.get("/projects/{project_id}/time", response_model=ProjectTime)
async def project_time(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectTime:
    await svc.load_project(db, project_id, staff)
    return await _project_time(db, project_id, staff)


@router.post("/projects/{project_id}/time", response_model=ProjectTime, status_code=status.HTTP_201_CREATED)
async def log_time(
    project_id: UUID,
    payload: TimeEntryIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectTime:
    project = await svc.load_project(db, project_id, staff)
    await _check_stage(db, project, payload.stage_id)
    _check_day(payload.worked_on)
    entry = TimeEntry(
        project_id=project.id,
        user_id=staff.id,
        stage_id=payload.stage_id,
        worked_on=payload.worked_on,
        minutes=payload.minutes,
        note=payload.note,
    )
    db.add(entry)
    await db.flush()
    activity.record(
        db, staff, "time.log", f"Logged {_hours(entry.minutes)} on {entry.worked_on:%d %b}",
        project_id=project.id, subject_type="time_entry", subject_id=entry.id,
    )
    await db.commit()
    return await _project_time(db, project.id, staff)


async def _own_entry(db: AsyncSession, entry_id: UUID, staff: User) -> TimeEntry:
    entry = await db.get(TimeEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time entry not found")
    if entry.user_id != staff.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the person who logged this can change it")
    return entry


@router.patch("/time/{entry_id}", response_model=ProjectTime)
async def edit_time(
    entry_id: UUID,
    payload: TimeEntryIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectTime:
    entry = await _own_entry(db, entry_id, staff)
    project = await svc.load_project(db, entry.project_id, staff)
    await _check_stage(db, project, payload.stage_id)
    _check_day(payload.worked_on)
    entry.worked_on = payload.worked_on
    entry.minutes = payload.minutes
    entry.stage_id = payload.stage_id
    entry.note = payload.note
    activity.record(
        db, staff, "time.edit", f"Changed time logged on {entry.worked_on:%d %b} to {_hours(entry.minutes)}",
        project_id=project.id, subject_type="time_entry", subject_id=entry.id,
    )
    await db.commit()
    return await _project_time(db, project.id, staff)


@router.delete("/time/{entry_id}", response_model=ProjectTime)
async def delete_time(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectTime:
    entry = await _own_entry(db, entry_id, staff)
    project_id = entry.project_id
    activity.record(
        db, staff, "time.delete", f"Removed {_hours(entry.minutes)} logged on {entry.worked_on:%d %b}",
        project_id=project_id, subject_type="time_entry", subject_id=entry.id,
    )
    await db.delete(entry)
    await db.commit()
    return await _project_time(db, project_id, staff)


@router.get("/time", response_model=TimeSheet)
async def timesheet(
    start: date = Query(...),
    end: date = Query(...),
    user_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> TimeSheet:
    """Time logged from `start` to `end`, both included. Everyone's, or one person's."""

    if end < start or (end - start).days >= MAX_SHEET_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Pick a range of up to {MAX_SHEET_DAYS} days",
        )
    query = (
        select(TimeEntry)
        .where(TimeEntry.worked_on >= start, TimeEntry.worked_on <= end)
        .options(*_entry_options())
        .order_by(TimeEntry.worked_on, TimeEntry.created_at)
    )
    if user_id is not None:
        query = query.where(TimeEntry.user_id == user_id)
    entries = (await db.scalars(query)).all()
    by_project: dict = defaultdict(int)
    for e in entries:
        by_project[(e.project_id, f"{e.project.reference} {e.project.title}")] += e.minutes
    return TimeSheet(
        start=start,
        end=end,
        entries=[_entry_out(e, staff, with_project=True) for e in entries],
        total_minutes=sum(e.minutes for e in entries),
        by_project=_totals(by_project),
    )
