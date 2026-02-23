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

from .errors import FileOperationError, FileOperationErrorCode
from .operations import delete_file, stream_upload
from .paths import get_unique_path

__all__ = [
    "FileOperationError",
    "FileOperationErrorCode",
    "delete_file",
    "get_unique_path",
    "stream_upload",
]
