"""
Allowed media directory registry for path traversal prevention.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_allowed_dirs: set[str] = set()


def add_allowed_dir(dir_path: str) -> None:
    """Register a directory as allowed for media serving."""
    resolved = str(Path(dir_path).expanduser().resolve())
    with _lock:
        _allowed_dirs.add(resolved)


def add_allowed_dir_for_filepath(filepath: str) -> None:
    """Register the parent directory of a filepath as allowed."""
    resolved_parent = str(Path(filepath).expanduser().resolve().parent)
    with _lock:
        _allowed_dirs.add(resolved_parent)


def is_path_allowed(resolved_path: str) -> bool:
    """Check if a resolved path falls under any allowed directory."""
    with _lock:
        return any(
            resolved_path == d or resolved_path.startswith(d + os.sep)
            for d in _allowed_dirs
        )


def clear() -> None:
    """Clear all allowed directories (for testing)."""
    with _lock:
        _allowed_dirs.clear()
