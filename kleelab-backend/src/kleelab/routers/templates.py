from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.models.template import Template
from kleelab.schemas.template import TemplateOut

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("", response_model=list[TemplateOut])
async def list_templates(category: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(Template).where(Template.is_active.is_(True))
    if category:
        query = query.where(Template.category == category)
    return list((await db.execute(query.order_by(Template.name))).scalars().all())


@router.get("/categories", response_model=list[str])
async def template_categories(db: AsyncSession = Depends(get_db)):
    return list((await db.execute(select(distinct(Template.category)).where(Template.is_active.is_(True)))).scalars().all())


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(template_id: UUID, db: AsyncSession = Depends(get_db)):
    template = await db.get(Template, template_id)
    if template is None or not template.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return template