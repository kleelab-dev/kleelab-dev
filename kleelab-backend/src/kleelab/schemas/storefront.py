"""Public storefront schemas.

Nothing here accepts a price. The buyer chooses *what* and *how many*; the server
decides what that costs.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class PublicProductOut(BaseModel):
    """A product as a shopper sees it.

    Deliberately omits the exact stock count. `in_stock` is what the shopper
    needs; publishing inventory levels tells competitors more than it helps
    customers.
    """

    id: UUID
    name: str
    description: str | None
    price: float
    currency: str
    images: list[str]
    category: str | None
    in_stock: bool


class OrderLineIn(BaseModel):
    """One line of a basket. There is no price field, by design."""

    product_id: UUID
    quantity: int = Field(ge=1, le=99)


class PublicOrderCreate(BaseModel):
    customer_email: EmailStr
    customer_name: str | None = Field(default=None, max_length=255)
    items: list[OrderLineIn] = Field(min_length=1, max_length=50)
    note: str | None = Field(default=None, max_length=1000)


class OrderLineOut(BaseModel):
    product_id: UUID
    name: str
    unit_price: float
    quantity: int
    line_total: float


class PublicOrderOut(BaseModel):
    """What the shopper gets back: a record of what they actually bought."""

    id: UUID
    status: str
    total: float
    currency: str
    items: list[OrderLineOut]
    created_at: datetime
