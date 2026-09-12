from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AssetUpload(BaseModel):
    """A base64 `data:` URL. Sending JSON avoids a multipart dependency."""

    filename: str = Field(min_length=1, max_length=255)
    data: str = Field(min_length=32)


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    site_id: UUID | None
    filename: str
    file_type: str
    file_size: int
    url: str
    created_at: datetime