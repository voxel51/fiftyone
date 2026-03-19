"""
Allowed media directory registry for path traversal prevention.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import threading
from pathlib import Path

_lock = threading.Lock()
_allowed_dirs = set()


def add_allowed_dir(dir_path: str) -> None:
    """Registers a directory as allowed for media serving.

    Args:
        dir_path: a directory path
    """
    resolved = str(Path(dir_path).expanduser().resolve())
    with _lock:
        _allowed_dirs.add(resolved)


def add_allowed_dir_for_filepath(filepath: str) -> None:
    """Registers the parent directory of a filepath as allowed.

    Args:
        filepath: a file path
    """
    resolved_parent = str(Path(filepath).expanduser().resolve().parent)
    with _lock:
        _allowed_dirs.add(resolved_parent)


def is_path_allowed(resolved_path: str) -> bool:
    """Checks if a resolved path falls under any allowed directory.

    Args:
        resolved_path: an absolute resolved file path

    Returns:
        True/False
    """
    with _lock:
        return any(
            resolved_path == d or resolved_path.startswith(d + os.sep)
            for d in _allowed_dirs
        )


def clear() -> None:
    """Clears all allowed directories."""
    with _lock:
        _allowed_dirs.clear()
