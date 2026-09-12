"""Order management API routes.

Owner-facing. There is deliberately no order-creation endpoint here: orders
arrive from shoppers through the storefront router, which computes the total from
stored prices. The previous `POST /orders` accepted a client-supplied `total`, so
whoever called it chose their own price.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.order import Order
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.schemas.order import OrderOut, OrderUpdate


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