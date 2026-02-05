"""
FiftyOne upload handler.

Provides streaming file upload functionality for the FiftyOne server.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import dataclass
from enum import Enum
from typing import AsyncIterator, Optional


class UploadErrorCode(str, Enum):
    """Error codes for upload operations."""

    UPLOADS_DISABLED = "UPLOADS_DISABLED"
    PATH_REQUIRED = "PATH_REQUIRED"
    PATH_INVALID = "PATH_INVALID"
    PATH_NOT_ALLOWED = "PATH_NOT_ALLOWED"
    WRITE_FAILED = "WRITE_FAILED"
    STORAGE_FULL = "STORAGE_FULL"


@dataclass
class UploadError(Exception):
    """Structured upload error with code, message, and optional details."""

    code: UploadErrorCode
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
    """Streams binary data to a file path."""
    raise NotImplementedError("TODO: implement")
