"""
FiftyOne upload handler tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from unittest.mock import patch

import pytest

import fiftyone.core.storage as fos

from fiftyone.server.upload import (
    UploadError,
    UploadErrorCode,
    get_unique_path,
    stream_upload,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def enable_uploads(tmp_path):
    """Enable browser uploads with tmp_path as the allowed directory."""
    with patch("fiftyone.config.allow_browser_uploads", True), patch(
        "fiftyone.config.browser_uploads_dir", str(tmp_path)
    ):
        yield tmp_path


# =============================================================================
# Error types and utility functions
# =============================================================================


class TestUploadError:
    """UploadError provides structured error information."""

    def test_to_dict_basic(self):
        """Error serializes to dict with code and message."""
        err = UploadError(
            code=UploadErrorCode.PATH_REQUIRED,
            message="Path is required",
        )
        result = err.to_dict()

        assert result == {
            "error": {
                "code": "PATH_REQUIRED",
                "message": "Path is required",
            }
        }

    def test_to_dict_with_details(self):
        """Error includes details when provided."""
        err = UploadError(
            code=UploadErrorCode.PATH_NOT_ALLOWED,
            message="Path not allowed",
            details={"path": "/etc/passwd", "allowed_base": "/data"},
        )
        result = err.to_dict()

        assert result["error"]["details"] == {
            "path": "/etc/passwd",
            "allowed_base": "/data",
        }

    def test_status_code_mapping(self):
        """Each error code maps to appropriate HTTP status."""
        cases = [
            (UploadErrorCode.UPLOADS_DISABLED, 403),
            (UploadErrorCode.PATH_REQUIRED, 400),
            (UploadErrorCode.PATH_INVALID, 400),
            (UploadErrorCode.PATH_NOT_ALLOWED, 403),
            (UploadErrorCode.WRITE_FAILED, 500),
            (UploadErrorCode.STORAGE_FULL, 507),
        ]
        for code, expected_status in cases:
            err = UploadError(code=code, message="test")
            assert (
                err.status_code == expected_status
            ), f"{code} should be {expected_status}"


class TestGetUniquePath:
    """get_unique_path handles filename collisions."""

    def test_returns_original_when_not_exists(self, tmp_path):
        """Returns original path if file doesn't exist."""
        path = str(tmp_path / "new_file.png")
        assert get_unique_path(path) == path

    def test_appends_1_when_exists(self, tmp_path):
        """Appends _1 when original file exists."""
        existing = tmp_path / "photo.png"
        existing.touch()

        result = get_unique_path(str(existing))

        assert result == str(tmp_path / "photo_1.png")

    def test_increments_sequentially(self, tmp_path):
        """Finds next available number in sequence."""
        (tmp_path / "photo.png").touch()
        (tmp_path / "photo_1.png").touch()
        (tmp_path / "photo_2.png").touch()

        result = get_unique_path(str(tmp_path / "photo.png"))

        assert result == str(tmp_path / "photo_3.png")

    def test_continues_from_existing_number(self, tmp_path):
        """When input already has number, continues from there."""
        (tmp_path / "photo_5.png").touch()

        result = get_unique_path(str(tmp_path / "photo_5.png"))

        assert result == str(tmp_path / "photo_6.png")

    def test_preserves_extension(self, tmp_path):
        """File extension is preserved correctly."""
        (tmp_path / "data.json").touch()

        result = get_unique_path(str(tmp_path / "data.json"))

        assert result.endswith(".json")
        assert result == str(tmp_path / "data_1.json")

    def test_handles_no_extension(self, tmp_path):
        """Works with files that have no extension."""
        (tmp_path / "README").touch()

        result = get_unique_path(str(tmp_path / "README"))

        assert result == str(tmp_path / "README_1")

    def test_handles_multiple_dots(self, tmp_path):
        """Handles filenames with multiple dots."""
        (tmp_path / "archive.tar.gz").touch()

        result = get_unique_path(str(tmp_path / "archive.tar.gz"))

        # Should treat .gz as extension: archive.tar_1.gz
        assert result == str(tmp_path / "archive.tar_1.gz")


# =============================================================================
# Config options
# =============================================================================


class TestUploadConfig:
    """Upload feature respects FiftyOne config."""

    def test_allow_browser_uploads_config_exists(self):
        """Config has allow_browser_uploads attribute."""
        import fiftyone as fo

        assert hasattr(fo.config, "allow_browser_uploads")

    def test_browser_uploads_dir_config_exists(self):
        """Config has browser_uploads_dir attribute."""
        import fiftyone as fo

        assert hasattr(fo.config, "browser_uploads_dir")


# =============================================================================
# Upload handler core logic
# =============================================================================


class TestStreamUpload:
    """stream_upload handles file uploads with validation."""

    @pytest.mark.asyncio
    async def test_rejects_when_feature_disabled(self):
        """Raises UPLOADS_DISABLED when config flag is False."""

        async def mock_stream():
            yield b"data"

        with patch("fiftyone.config.allow_browser_uploads", False):
            with pytest.raises(UploadError) as exc_info:
                await stream_upload(mock_stream(), "/any/path.png")

            assert exc_info.value.code == UploadErrorCode.UPLOADS_DISABLED

    @pytest.mark.asyncio
    async def test_rejects_when_no_uploads_dir_configured(self):
        """Raises error when feature enabled but no directory set."""

        async def mock_stream():
            yield b"data"

        with patch("fiftyone.config.allow_browser_uploads", True), patch(
            "fiftyone.config.browser_uploads_dir", None
        ):
            with pytest.raises(UploadError) as exc_info:
                await stream_upload(mock_stream(), "/any/path.png")

            assert exc_info.value.code == UploadErrorCode.PATH_NOT_ALLOWED

    @pytest.mark.asyncio
    async def test_rejects_missing_path(self, enable_uploads):
        """Raises PATH_REQUIRED when path is empty."""

        async def mock_stream():
            yield b"data"

        with pytest.raises(UploadError) as exc_info:
            await stream_upload(mock_stream(), "")

        assert exc_info.value.code == UploadErrorCode.PATH_REQUIRED

    @pytest.mark.asyncio
    async def test_rejects_path_outside_allowed_dir(self, enable_uploads):
        """Raises PATH_NOT_ALLOWED for paths outside configured directory."""

        async def mock_stream():
            yield b"data"

        with pytest.raises(UploadError) as exc_info:
            await stream_upload(mock_stream(), "/etc/passwd")

        assert exc_info.value.code == UploadErrorCode.PATH_NOT_ALLOWED

    @pytest.mark.asyncio
    async def test_rejects_path_traversal_attack(self, enable_uploads):
        """Rejects paths that try to escape via ../"""

        async def mock_stream():
            yield b"data"

        malicious_path = str(enable_uploads / ".." / ".." / "etc" / "passwd")

        with pytest.raises(UploadError) as exc_info:
            await stream_upload(mock_stream(), malicious_path)

        assert exc_info.value.code == UploadErrorCode.PATH_NOT_ALLOWED

    @pytest.mark.asyncio
    async def test_writes_file_successfully(self, enable_uploads):
        """Successfully writes streamed data to file."""
        data = b"Hello, World!"

        async def mock_stream():
            yield data

        dest = str(enable_uploads / "test.txt")
        result = await stream_upload(mock_stream(), dest)

        assert result == dest
        assert fos.read_file(dest, binary=True) == data

    @pytest.mark.asyncio
    async def test_handles_chunked_stream(self, enable_uploads):
        """Correctly reassembles chunked data."""
        chunks = [b"chunk1", b"chunk2", b"chunk3"]

        async def mock_stream():
            for chunk in chunks:
                yield chunk

        dest = str(enable_uploads / "chunked.bin")
        result = await stream_upload(mock_stream(), dest)

        assert fos.read_file(result, binary=True) == b"chunk1chunk2chunk3"

    @pytest.mark.asyncio
    async def test_creates_parent_directories(self, enable_uploads):
        """Creates nested directories if they don't exist."""

        async def mock_stream():
            yield b"data"

        dest = str(enable_uploads / "nested" / "deep" / "file.txt")
        result = await stream_upload(mock_stream(), dest)

        assert fos.exists(result)

    @pytest.mark.asyncio
    async def test_returns_incremented_path_on_collision(self, enable_uploads):
        """Returns new path when file already exists."""
        # Create existing file
        existing = enable_uploads / "photo.png"
        existing.write_bytes(b"existing")

        async def mock_stream():
            yield b"new data"

        result = await stream_upload(mock_stream(), str(existing))

        assert result == str(enable_uploads / "photo_1.png")
        assert fos.read_file(result, binary=True) == b"new data"
        # Original unchanged
        assert fos.read_file(str(existing), binary=True) == b"existing"

    @pytest.mark.asyncio
    async def test_handles_empty_stream(self, enable_uploads):
        """Creates empty file for empty stream."""

        async def mock_stream():
            return
            yield  # Makes this an async generator

        dest = str(enable_uploads / "empty.txt")
        result = await stream_upload(mock_stream(), dest)

        assert fos.exists(result)
        assert fos.read_file(result, binary=True) == b""


# =============================================================================
# Windows compatibility tests
# =============================================================================


class TestGetUniquePathWindows:
    """get_unique_path handles Windows-style paths correctly."""

    def test_handles_windows_path_separator(self):
        """Handles backslash path separators."""
        with patch("fiftyone.core.storage.exists", return_value=False):
            # Windows-style path should be returned as-is when file doesn't exist
            path = r"C:\Users\test\uploads\photo.png"
            result = get_unique_path(path)
            assert result == path

    def test_increments_windows_path(self):
        """Correctly increments Windows paths with backslashes."""

        def mock_exists(p):
            # Simulate photo.png exists, photo_1.png does not
            return p == r"C:\Users\test\uploads\photo.png"

        with patch("fiftyone.core.storage.exists", side_effect=mock_exists):
            result = get_unique_path(r"C:\Users\test\uploads\photo.png")
            assert result == r"C:\Users\test\uploads\photo_1.png"

    def test_handles_windows_drive_letter(self):
        """Preserves Windows drive letter in path."""

        def mock_exists(p):
            return p == r"D:\data\image.jpg"

        with patch("fiftyone.core.storage.exists", side_effect=mock_exists):
            result = get_unique_path(r"D:\data\image.jpg")
            assert result.startswith("D:")
            assert result == r"D:\data\image_1.jpg"

    def test_handles_unc_path(self):
        """Handles UNC network paths."""
        with patch("fiftyone.core.storage.exists", return_value=False):
            path = r"\\server\share\folder\file.png"
            result = get_unique_path(path)
            assert result == path

    def test_increments_unc_path(self):
        """Correctly increments UNC network paths."""

        def mock_exists(p):
            return p == r"\\server\share\folder\file.png"

        with patch("fiftyone.core.storage.exists", side_effect=mock_exists):
            result = get_unique_path(r"\\server\share\folder\file.png")
            assert result == r"\\server\share\folder\file_1.png"


class TestStreamUploadWindows:
    """stream_upload handles Windows paths correctly."""

    @pytest.mark.asyncio
    async def test_rejects_path_traversal_with_backslashes(
        self, enable_uploads
    ):
        """Detects path traversal attacks using backslashes."""

        async def mock_stream():
            yield b"data"

        # Try to escape using backslashes (Windows-style)
        malicious_path = str(enable_uploads) + r"\..\..\etc\passwd"

        with pytest.raises(UploadError) as exc_info:
            await stream_upload(mock_stream(), malicious_path)

        assert exc_info.value.code == UploadErrorCode.PATH_NOT_ALLOWED

    @pytest.mark.asyncio
    async def test_rejects_mixed_separator_traversal(self, enable_uploads):
        """Detects path traversal with mixed forward/back slashes."""

        async def mock_stream():
            yield b"data"

        # Mixed separators in traversal attempt
        malicious_path = str(enable_uploads) + r"/..\..\etc/passwd"

        with pytest.raises(UploadError) as exc_info:
            await stream_upload(mock_stream(), malicious_path)

        assert exc_info.value.code == UploadErrorCode.PATH_NOT_ALLOWED


# =============================================================================
# Integration tests
# =============================================================================


class TestUploadIntegration:
    """Integration tests with actual file I/O."""

    @pytest.mark.asyncio
    async def test_large_file_streaming(self, enable_uploads):
        """Large files are streamed without loading entirely into memory."""
        # 10MB of data in 1MB chunks
        chunk_size = 1024 * 1024
        num_chunks = 10

        async def large_stream():
            for _ in range(num_chunks):
                yield b"x" * chunk_size

        dest = str(enable_uploads / "large.bin")
        result = await stream_upload(large_stream(), dest)

        # Verify file size
        assert os.path.getsize(result) == chunk_size * num_chunks
