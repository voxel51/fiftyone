"""
FiftyOne file operations error types.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from enum import Enum
from typing import Optional


class FileOperationErrorCode(str, Enum):
    """Error codes for file operations.

    Each member carries its own HTTP status code, accessible via
    ``code.status_code``.
    """

    def __new__(cls, value: str, status_code: int):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.status_code = status_code
        return obj

    # Shared
    FEATURE_DISABLED = ("FEATURE_DISABLED", 403)
    PATH_REQUIRED = ("PATH_REQUIRED", 400)
    PATH_INVALID = ("PATH_INVALID", 400)
    PATH_NOT_ALLOWED = ("PATH_NOT_ALLOWED", 403)

    # Upload
    WRITE_FAILED = ("WRITE_FAILED", 500)
    STORAGE_FULL = ("STORAGE_FULL", 507)

    # Delete
    DELETE_FAILED = ("DELETE_FAILED", 500)
    NOT_A_FILE = ("NOT_A_FILE", 400)


class FileOperationError(Exception):
    """Structured file operation error with code, message, and optional details."""

    def __init__(
        self,
        code: FileOperationErrorCode,
        message: str,
        details: Optional[dict] = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details

    def to_dict(self) -> dict:
        """Serializes the error to a dict suitable for JSON responses."""
        result = {
            "error": {
                "code": self.code.value,
                "message": self.message,
            }
        }
        if self.details is not None:
            result["error"]["details"] = self.details
        return result

    @property
    def status_code(self) -> int:
        """Returns the HTTP status code for this error."""
        return self.code.status_code
