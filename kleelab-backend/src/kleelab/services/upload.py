import asyncio
import uuid
from pathlib import Path
from uuid import UUID

import boto3
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.models.asset import Asset

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "video/mp4", "application/pdf"}


def _detect_file_type(data: bytes) -> str:
    if len(data) >= 8 and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        return "video/mp4"
    if data.startswith(b"%PDF"):
        return "application/pdf"
    raise ValueError("File content does not match an allowed type")


async def upload_file(file: UploadFile, site_id: UUID | None, user_id: UUID, db: AsyncSession) -> Asset:
    if file.content_type not in ALLOWED_TYPES:
        raise ValueError("Unsupported file type")
    data = await file.read()
    detected_type = _detect_file_type(data)
    if detected_type != file.content_type:
        raise ValueError("File content does not match the provided Content-Type")
    limit = 50 * 1024 * 1024 if file.content_type == "video/mp4" else 10 * 1024 * 1024
    if len(data) > limit:
        raise ValueError("File exceeds the maximum allowed size")
    filename = f"{uuid.uuid4()}-{Path(file.filename or 'upload').name}"
    if not settings.AWS_S3_BUCKET:
        raise RuntimeError("AWS_S3_BUCKET is not configured")
    key = f"sites/{site_id}/assets/{filename}" if site_id else f"users/{user_id}/assets/{filename}"
    client = boto3.client("s3", region_name=settings.AWS_REGION)
    await asyncio.to_thread(
        client.put_object,
        Bucket=settings.AWS_S3_BUCKET,
        Key=key,
        Body=data,
        ContentType=file.content_type,
        ACL="public-read",
    )
    url = f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
    asset = Asset(site_id=site_id, user_id=user_id, filename=file.filename or filename, file_type=file.content_type, file_size=len(data), url=url)
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


async def delete_asset(asset: Asset, db: AsyncSession) -> bool:
    if settings.AWS_S3_BUCKET:
        marker = "amazonaws.com/"
        key = asset.url.split(marker, 1)[1] if marker in asset.url else None
        if key:
            client = boto3.client("s3", region_name=settings.AWS_REGION)
            await asyncio.to_thread(client.delete_object, Bucket=settings.AWS_S3_BUCKET, Key=key)
    await db.delete(asset)
    await db.commit()
    return True