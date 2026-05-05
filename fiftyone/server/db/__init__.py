"""
FiftyOne Server data adapter package.

Provides a seam between server resolvers and the underlying database. The
``GridDataAdapter`` interface is the swappable surface (sample/scene reads
that may eventually be served from a SQL/BigQuery backend); the
``MetadataAdapter`` interface holds metadata reads that are always Mongo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.server.db.factory import (
    get_grid_adapter,
    get_metadata_adapter,
)
from fiftyone.server.db.interface import (
    GridDataAdapter,
    MetadataAdapter,
)

__all__ = [
    "GridDataAdapter",
    "MetadataAdapter",
    "get_grid_adapter",
    "get_metadata_adapter",
]
