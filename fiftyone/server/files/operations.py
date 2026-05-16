"""
FiftyOne file operations — streaming upload and deletion.

All filesystem I/O is offloaded to worker threads via
:func:`anyio.to_thread.run_sync` so that the async event loop is never
blocked, even for large uploads.  The actual reads and writes go through
:mod:`fiftyone.core.storage`, which abstracts over local and cloud-backed
filesystems.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import errno
import logging
from typing import AsyncIterator

import anyio

import fiftyone.core.storage as fos

from .errors import FileOperationError, FileOperationErrorCode
from .paths import (
    check_and_resolve_path,
    check_feature_enabled,
    get_unique_path,
)

logger = logging.getLogger(__name__)


def _sync_resolve_and_open(normalized: str):
    """Resolves filename collisions and opens the file atomically.

    Combining these steps in a single sync call eliminates the TOCTOU
    window where two concurrent uploads could pick the same unique name.

    Returns a ``(resolved_path, file_handle)`` tuple.  Caller is
    responsible for closing the file handle.
    """
    resolved = get_unique_path(normalized)
    fos.ensure_basedir(resolved)
    fh = fos.open_file(resolved, "wb")
    return resolved, fh


def _sync_try_remove(path: str) -> None:
    """Best-effort removal of *path*.  Logs a warning on failure."""
    try:
        if fos.exists(path):
            fos.delete_file(path)
    except Exception:
        logger.warning(
            "Failed to clean up partial file: %s", path, exc_info=True
        )


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
    check_feature_enabled()
    normalized = check_and_resolve_path(path)

    # Resolve collisions and open the file atomically in a single thread
    # call to avoid TOCTOU races between concurrent uploads.  Each chunk
    # write is also offloaded so the event loop stays free.
    resolved_path = normalized
    try:
        resolved_path, fh = await anyio.to_thread.run_sync(
            lambda: _sync_resolve_and_open(normalized)
        )
        try:
            async for chunk in stream:
                await anyio.to_thread.run_sync(lambda c=chunk: fh.write(c))
        finally:
            await anyio.to_thread.run_sync(lambda: fh.close())
    except FileOperationError:
        raise
    except Exception as e:
        await anyio.to_thread.run_sync(lambda: _sync_try_remove(resolved_path))
        if isinstance(e, OSError):
            if e.errno == errno.ENOSPC:
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

    return resolved_path


async def delete_file(path: str) -> None:
    """Deletes a file. Idempotent -- succeeds even if file doesn't exist.

    Only files (not directories) may be deleted.  The actual removal is
    offloaded to a worker thread via :func:`anyio.to_thread.run_sync`.

    Args:
        path: the file path to delete

    Raises:
        FileOperationError: on validation failure or delete error
    """
    check_feature_enabled()
    normalized = check_and_resolve_path(path)

    def _sync_delete():
        if not fos.exists(normalized):
            return  # Idempotent -- already gone

        if fos.isdir(normalized):
            raise FileOperationError(
                code=FileOperationErrorCode.NOT_A_FILE,
                message="Cannot delete a directory. Only files are allowed.",
                details={"path": path},
            )

        fos.delete_file(normalized)

    try:
        await anyio.to_thread.run_sync(_sync_delete)
    except FileOperationError:
        raise
    except Exception as e:
        raise FileOperationError(
            code=FileOperationErrorCode.DELETE_FAILED,
            message=f"Failed to delete file: {e}",
            details={"path": path},
        )
