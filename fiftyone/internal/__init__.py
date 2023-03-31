"""
Internal utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os


def is_internal_service():
    """Whether the SDK is running in an internal service context.

    Returns:
        True/False
    """
    val = os.environ.get("FIFTYONE_INTERNAL_SERVICE", "")
    return val.lower() in ("true", "1")
