"""
FiftyOne Server grid-data adapter package.

Provides an adapter-pattern interface between server resolvers and the
underlying database for grid / sidebar / sample reads. The
``GridDataAdapter`` interface is the swappable surface; a non-Mongo
implementation can plug in.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.server.db.factory import get_grid_adapter
from fiftyone.server.db.interface import GridDataAdapter

__all__ = [
    "GridDataAdapter",
    "get_grid_adapter",
]
