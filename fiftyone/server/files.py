"""
FiftyOne file operations handler.

Provides streaming file upload and deletion functionality for the FiftyOne
server. Operations are gated behind the ``allow_browser_file_operations``
config flag and restricted to paths within ``browser_file_operations_dir``.

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

from dataclasses import dataclass
from enum import Enum
from typing import AsyncIterator, Optional


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
        raise NotImplementedError("TODO: implement")

    @property
    def status_code(self) -> int:
        raise NotImplementedError("TODO: implement")


def get_unique_path(path: str) -> str:
    """Returns a unique path, incrementing suffix if file exists."""
    raise NotImplementedError("TODO: implement")


async def stream_upload(
    stream: AsyncIterator[bytes],
    path: str,
) -> str:
    """Streams binary data to a file path.

    Returns the resolved path (may differ from input on collision).
    Cleans up partial files on failure.
    """
    raise NotImplementedError("TODO: implement")


async def delete_file(path: str) -> None:
    """Deletes a file. Idempotent -- succeeds even if file doesn't exist.

    Only files (not directories) may be deleted.
    """
    raise NotImplementedError("TODO: implement")
