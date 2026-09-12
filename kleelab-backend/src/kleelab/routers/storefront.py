"""Public storefront: browsing products and placing an order.

Anyone can call these — a shopper is a visitor to a published site, not a KleeLab
user. Everything that determines money is decided here, on the server:

- the price comes from the stored product, never from the request body;
- line items are validated against this site's own active products;
- stock is reserved with a conditional update, so two simultaneous orders cannot
  both claim the last item;
- the order stores a snapshot of names and prices, because products are editable
  and deletable and an order must stay readable regardless.
"""

import logging
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.models.order import Order
from kleelab.models.product import Product
from kleelab.models.site import Site
from kleelab.routers.public import get_published_site
from kleelab.schemas.storefront import PublicOrderCreate, PublicOrderOut, PublicProductOut
from kleelab.services.email import send_order_confirmation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public/sites/{subdomain}", tags=["storefront"])

MONEY = Decimal("0.01")


def to_product_out(product: Product, currency: str) -> PublicProductOut:
    return PublicProductOut(
        id=product.id,
        name=product.name,
        description=product.description,
        price=float(product.price),
        currency=currency,
        images=list(product.images or []),
        category=product.category,
        in_stock=product.stock > 0,
    )


async def require_storefront(site: Site, db: AsyncSession) -> None:
    """Only published sites are shoppable."""

    if not site.is_published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")


async def get_site(subdomain: str, db: AsyncSession) -> Site:
    site = await get_published_site(subdomain, db)
    await require_storefront(site, db)
    return site


@router.get("/products", response_model=list[PublicProductOut])
async def list_products(
    subdomain: str, db: AsyncSession = Depends(get_db)
) -> list[PublicProductOut]:
    """List what this site currently sells."""

    site = await get_site(subdomain, db)
    products = await db.scalars(
        select(Product)
        .where(Product.site_id == site.id, Product.is_active.is_(True))
        .order_by(Product.created_at)
    )
    return [to_product_out(product, site.currency) for product in products]


@router.post(
    "/orders",
    response_model=PublicOrderOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_order(
    subdomain: str,
    payload: PublicOrderCreate,
    db: AsyncSession = Depends(get_db),
) -> PublicOrderOut:
    """Place an order against a published site."""

    site = await get_site(subdomain, db)

    # Collapse repeated lines for the same product. Without this, four separate
    # lines of 25 would slip past a per-line cap and exceed available stock.
    wanted: dict[UUID, int] = {}
    for line in payload.items:
        wanted[line.product_id] = wanted.get(line.product_id, 0) + line.quantity

    products = await db.scalars(
        select(Product).where(
            Product.id.in_(wanted.keys()),
            Product.site_id == site.id,
            Product.is_active.is_(True),
        )
    )
    by_id = {product.id: product for product in products}

    # One message for "unknown", "not yours" and "withdrawn": a shopper has no
    # business learning which of those it was about someone else's product.
    if len(by_id) != len(wanted):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Some items are no longer available. Refresh the page and try again.",
        )

    # Captured up front: reading an ORM attribute *after* a rollback would try to
    # lazy-load it, and a synchronous lazy load inside async code raises
    # MissingGreenlet instead of the error we actually want to return.
    names = {product_id: product.name for product_id, product in by_id.items()}

    lines: list[dict] = []
    total = Decimal("0")

    for product_id, quantity in wanted.items():
        product = by_id[product_id]
        unit_price = Decimal(product.price)
        line_total = (unit_price * quantity).quantize(MONEY)
        total += line_total
        lines.append(
            {
                "product_id": str(product.id),
                "name": product.name,
                "unit_price": float(unit_price),
                "quantity": quantity,
                "line_total": float(line_total),
            }
        )

    total = total.quantize(MONEY)

    # Reserve stock. The comparison lives in the WHERE clause so the check and
    # the decrement are one atomic statement; reading the stock first and then
    # writing would let two orders both pass the check.
    for product_id, quantity in wanted.items():
        result = await db.execute(
            update(Product)
            .where(Product.id == product_id, Product.stock >= quantity)
            .values(stock=Product.stock - quantity)
        )
        if result.rowcount == 0:
            # Abandon the whole basket: a partial reservation would leave stock
            # held for an order that never happened.
            name = names[product_id]
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"'{name}' sold out while you were ordering. Nothing has been charged.",
            )

    order = Order(
        site_id=site.id,
        customer_email=str(payload.customer_email).lower(),
        customer_name=payload.customer_name,
        total=total,
        currency=site.currency,
        status="pending",
        items=lines,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    try:
        send_order_confirmation(order.customer_email, str(order.id), order.items, float(total))
    except Exception:  # noqa: BLE001 - the order is already committed
        # The order exists and the stock is reserved. Failing here would tell the
        # shopper nothing was ordered, and they would order again.
        logger.exception("Could not send the confirmation for order %s", order.id)

    return PublicOrderOut(
        id=order.id,
        status=order.status,
        total=float(order.total),
        currency=order.currency,
        items=order.items,
        created_at=order.created_at,
    )
