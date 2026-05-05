"""
FiftyOne Server data adapter factories.

``get_grid_adapter()`` is selected by the ``FIFTYONE_GRID_BACKEND``
environment variable (``"mongo"`` or ``"sql"``; default ``"mongo"``).
``get_metadata_adapter()`` is always Mongo and takes no env var.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import functools
import os

from fiftyone.server.db.interface import (
    GridDataAdapter,
    MetadataAdapter,
)
from fiftyone.server.db.mongo import (
    MongoGridAdapter,
    MongoMetadataAdapter,
)
from fiftyone.server.db.sql import SQLGridAdapter

_ENV_VAR = "FIFTYONE_GRID_BACKEND"
_DEFAULT_BACKEND = "mongo"
_VALID_BACKENDS = ("mongo", "sql")


def _grid_backend() -> str:
    return os.environ.get(_ENV_VAR, _DEFAULT_BACKEND).strip().lower()


@functools.lru_cache(maxsize=1)
def get_grid_adapter() -> GridDataAdapter:
    """Return the process-wide ``GridDataAdapter`` singleton.

    Selected by ``FIFTYONE_GRID_BACKEND``:

    * ``"mongo"`` (default) → :class:`MongoGridAdapter`
    * ``"sql"`` → :class:`SQLGridAdapter` (stub; raises on every call)

    Any other value raises ``ValueError``.
    """
    backend = _grid_backend()
    if backend == "mongo":
        return MongoGridAdapter()
    if backend == "sql":
        return SQLGridAdapter()
    raise ValueError(
        f"Unknown {_ENV_VAR}={backend!r}; "
        f"expected one of {_VALID_BACKENDS}"
    )


@functools.lru_cache(maxsize=1)
def get_metadata_adapter() -> MetadataAdapter:
    """Return the process-wide ``MetadataAdapter`` singleton.

    Always returns :class:`MongoMetadataAdapter` — metadata is never served
    from a non-Mongo backend.
    """
    return MongoMetadataAdapter()


def _reset_caches_for_tests() -> None:
    """Clear cached singletons. Test-only helper."""
    get_grid_adapter.cache_clear()
    get_metadata_adapter.cache_clear()
