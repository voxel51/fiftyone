"""
FiftyOne file operations route tests.

Tests for the POST /files/upload and DELETE /files HTTP endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from fiftyone.server.routes.files import FileUpload, FileDelete


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def enable_file_ops(tmp_path):
    """Enable browser file operations with tmp_path as the allowed directory."""
    with patch(
        "fiftyone.config.allow_browser_file_operations", new=True
    ), patch("fiftyone.config.browser_file_operations_dir", new=str(tmp_path)):
        yield tmp_path


# =============================================================================
# Upload route
# =============================================================================


class TestFileUploadRoute:
    """POST /files/upload HTTP route."""

    @pytest.fixture
    def upload_endpoint(self):
        return FileUpload(
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
        self, upload_endpoint, mock_request, enable_file_ops
    ):
        """Successful upload returns 201 with path."""
        dest = str(enable_file_ops / "file.png")
        request = mock_request(path=dest, body=b"PNG data")

        response = await upload_endpoint.post(request)

        assert response.status_code == 201
        data = json.loads(response.body)
        assert data["path"] == dest

    @pytest.mark.asyncio
    async def test_success_response_has_path_no_error(
        self, upload_endpoint, mock_request, enable_file_ops
    ):
        """Success response has 'path' key and no 'error' key."""
        dest = str(enable_file_ops / "file.png")
        request = mock_request(path=dest, body=b"data")

        response = await upload_endpoint.post(request)
        data = json.loads(response.body)

        assert "path" in data
        assert "error" not in data

    @pytest.mark.asyncio
    async def test_returns_incremented_path(
        self, upload_endpoint, mock_request, enable_file_ops
    ):
        """Response contains actual path when incremented."""
        existing = enable_file_ops / "file.png"
        existing.touch()

        request = mock_request(path=str(existing), body=b"data")

        response = await upload_endpoint.post(request)

        data = json.loads(response.body)
        assert data["path"] == str(enable_file_ops / "file_1.png")

    @pytest.mark.asyncio
    async def test_disabled_returns_403(self, upload_endpoint, mock_request):
        """Returns 403 when file operations disabled."""
        request = mock_request(path="/some/path.png")

        with patch("fiftyone.config.allow_browser_file_operations", new=False):
            response = await upload_endpoint.post(request)

        assert response.status_code == 403
        data = json.loads(response.body)
        assert data["error"]["code"] == "FEATURE_DISABLED"

    @pytest.mark.asyncio
    async def test_error_response_has_error_no_path(
        self, upload_endpoint, mock_request
    ):
        """Error response has 'error' key and no 'path' key."""
        request = mock_request(path="/some/path.png")

        with patch("fiftyone.config.allow_browser_file_operations", new=False):
            response = await upload_endpoint.post(request)

        data = json.loads(response.body)

        assert "error" in data
        assert "path" not in data

    @pytest.mark.asyncio
    async def test_missing_path_returns_400(
        self, upload_endpoint, mock_request, enable_file_ops
    ):
        """Returns 400 when path not provided."""
        request = mock_request(path=None)

        response = await upload_endpoint.post(request)

        assert response.status_code == 400
        data = json.loads(response.body)
        assert data["error"]["code"] == "PATH_REQUIRED"

    @pytest.mark.asyncio
    async def test_path_outside_allowed_returns_403(
        self, upload_endpoint, mock_request, enable_file_ops
    ):
        """Returns 403 for paths outside allowed directory."""
        request = mock_request(path="/etc/passwd")

        response = await upload_endpoint.post(request)

        assert response.status_code == 403
        data = json.loads(response.body)
        assert data["error"]["code"] == "PATH_NOT_ALLOWED"


# =============================================================================
# Delete route
# =============================================================================


class TestFileDeleteRoute:
    """DELETE /files HTTP route."""

    @pytest.fixture
    def delete_endpoint(self):
        return FileDelete(
            scope={"type": "http"},
            receive=AsyncMock(),
            send=AsyncMock(),
        )

    @pytest.fixture
    def mock_request(self):
        def _create(path=None):
            request = MagicMock()
            request.query_params = {}
            if path:
                request.query_params["path"] = path
            return request

        return _create

    @pytest.mark.asyncio
    async def test_successful_delete_returns_204(
        self, delete_endpoint, mock_request, enable_file_ops
    ):
        """Successful delete returns 204 No Content."""
        target = enable_file_ops / "to_delete.png"
        target.write_bytes(b"delete me")

        request = mock_request(path=str(target))

        response = await delete_endpoint.delete(request)

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_missing_file_returns_204(
        self, delete_endpoint, mock_request, enable_file_ops
    ):
        """Returns 204 even when file doesn't exist (idempotent)."""
        nonexistent = str(enable_file_ops / "never_existed.png")
        request = mock_request(path=nonexistent)

        response = await delete_endpoint.delete(request)

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_disabled_returns_403(self, delete_endpoint, mock_request):
        """Returns 403 when file operations disabled."""
        request = mock_request(path="/some/path.png")

        with patch("fiftyone.config.allow_browser_file_operations", new=False):
            response = await delete_endpoint.delete(request)

        assert response.status_code == 403
        data = json.loads(response.body)
        assert data["error"]["code"] == "FEATURE_DISABLED"

    @pytest.mark.asyncio
    async def test_missing_path_returns_400(
        self, delete_endpoint, mock_request, enable_file_ops
    ):
        """Returns 400 when path not provided."""
        request = mock_request(path=None)

        response = await delete_endpoint.delete(request)

        assert response.status_code == 400
        data = json.loads(response.body)
        assert data["error"]["code"] == "PATH_REQUIRED"

    @pytest.mark.asyncio
    async def test_path_outside_allowed_returns_403(
        self, delete_endpoint, mock_request, enable_file_ops
    ):
        """Returns 403 for paths outside allowed directory."""
        request = mock_request(path="/etc/passwd")

        response = await delete_endpoint.delete(request)

        assert response.status_code == 403
        data = json.loads(response.body)
        assert data["error"]["code"] == "PATH_NOT_ALLOWED"

    @pytest.mark.asyncio
    async def test_directory_returns_400(
        self, delete_endpoint, mock_request, enable_file_ops
    ):
        """Returns 400 when trying to delete a directory."""
        dir_path = enable_file_ops / "some_dir"
        dir_path.mkdir()

        request = mock_request(path=str(dir_path))

        response = await delete_endpoint.delete(request)

        assert response.status_code == 400
        data = json.loads(response.body)
        assert data["error"]["code"] == "NOT_A_FILE"
