"""Product request and response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    price: float = Field(ge=0)
    images: list[str] | None = None
    stock: int = Field(default=0, ge=0)
    category: str | None = None
    variants: dict | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: float | None = Field(default=None, ge=0)
    images: list[str] | None = None
    stock: int | None = Field(default=None, ge=0)
    category: str | None = None
    variants: dict | None = None
    is_active: bool | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    site_id: UUID
    name: str
    description: str | None
    price: float
    images: list[str] | None
    stock: int
    category: str | None
    variants: dict | None
    is_active: bool
    created_at: datetime
    updated_at: datetime