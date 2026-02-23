"""
FiftyOne file operations error types.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


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
