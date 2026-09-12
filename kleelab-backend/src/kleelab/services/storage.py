"""Cloudinary uploads.

Implemented against Cloudinary's REST API using the standard library, so no
extra dependency is required. Configuration comes from the conventional
`cloudinary://<api_key>:<api_secret>@<cloud_name>` URI.
"""

import base64
import hashlib
import json
import time
from typing import Any
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from kleelab.core.config import settings

UPLOAD_TIMEOUT_SECONDS = 30
ALLOWED_IMAGE_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif",
}


class StorageNotConfigured(RuntimeError):
    """Raised when no media provider is configured."""


class StorageUploadFailed(RuntimeError):
    """Raised when the provider rejects or fails an upload."""


def _credentials() -> tuple[str, str, str]:
    raw = settings.CLOUDINARY_URL
    if not raw:
        raise StorageNotConfigured(
            "Image uploads are not configured. Set CLOUDINARY_URL "
            "(cloudinary://<api_key>:<api_secret>@<cloud_name>)."
        )

    parsed = urlsplit(raw)
    api_key = parsed.username or ""
    api_secret = parsed.password or ""
    cloud_name = parsed.hostname or ""
    if not (api_key and api_secret and cloud_name):
        raise StorageNotConfigured("CLOUDINARY_URL is malformed.")

    return api_key, api_secret, cloud_name


def is_configured() -> bool:
    """Whether an upload provider is available."""

    try:
        _credentials()
    except StorageNotConfigured:
        return False
    return True


def decode_data_url(value: str) -> tuple[bytes, str]:
    """Decode a `data:` URL into bytes and its content type."""

    header, separator, payload = value.partition(",")
    if not separator or not header.startswith("data:") or not payload:
        raise ValueError("Expected a base64 data URL.")

    meta = header[len("data:") :]
    content_type = meta.split(";")[0].strip().lower() or "application/octet-stream"
    try:
        data = base64.b64decode(payload, validate=True)
    except Exception as error:  # noqa: BLE001 - surfaced as a validation error
        raise ValueError("Image data is not valid base64.") from error
    return data, content_type


def upload_image(data: bytes, content_type: str, folder: str | None = None) -> dict[str, Any]:
    """Upload image bytes to Cloudinary and return the API response."""

    api_key, api_secret, cloud_name = _credentials()
    target_folder = folder or settings.CLOUDINARY_FOLDER

    timestamp = int(time.time())
    signed = {"folder": target_folder, "timestamp": timestamp}
    to_sign = "&".join(f"{key}={signed[key]}" for key in sorted(signed))
    signature = hashlib.sha1(f"{to_sign}{api_secret}".encode()).hexdigest()

    body = urlencode(
        {
            **signed,
            "api_key": api_key,
            "signature": signature,
            "file": f"data:{content_type};base64,{base64.b64encode(data).decode()}",
        }
    ).encode()

    request = Request(
        f"https://api.cloudinary.com/v1_1/{cloud_name}/image/upload",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=UPLOAD_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode())
    except Exception as error:  # noqa: BLE001 - normalised for the API layer
        raise StorageUploadFailed(f"Upload failed: {error}") from error
