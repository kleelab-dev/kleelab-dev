from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    category: str
    preview_image: str | None
    thumbnail: str | None
    config: dict[str, Any]
    is_premium: bool
    created_at: datetime