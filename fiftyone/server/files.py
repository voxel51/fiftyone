"""
FiftyOne file operations handler.

Provides streaming file upload and deletion functionality for the FiftyOne
server. Operations are gated behind the ``allow_browser_file_operations``
config flag and restricted to paths within ``browser_file_operations_dir``.

All filesystem I/O is offloaded to worker threads via
:func:`anyio.to_thread.run_sync` so that the async event loop is never
blocked, even for large uploads.  The actual reads and writes go through
:mod:`fiftyone.core.storage`, which abstracts over local and cloud-backed
filesystems.

Routes
------
- ``POST /files/upload?path=<dest>`` -- stream binary body to *dest*,
  incrementing the filename on collision. Returns ``{"path": "<resolved>"}``.
- ``DELETE /files?path=<target>`` -- delete *target* (idempotent).
  Returns ``204 No Content``.

Error responses follow a consistent shape::

    {"error": {"code": "<CODE>", "message": "...", "details": {...}}}

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import re
from dataclasses import dataclass
from enum import Enum
from typing import AsyncIterator, Optional

import anyio

import fiftyone as fo
import fiftyone.core.storage as fos


_STATUS_CODE_MAP = {
    "FEATURE_DISABLED": 403,
    "PATH_REQUIRED": 400,
    "PATH_INVALID": 400,
    "PATH_NOT_ALLOWED": 403,
    "WRITE_FAILED": 500,
    "STORAGE_FULL": 507,
    "DELETE_FAILED": 500,
    "NOT_A_FILE": 400,
}


class FileOperationErrorCode(str, Enum):
    """Error codes for file operations."""

    # Shared
    FEATURE_DISABLED = "FEATURE_DISABLED"
    PATH_REQUIRED = "PATH_REQUIRED"
    PATH_INVALID = "PATH_INVALID"
    PATH_NOT_ALLOWED = "PATH_NOT_ALLOWED"

    # Upload
    WRITE_FAILED = "WRITE_FAILED"
    STORAGE_FULL = "STORAGE_FULL"

    # Delete
    DELETE_FAILED = "DELETE_FAILED"
    NOT_A_FILE = "NOT_A_FILE"


@dataclass
class FileOperationError(Exception):
    """Structured file operation error with code, message, and optional details."""

    code: FileOperationErrorCode
    message: str
    details: Optional[dict] = None

    def to_dict(self) -> dict:
        """Serializes the error to a dict suitable for JSON responses."""
        result = {
            "error": {
                "code": self.code.value,
                "message": self.message,
            }
        }
        if self.details:
            result["error"]["details"] = self.details
        return result

    @property
    def status_code(self) -> int:
        """Returns the HTTP status code for this error."""
        return _STATUS_CODE_MAP.get(self.code.value, 500)


# =========================================================================
# Path utilities
# =========================================================================


def get_unique_path(path: str) -> str:
    """Returns a unique path, incrementing the filename suffix if a file
    already exists at *path*.

    Examples::

        get_unique_path("/data/photo.png")    # "/data/photo.png"   (new)
        get_unique_path("/data/photo.png")    # "/data/photo_1.png" (exists)
        get_unique_path("/data/photo_1.png")  # "/data/photo_2.png" (exists)

    Args:
        path: the desired file path

    Returns:
        the original path if available, otherwise the next available
        incremented path
    """
    if not fos.exists(path):
        return path

    base, ext = os.path.splitext(path)

    # If base already ends with _N, continue from there
    match = re.match(r"^(.+)_(\d+)$", base)
    if match:
        base_without_num = match.group(1)
        start_num = int(match.group(2)) + 1
    else:
        base_without_num = base
        start_num = 1

    counter = start_num
    while True:
        candidate = f"{base_without_num}_{counter}{ext}"
        if not fos.exists(candidate):
            return candidate
        counter += 1


# =========================================================================
# Validation helpers
# =========================================================================


def _check_feature_enabled():
    """Raises :class:`FileOperationError` if file operations are disabled."""
    if not fo.config.allow_browser_file_operations:
        raise FileOperationError(
            code=FileOperationErrorCode.FEATURE_DISABLED,
            message=(
                "Browser file operations are disabled. "
                "Set FIFTYONE_ALLOW_BROWSER_FILE_OPERATIONS=true to enable."
            ),
        )


def _check_and_resolve_path(path: str) -> str:
    """Validates and normalises *path* against the configured allowed
    directory.

    Args:
        path: the raw path from the request

    Returns:
        the normalised absolute path

    Raises:
        FileOperationError: if the path is missing, invalid, or outside
            the allowed directory
    """
    allowed_base = fo.config.browser_file_operations_dir
    if not allowed_base:
        raise FileOperationError(
            code=FileOperationErrorCode.PATH_NOT_ALLOWED,
            message=(
                "No file operations directory configured. "
                "Set FIFTYONE_BROWSER_FILE_OPERATIONS_DIR."
            ),
        )

    if not path:
        raise FileOperationError(
            code=FileOperationErrorCode.PATH_REQUIRED,
            message="The 'path' parameter is required.",
        )

    # Normalise backslashes to forward slashes so that traversal attacks
    # using "\..\..\" are caught on Unix (where \ is a valid filename
    # character rather than a path separator).
    safe_path = path.replace("\\", "/")

    try:
        normalized = fos.realpath(safe_path)
        base = fos.realpath(allowed_base)
    except Exception as e:
        raise FileOperationError(
            code=FileOperationErrorCode.PATH_INVALID,
            message=f"Invalid path: {e}",
            details={"path": path},
        )

    if not (normalized.startswith(base + os.sep) or normalized == base):
        raise FileOperationError(
            code=FileOperationErrorCode.PATH_NOT_ALLOWED,
            message="Path must be within the configured file operations directory.",
            details={"path": path, "allowed_base": allowed_base},
        )

    return normalized


# =========================================================================
# Sync helpers (run in worker threads)
# =========================================================================


def _sync_write_chunks(path: str, chunks: list) -> None:
    """Writes *chunks* to *path* via :mod:`fiftyone.core.storage`.

    Creates parent directories as needed.  This function is designed to be
    called from a worker thread via :func:`anyio.to_thread.run_sync`.
    """
    fos.ensure_basedir(path)
    with fos.open_file(path, "wb") as f:
        for chunk in chunks:
            f.write(chunk)


def _sync_try_remove(path: str) -> None:
    """Best-effort removal of *path*.  Ignores errors."""
    try:
        if fos.exists(path):
            fos.delete_file(path)
    except Exception:
        pass


# =========================================================================
# Public async API
# =========================================================================


async def stream_upload(
    stream: AsyncIterator[bytes],
    path: str,
) -> str:
    """Streams binary data to a file path.

    The request body is received asynchronously, then flushed to disk in a
    worker thread so that the event loop is never blocked.  If the write
    fails for any reason the partial file is cleaned up.

    Args:
        stream: async iterator yielding bytes chunks
        path: desired destination file path

    Returns:
        the resolved path (may differ from *path* if a file already existed
        and the name was incremented)

    Raises:
        FileOperationError: on validation failure or write error
    """
    _check_feature_enabled()
    normalized = _check_and_resolve_path(path)

    # Resolve collisions (offload to thread since it hits the filesystem)
    resolved_path = await anyio.to_thread.run_sync(
        lambda: get_unique_path(normalized)
    )

    # Receive all chunks from the network, then flush to disk in a worker
    # thread.  Both phases are wrapped so that any failure triggers cleanup
    # of the (possibly partially written) destination file.
    try:
        chunks = []
        async for chunk in stream:
            chunks.append(chunk)

        await anyio.to_thread.run_sync(
            lambda: _sync_write_chunks(resolved_path, chunks)
        )
    except FileOperationError:
        raise
    except OSError as e:
        await anyio.to_thread.run_sync(lambda: _sync_try_remove(resolved_path))
        if e.errno == 28:  # ENOSPC -- no space left on device
            raise FileOperationError(
                code=FileOperationErrorCode.STORAGE_FULL,
                message="No space left on device.",
                details={"path": resolved_path},
            )
        raise FileOperationError(
            code=FileOperationErrorCode.WRITE_FAILED,
            message=f"Failed to write file: {e}",
            details={"path": resolved_path},
        )
    except Exception as e:
        await anyio.to_thread.run_sync(lambda: _sync_try_remove(resolved_path))
        raise FileOperationError(
            code=FileOperationErrorCode.WRITE_FAILED,
            message=f"Failed to write file: {e}",
            details={"path": resolved_path},
        )

    return resolved_path


async def delete_file(path: str) -> None:
    """Deletes a file. Idempotent -- succeeds even if file doesn't exist.

    Only files (not directories) may be deleted.

    Args:
        path: the file path to delete

    Raises:
        FileOperationError: on validation failure or delete error
    """
    raise NotImplementedError("TODO: implement in next phase")
