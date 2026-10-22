"""Project templates and saved replies."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TemplateStage(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=1000)


class TemplateChecklistItem(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=1000)


class ProjectTemplateIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    stages: list[TemplateStage] = Field(min_length=1, max_length=12)
    checklist: list[TemplateChecklistItem] = Field(default_factory=list, max_length=30)


class ProjectTemplateOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    stages: list[TemplateStage]
    checklist: list[TemplateChecklistItem]
    created_by_name: str | None
    updated_at: datetime


class TemplateFromProject(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class SavedReplyIn(BaseModel):
    title: str = Field(min_length=2, max_length=100)
    body: str = Field(min_length=1, max_length=5000)


class SavedReplyOut(BaseModel):
    id: UUID
    title: str
    body: str
    created_by_name: str | None
    updated_at: datetime
