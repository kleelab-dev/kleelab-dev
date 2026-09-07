"""Order management API routes."""

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.order import Order
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.schemas.order import OrderCreate, OrderOut, OrderUpdate
from kleelab.services.email import send_order_confirmation


router = APIRouter(prefix="/api/sites/{site_id}/orders", tags=["orders"])
ALLOWED_STATUSES = {"pending", "paid", "shipped", "delivered", "refunded"}


async def verify_site_ownership(site_id: UUID, current_user: User, db: AsyncSession) -> Site:
    result = await db.execute(
        select(Site).where(Site.id == site_id, Site.user_id == current_user.id)
    )
    site = result.scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


async def get_owned_order(
    site_id: UUID, order_id: UUID, current_user: User, db: AsyncSession
) -> Order:
    await verify_site_ownership(site_id, current_user, db)
    result = await db.execute(select(Order).where(Order.id == order_id, Order.site_id == site_id))
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


@router.get("", response_model=list[OrderOut])
@router.get("/", response_model=list[OrderOut], include_in_schema=False)
async def list_orders(
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Order]:
    await verify_site_ownership(site_id, current_user, db)
    result = await db.execute(select(Order).where(Order.site_id == site_id))
    return list(result.scalars().all())


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=OrderOut, include_in_schema=False)
async def create_order(
    site_id: UUID,
    order_data: OrderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Order:
    await verify_site_ownership(site_id, current_user, db)
    order = Order(
        site_id=site_id,
        total=Decimal(str(order_data.total)),
        **order_data.model_dump(exclude={"total"}),
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    send_order_confirmation(order.customer_email, str(order.id), order.items, float(order.total))
    return order


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    site_id: UUID,
    order_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Order:
    return await get_owned_order(site_id, order_id, current_user, db)


@router.put("/{order_id}/status", response_model=OrderOut)
async def update_order_status(
    site_id: UUID,
    order_id: UUID,
    order_data: OrderUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Order:
    order = await get_owned_order(site_id, order_id, current_user, db)
    if order_data.status is None or order_data.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid order status")
    order.status = order_data.status
    await db.commit()
    await db.refresh(order)
    return order