"""Order request and response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class OrderCreate(BaseModel):
    customer_email: EmailStr
    customer_name: str | None = None
    items: list[dict]
    total: float


class OrderUpdate(BaseModel):
    status: str | None = None


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    site_id: UUID
    customer_email: str
    customer_name: str | None
    total: float
    status: str
    items: list[dict]
    created_at: datetime
    updated_at: datetime