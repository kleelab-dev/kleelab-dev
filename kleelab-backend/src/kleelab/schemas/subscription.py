from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PlanType(str, Enum):
    FREE = "free"
    PRO = "pro"
    BUSINESS = "business"


class SubscriptionCreate(BaseModel):
    plan: PlanType


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    plan: str
    status: str
    current_period_end: datetime | None
    created_at: datetime