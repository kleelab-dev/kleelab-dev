from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PageVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    page_id: UUID
    content: dict[str, Any]
    version: int
    created_at: datetime