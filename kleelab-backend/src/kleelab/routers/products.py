"""Product CRUD API routes."""

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.product import Product
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.schemas.product import ProductCreate, ProductOut, ProductUpdate


router = APIRouter(prefix="/api/sites/{site_id}/products", tags=["products"])


async def verify_site_ownership(site_id: UUID, current_user: User, db: AsyncSession) -> Site:
    result = await db.execute(
        select(Site).where(Site.id == site_id, Site.user_id == current_user.id)
    )
    site = result.scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


async def get_owned_product(
    site_id: UUID, product_id: UUID, current_user: User, db: AsyncSession
) -> Product:
    await verify_site_ownership(site_id, current_user, db)
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.site_id == site_id)
    )
    product = result.scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@router.get("", response_model=list[ProductOut])
@router.get("/", response_model=list[ProductOut], include_in_schema=False)
async def list_products(
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Product]:
    await verify_site_ownership(site_id, current_user, db)
    result = await db.execute(select(Product).where(Product.site_id == site_id))
    return list(result.scalars().all())


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ProductOut, include_in_schema=False)
async def create_product(
    site_id: UUID,
    product_data: ProductCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Product:
    await verify_site_ownership(site_id, current_user, db)
    product = Product(
        site_id=site_id,
        price=Decimal(str(product_data.price)),
        **product_data.model_dump(exclude={"price"}),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(
    site_id: UUID,
    product_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Product:
    return await get_owned_product(site_id, product_id, current_user, db)


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    site_id: UUID,
    product_id: UUID,
    product_data: ProductUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Product:
    product = await get_owned_product(site_id, product_id, current_user, db)
    updates = product_data.model_dump(exclude_unset=True)
    if "price" in updates:
        updates["price"] = Decimal(str(updates["price"]))
    for field, value in updates.items():
        setattr(product, field, value)
    await db.commit()
    await db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    site_id: UUID,
    product_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    product = await get_owned_product(site_id, product_id, current_user, db)
    await db.delete(product)
    await db.commit()