from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    site_id: UUID | None
    filename: str
    file_type: str
    file_size: int
    url: str
    created_at: datetime