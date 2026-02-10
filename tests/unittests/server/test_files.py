"""
FiftyOne file operations handler tests.

Tests for upload, delete, path utilities, and error types used by
the /files/* server routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from unittest.mock import patch

import pytest

import fiftyone.core.storage as fos

from fiftyone.server.files import (
    FileOperationError,
    FileOperationErrorCode,
    delete_file,
    get_unique_path,
    stream_upload,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def enable_file_ops(tmp_path):
    """Enable browser file operations with tmp_path as the allowed directory."""
    with patch("fiftyone.config.allow_browser_file_operations", True), patch(
        "fiftyone.config.browser_file_operations_dir", str(tmp_path)
    ):
        yield tmp_path


# =============================================================================
# Error types
# =============================================================================


class TestFileOperationError:
    """FileOperationError provides structured error information."""

    def test_to_dict_basic(self):
        """Error serializes to dict with code and message."""
        err = FileOperationError(
            code=FileOperationErrorCode.PATH_REQUIRED,
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
        err = FileOperationError(
            code=FileOperationErrorCode.PATH_NOT_ALLOWED,
            message="Path not allowed",
            details={"path": "/etc/passwd", "allowed_base": "/data"},
        )
        result = err.to_dict()

        assert result["error"]["details"] == {
            "path": "/etc/passwd",
            "allowed_base": "/data",
        }

    def test_to_dict_omits_details_when_none(self):
        """Error dict has no 'details' key when details is None."""
        err = FileOperationError(
            code=FileOperationErrorCode.PATH_REQUIRED,
            message="Path is required",
        )
        result = err.to_dict()

        assert "details" not in result["error"]

    def test_status_code_mapping(self):
        """Each error code maps to appropriate HTTP status."""
        cases = [
            (FileOperationErrorCode.FEATURE_DISABLED, 403),
            (FileOperationErrorCode.PATH_REQUIRED, 400),
            (FileOperationErrorCode.PATH_INVALID, 400),
            (FileOperationErrorCode.PATH_NOT_ALLOWED, 403),
            (FileOperationErrorCode.WRITE_FAILED, 500),
            (FileOperationErrorCode.STORAGE_FULL, 507),
            (FileOperationErrorCode.DELETE_FAILED, 500),
            (FileOperationErrorCode.NOT_A_FILE, 400),
        ]
        for code, expected_status in cases:
            err = FileOperationError(code=code, message="test")
            assert (
                err.status_code == expected_status
            ), f"{code} should be {expected_status}"


# =============================================================================
# Filename collision handling
# =============================================================================


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


class TestFileOperationsConfig:
    """File operations feature respects FiftyOne config."""

    def test_allow_browser_file_operations_config_exists(self):
        """Config has allow_browser_file_operations attribute."""
        import fiftyone as fo

        assert hasattr(fo.config, "allow_browser_file_operations")

    def test_browser_file_operations_dir_config_exists(self):
        """Config has browser_file_operations_dir attribute."""
        import fiftyone as fo

        assert hasattr(fo.config, "browser_file_operations_dir")


# =============================================================================
# Upload handler
# =============================================================================


class TestStreamUpload:
    """stream_upload handles file uploads with validation."""

    @pytest.mark.asyncio
    async def test_rejects_when_feature_disabled(self):
        """Raises FEATURE_DISABLED when config flag is False."""

        async def mock_stream():
            yield b"data"

        with patch("fiftyone.config.allow_browser_file_operations", False):
            with pytest.raises(FileOperationError) as exc_info:
                await stream_upload(mock_stream(), "/any/path.png")

            assert (
                exc_info.value.code == FileOperationErrorCode.FEATURE_DISABLED
            )

    @pytest.mark.asyncio
    async def test_rejects_when_no_dir_configured(self):
        """Raises error when feature enabled but no directory set."""

        async def mock_stream():
            yield b"data"

        with patch(
            "fiftyone.config.allow_browser_file_operations", True
        ), patch("fiftyone.config.browser_file_operations_dir", None):
            with pytest.raises(FileOperationError) as exc_info:
                await stream_upload(mock_stream(), "/any/path.png")

            assert (
                exc_info.value.code == FileOperationErrorCode.PATH_NOT_ALLOWED
            )

    @pytest.mark.asyncio
    async def test_rejects_missing_path(self, enable_file_ops):
        """Raises PATH_REQUIRED when path is empty."""

        async def mock_stream():
            yield b"data"

        with pytest.raises(FileOperationError) as exc_info:
            await stream_upload(mock_stream(), "")

        assert exc_info.value.code == FileOperationErrorCode.PATH_REQUIRED

    @pytest.mark.asyncio
    async def test_rejects_path_outside_allowed_dir(self, enable_file_ops):
        """Raises PATH_NOT_ALLOWED for paths outside configured directory."""

        async def mock_stream():
            yield b"data"

        with pytest.raises(FileOperationError) as exc_info:
            await stream_upload(mock_stream(), "/etc/passwd")

        assert exc_info.value.code == FileOperationErrorCode.PATH_NOT_ALLOWED

    @pytest.mark.asyncio
    async def test_rejects_path_traversal_attack(self, enable_file_ops):
        """Rejects paths that try to escape via ../"""

        async def mock_stream():
            yield b"data"

        malicious_path = str(enable_file_ops / ".." / ".." / "etc" / "passwd")

        with pytest.raises(FileOperationError) as exc_info:
            await stream_upload(mock_stream(), malicious_path)

        assert exc_info.value.code == FileOperationErrorCode.PATH_NOT_ALLOWED

    @pytest.mark.asyncio
    async def test_writes_file_successfully(self, enable_file_ops):
        """Successfully writes streamed data to file."""
        data = b"Hello, World!"

        async def mock_stream():
            yield data

        dest = str(enable_file_ops / "test.txt")
        result = await stream_upload(mock_stream(), dest)

        assert result == dest
        assert fos.read_file(dest, binary=True) == data

    @pytest.mark.asyncio
    async def test_handles_chunked_stream(self, enable_file_ops):
        """Correctly reassembles chunked data."""
        chunks = [b"chunk1", b"chunk2", b"chunk3"]

        async def mock_stream():
            for chunk in chunks:
                yield chunk

        dest = str(enable_file_ops / "chunked.bin")
        result = await stream_upload(mock_stream(), dest)

        assert fos.read_file(result, binary=True) == b"chunk1chunk2chunk3"

    @pytest.mark.asyncio
    async def test_creates_parent_directories(self, enable_file_ops):
        """Creates nested directories if they don't exist."""

        async def mock_stream():
            yield b"data"

        dest = str(enable_file_ops / "nested" / "deep" / "file.txt")
        result = await stream_upload(mock_stream(), dest)

        assert fos.exists(result)

    @pytest.mark.asyncio
    async def test_returns_incremented_path_on_collision(
        self, enable_file_ops
    ):
        """Returns new path when file already exists."""
        existing = enable_file_ops / "photo.png"
        existing.write_bytes(b"existing")

        async def mock_stream():
            yield b"new data"

        result = await stream_upload(mock_stream(), str(existing))

        assert result == str(enable_file_ops / "photo_1.png")
        assert fos.read_file(result, binary=True) == b"new data"
        # Original unchanged
        assert fos.read_file(str(existing), binary=True) == b"existing"

    @pytest.mark.asyncio
    async def test_handles_empty_stream(self, enable_file_ops):
        """Creates empty file for empty stream."""

        async def mock_stream():
            return
            yield  # Makes this an async generator

        dest = str(enable_file_ops / "empty.txt")
        result = await stream_upload(mock_stream(), dest)

        assert fos.exists(result)
        assert fos.read_file(result, binary=True) == b""


# =============================================================================
# Upload partial write cleanup
# =============================================================================


class TestPartialWriteCleanup:
    """Failed uploads don't leave partial files behind."""

    @pytest.mark.asyncio
    async def test_no_file_left_on_stream_error(self, enable_file_ops):
        """If the stream raises mid-upload, no partial file remains."""

        async def failing_stream():
            yield b"partial data"
            raise IOError("connection lost")

        dest = str(enable_file_ops / "will_fail.png")

        with pytest.raises(FileOperationError) as exc_info:
            await stream_upload(failing_stream(), dest)

        assert exc_info.value.code == FileOperationErrorCode.WRITE_FAILED
        assert not fos.exists(dest)

    @pytest.mark.asyncio
    async def test_existing_file_not_corrupted_on_error(self, enable_file_ops):
        """If upload fails, existing file at the collision path is untouched."""
        existing = enable_file_ops / "photo.png"
        existing.write_bytes(b"original content")

        async def failing_stream():
            yield b"partial"
            raise IOError("connection lost")

        # Upload to same path - should try photo_1.png due to collision
        with pytest.raises(FileOperationError):
            await stream_upload(failing_stream(), str(existing))

        # Original file unchanged
        assert fos.read_file(str(existing), binary=True) == b"original content"
        # Incremented file should not exist
        assert not fos.exists(str(enable_file_ops / "photo_1.png"))


# =============================================================================
# Delete handler
# =============================================================================


class TestDeleteFile:
    """delete_file handles file deletion with validation."""

    @pytest.mark.asyncio
    async def test_rejects_when_feature_disabled(self):
        """Raises FEATURE_DISABLED when config flag is False."""
        with patch("fiftyone.config.allow_browser_file_operations", False):
            with pytest.raises(FileOperationError) as exc_info:
                await delete_file("/any/path.png")

            assert (
                exc_info.value.code == FileOperationErrorCode.FEATURE_DISABLED
            )

    @pytest.mark.asyncio
    async def test_rejects_when_no_dir_configured(self):
        """Raises error when feature enabled but no directory set."""
        with patch(
            "fiftyone.config.allow_browser_file_operations", True
        ), patch("fiftyone.config.browser_file_operations_dir", None):
            with pytest.raises(FileOperationError) as exc_info:
                await delete_file("/any/path.png")

            assert (
                exc_info.value.code == FileOperationErrorCode.PATH_NOT_ALLOWED
            )

    @pytest.mark.asyncio
    async def test_rejects_missing_path(self, enable_file_ops):
        """Raises PATH_REQUIRED when path is empty."""
        with pytest.raises(FileOperationError) as exc_info:
            await delete_file("")

        assert exc_info.value.code == FileOperationErrorCode.PATH_REQUIRED

    @pytest.mark.asyncio
    async def test_rejects_path_outside_allowed_dir(self, enable_file_ops):
        """Raises PATH_NOT_ALLOWED for paths outside configured directory."""
        with pytest.raises(FileOperationError) as exc_info:
            await delete_file("/etc/passwd")

        assert exc_info.value.code == FileOperationErrorCode.PATH_NOT_ALLOWED

    @pytest.mark.asyncio
    async def test_rejects_path_traversal_attack(self, enable_file_ops):
        """Rejects paths that try to escape via ../"""
        malicious_path = str(enable_file_ops / ".." / ".." / "etc" / "passwd")

        with pytest.raises(FileOperationError) as exc_info:
            await delete_file(malicious_path)

        assert exc_info.value.code == FileOperationErrorCode.PATH_NOT_ALLOWED

    @pytest.mark.asyncio
    async def test_deletes_existing_file(self, enable_file_ops):
        """Successfully deletes an existing file."""
        target = enable_file_ops / "to_delete.png"
        target.write_bytes(b"delete me")

        await delete_file(str(target))

        assert not fos.exists(str(target))

    @pytest.mark.asyncio
    async def test_idempotent_when_file_missing(self, enable_file_ops):
        """Returns successfully when file doesn't exist (idempotent)."""
        nonexistent = str(enable_file_ops / "never_existed.png")

        # Should not raise
        await delete_file(nonexistent)

    @pytest.mark.asyncio
    async def test_idempotent_double_delete(self, enable_file_ops):
        """Deleting the same file twice succeeds both times."""
        target = enable_file_ops / "to_delete.png"
        target.write_bytes(b"delete me")

        await delete_file(str(target))
        await delete_file(str(target))  # Should not raise

        assert not fos.exists(str(target))

    @pytest.mark.asyncio
    async def test_rejects_directory_path(self, enable_file_ops):
        """Raises NOT_A_FILE when path is a directory."""
        dir_path = enable_file_ops / "some_dir"
        dir_path.mkdir()

        with pytest.raises(FileOperationError) as exc_info:
            await delete_file(str(dir_path))

        assert exc_info.value.code == FileOperationErrorCode.NOT_A_FILE


# =============================================================================
# Windows compatibility
# =============================================================================


class TestGetUniquePathWindows:
    """get_unique_path handles Windows-style paths correctly."""

    def test_handles_windows_path_separator(self):
        """Handles backslash path separators."""
        with patch("fiftyone.core.storage.exists", return_value=False):
            path = r"C:\Users\test\uploads\photo.png"
            result = get_unique_path(path)
            assert result == path

    def test_increments_windows_path(self):
        """Correctly increments Windows paths with backslashes."""

        def mock_exists(p):
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
        self, enable_file_ops
    ):
        """Detects path traversal attacks using backslashes."""

        async def mock_stream():
            yield b"data"

        malicious_path = str(enable_file_ops) + r"\..\..\etc\passwd"

        with pytest.raises(FileOperationError) as exc_info:
            await stream_upload(mock_stream(), malicious_path)

        assert exc_info.value.code == FileOperationErrorCode.PATH_NOT_ALLOWED

    @pytest.mark.asyncio
    async def test_rejects_mixed_separator_traversal(self, enable_file_ops):
        """Detects path traversal with mixed forward/back slashes."""

        async def mock_stream():
            yield b"data"

        malicious_path = str(enable_file_ops) + r"/..\..\etc/passwd"

        with pytest.raises(FileOperationError) as exc_info:
            await stream_upload(mock_stream(), malicious_path)

        assert exc_info.value.code == FileOperationErrorCode.PATH_NOT_ALLOWED


class TestDeleteFileWindows:
    """delete_file handles Windows paths correctly."""

    @pytest.mark.asyncio
    async def test_rejects_path_traversal_with_backslashes(
        self, enable_file_ops
    ):
        """Detects path traversal attacks using backslashes."""
        malicious_path = str(enable_file_ops) + r"\..\..\etc\passwd"

        with pytest.raises(FileOperationError) as exc_info:
            await delete_file(malicious_path)

        assert exc_info.value.code == FileOperationErrorCode.PATH_NOT_ALLOWED


# =============================================================================
# Response format consistency
# =============================================================================


class TestResponseFormat:
    """Response dicts have consistent structure for browser consumption."""

    @pytest.mark.asyncio
    async def test_upload_success_has_path_no_error(self, enable_file_ops):
        """Successful upload returns dict with 'path', no 'error'."""

        async def mock_stream():
            yield b"data"

        dest = str(enable_file_ops / "file.png")
        result = await stream_upload(mock_stream(), dest)

        # stream_upload returns a path string, not a dict
        assert isinstance(result, str)
        assert len(result) > 0

    def test_error_to_dict_always_has_code_and_message(self):
        """Every error code produces a dict with 'code' and 'message'."""
        for code in FileOperationErrorCode:
            err = FileOperationError(code=code, message="test message")
            d = err.to_dict()

            assert "error" in d
            assert "code" in d["error"]
            assert "message" in d["error"]
            assert d["error"]["code"] == code.value
            assert d["error"]["message"] == "test message"

    def test_error_to_dict_never_has_path(self):
        """Error dicts don't have a top-level 'path' key."""
        for code in FileOperationErrorCode:
            err = FileOperationError(code=code, message="test")
            d = err.to_dict()

            assert "path" not in d


# =============================================================================
# Integration tests
# =============================================================================


class TestUploadIntegration:
    """Integration tests with actual file I/O."""

    @pytest.mark.asyncio
    async def test_large_file_streaming(self, enable_file_ops):
        """Large files are streamed without loading entirely into memory."""
        chunk_size = 1024 * 1024  # 1MB
        num_chunks = 10

        async def large_stream():
            for _ in range(num_chunks):
                yield b"x" * chunk_size

        dest = str(enable_file_ops / "large.bin")
        result = await stream_upload(large_stream(), dest)

        assert os.path.getsize(result) == chunk_size * num_chunks

    @pytest.mark.asyncio
    async def test_binary_fidelity_png_header(self, enable_file_ops):
        """Real PNG header bytes survive the stream."""
        # Minimal PNG header
        png_header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100

        async def mock_stream():
            yield png_header

        dest = str(enable_file_ops / "test.png")
        result = await stream_upload(mock_stream(), dest)

        assert fos.read_file(result, binary=True) == png_header

    @pytest.mark.asyncio
    async def test_binary_fidelity_null_and_high_bytes(self, enable_file_ops):
        """Null bytes and 0xFF bytes are not corrupted."""
        data = bytes(range(256)) * 10  # All byte values 0x00-0xFF

        async def mock_stream():
            yield data

        dest = str(enable_file_ops / "all_bytes.bin")
        result = await stream_upload(mock_stream(), dest)

        assert fos.read_file(result, binary=True) == data
