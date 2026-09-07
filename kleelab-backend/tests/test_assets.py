import pytest


@pytest.mark.asyncio
async def test_asset_upload_without_s3_bucket(client, auth_headers):
    # Create site
    site_res = await client.post(
        "/api/sites",
        json={"name": "Asset Site", "subdomain": "assetsite"},
        headers=auth_headers,
    )
    site_id = site_res.json()["id"]

    # Valid PNG binary header
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"

    # Attempt asset upload when AWS_S3_BUCKET is not set should return 400 Bad Request
    files = {"file": ("test.png", png_bytes, "image/png")}
    upload_res = await client.post(
        f"/api/sites/{site_id}/assets",
        files=files,
        headers=auth_headers,
    )
    assert upload_res.status_code == 400
    assert "AWS_S3_BUCKET is not configured" in upload_res.json()["error"]["message"]
