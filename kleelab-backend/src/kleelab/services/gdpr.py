from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.models.asset import Asset
from kleelab.models.order import Order
from kleelab.models.page import Page
from kleelab.models.product import Product
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.services import storage


async def export_user_data(user_id: UUID, db: AsyncSession) -> dict:
    user = await db.get(User, user_id)
    sites = list((await db.execute(select(Site).where(Site.user_id == user_id))).scalars().all())
    site_ids = [site.id for site in sites]
    pages = list((await db.execute(select(Page).where(Page.site_id.in_(site_ids)))).scalars().all()) if site_ids else []
    products = list((await db.execute(select(Product).where(Product.site_id.in_(site_ids)))).scalars().all()) if site_ids else []
    orders = list((await db.execute(select(Order).where(Order.site_id.in_(site_ids)))).scalars().all()) if site_ids else []
    assets = list((await db.execute(select(Asset).where(Asset.user_id == user_id))).scalars().all())
    return {"user": {"id": str(user.id), "email": user.email, "full_name": user.full_name}, "sites": [{"id": str(site.id), "name": site.name} for site in sites], "pages": [{"id": str(page.id), "title": page.title, "content": page.content} for page in pages], "products": [{"id": str(product.id), "name": product.name} for product in products], "orders": [{"id": str(order.id), "total": str(order.total), "status": order.status} for order in orders], "assets": [{"id": str(asset.id), "url": asset.url} for asset in assets], "created_at": datetime.now(timezone.utc).isoformat()}


async def delete_user_data(user_id: UUID, db: AsyncSession) -> bool:
    user_assets = list((await db.execute(select(Asset).where(Asset.user_id == user_id))).scalars().all())
    site_ids = [site.id for site in (await db.execute(select(Site).where(Site.user_id == user_id))).scalars().all()]
    if site_ids:
        user_assets.extend((await db.execute(select(Asset).where(Asset.site_id.in_(site_ids)))).scalars().all())

    # Collect provider handles before the rows (and with them the only reference to
    # the uploaded files) are removed. Erasing an account must reclaim storage, not
    # just forget about it.
    public_ids = list({asset.public_id for asset in user_assets if asset.public_id})

    for asset in list(dict.fromkeys(user_assets)):
        await db.delete(asset)

    await db.execute(delete(Order).where(Order.site_id.in_(site_ids)))
    await db.execute(delete(Product).where(Product.site_id.in_(site_ids)))
    await db.execute(delete(Page).where(Page.site_id.in_(site_ids)))
    await db.execute(delete(Site).where(Site.user_id == user_id))
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()

    await storage.destroy_images(public_ids)
    return True