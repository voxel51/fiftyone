"""
FiftyOne Server grid-data adapter factory.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import functools

import fiftyone as fo

from fiftyone.server.db.interface import GridDataAdapter
from fiftyone.server.db.mongo import MongoGridAdapter

_VALID_BACKENDS = ("mongo",)


def _grid_backend() -> str:
    return (fo.config.grid_backend or "mongo").strip().lower()


@functools.lru_cache(maxsize=1)
def get_grid_adapter() -> GridDataAdapter:
    """Return the process-wide :class:`GridDataAdapter` singleton.

    Selected by ``fiftyone.config.grid_backend`` (env var
    ``FIFTYONE_GRID_BACKEND``). Default ``"mongo"`` → :class:`MongoGridAdapter`.

    Returns:
        The configured :class:`GridDataAdapter` implementation.

    Raises:
        ValueError: If the configured backend isn't recognized.
    """
    backend = _grid_backend()
    if backend == "mongo":
        return MongoGridAdapter()
    raise ValueError(
        f"Unknown fiftyone.config.grid_backend={backend!r}; "
        f"expected one of {_VALID_BACKENDS}"
    )


def _reset_caches_for_tests() -> None:
    """Clear cached singletons. Test-only helper."""
    get_grid_adapter.cache_clear()
