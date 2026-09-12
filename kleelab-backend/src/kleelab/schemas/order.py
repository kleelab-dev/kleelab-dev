"""Order request and response schemas.

There is no `OrderCreate` here on purpose. Order intake lives in the storefront
router and its request body carries no price at all; the owner-facing surface can
list, read and re-status orders but cannot invent one.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class OrderUpdate(BaseModel):
    status: str | None = None


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    site_id: UUID
    customer_email: str
    customer_name: str | None
    total: float
    currency: str
    status: str
    items: list[dict]
    created_at: datetime
    updated_at: datetime