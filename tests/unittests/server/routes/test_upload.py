"""
FiftyOne upload route tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from fiftyone.server.routes.upload import Upload


@pytest.fixture
def enable_uploads(tmp_path):
    """Enable browser uploads with tmp_path as the allowed directory."""
    with patch("fiftyone.config.allow_browser_uploads", True), patch(
        "fiftyone.config.browser_uploads_dir", str(tmp_path)
    ):
        yield tmp_path


class TestUploadRoute:
    """HTTP route for file uploads."""

    @pytest.fixture
    def upload_endpoint(self):
        return Upload(
            scope={"type": "http"},
            receive=AsyncMock(),
            send=AsyncMock(),
        )

    @pytest.fixture
    def mock_request(self):
        def _create(path=None, body=b"test data"):
            request = MagicMock()
            request.query_params = {}
            if path:
                request.query_params["path"] = path

            async def stream():
                yield body

            request.stream = stream

            return request

        return _create

    @pytest.mark.asyncio
    async def test_successful_upload_returns_201(
        self, upload_endpoint, mock_request, enable_uploads
    ):
        """Successful upload returns 201 with path."""
        dest = str(enable_uploads / "file.png")
        request = mock_request(path=dest, body=b"PNG data")

        response = await upload_endpoint.post(request)

        assert response.status_code == 201
        data = json.loads(response.body)
        assert data["path"] == dest

    @pytest.mark.asyncio
    async def test_returns_incremented_path(
        self, upload_endpoint, mock_request, enable_uploads
    ):
        """Response contains actual path when incremented."""
        existing = enable_uploads / "file.png"
        existing.touch()

        request = mock_request(path=str(existing), body=b"data")

        response = await upload_endpoint.post(request)

        data = json.loads(response.body)
        assert data["path"] == str(enable_uploads / "file_1.png")

    @pytest.mark.asyncio
    async def test_disabled_returns_403(self, upload_endpoint, mock_request):
        """Returns 403 when uploads disabled."""
        request = mock_request(path="/some/path.png")

        with patch("fiftyone.config.allow_browser_uploads", False):
            response = await upload_endpoint.post(request)

        assert response.status_code == 403
        data = json.loads(response.body)
        assert data["error"]["code"] == "UPLOADS_DISABLED"

    @pytest.mark.asyncio
    async def test_missing_path_returns_400(
        self, upload_endpoint, mock_request, enable_uploads
    ):
        """Returns 400 when path not provided."""
        request = mock_request(path=None)

        response = await upload_endpoint.post(request)

        assert response.status_code == 400
        data = json.loads(response.body)
        assert data["error"]["code"] == "PATH_REQUIRED"

    @pytest.mark.asyncio
    async def test_path_outside_allowed_returns_403(
        self, upload_endpoint, mock_request, enable_uploads
    ):
        """Returns 403 for paths outside allowed directory."""
        request = mock_request(path="/etc/passwd")

        response = await upload_endpoint.post(request)

        assert response.status_code == 403
        data = json.loads(response.body)
        assert data["error"]["code"] == "PATH_NOT_ALLOWED"
