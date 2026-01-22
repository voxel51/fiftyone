"""
Exceptions for JSON patch operations.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


class RootDeleteError(Exception):
    """Raised when a root delete operation is detected.

    A root delete is a single remove operation with path "/" that indicates
    the entire target object should be deleted. This cannot be applied via
    normal JSON patch operations since the target cannot remove itself.
    The caller must handle deletion at the parent level.
    """

    pass
