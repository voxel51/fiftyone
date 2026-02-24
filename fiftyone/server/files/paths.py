"""
FiftyOne file operations path utilities and validation.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import re

import fiftyone as fo
import fiftyone.core.storage as fos

from .errors import FileOperationError, FileOperationErrorCode


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

    max_attempts = 100
    for i in range(max_attempts):
        candidate = f"{base_without_num}_{start_num + i}{ext}"
        if not fos.exists(candidate):
            return candidate

    raise FileOperationError(
        code=FileOperationErrorCode.WRITE_FAILED,
        message=f"Could not find a unique filename after {max_attempts} attempts.",
        details={"path": path},
    )


def check_feature_enabled():
    """Raises :class:`FileOperationError` if file operations are disabled."""
    if not fo.config.allow_browser_file_operations:
        raise FileOperationError(
            code=FileOperationErrorCode.FEATURE_DISABLED,
            message=(
                "Browser file operations are disabled. "
                "Set FIFTYONE_ALLOW_BROWSER_FILE_OPERATIONS=true to enable."
            ),
        )


def check_and_resolve_path(path: str) -> str:
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
    except (OSError, ValueError) as e:
        raise FileOperationError(
            code=FileOperationErrorCode.PATH_INVALID,
            message=f"Invalid path: {e}",
            details={"path": path},
        )

    try:
        inside = os.path.commonpath([base, normalized]) == base
    except ValueError:
        inside = False

    if not inside:
        raise FileOperationError(
            code=FileOperationErrorCode.PATH_NOT_ALLOWED,
            message="Path must be within the configured file operations directory.",
            details={"path": path, "allowed_base": allowed_base},
        )

    return normalized
