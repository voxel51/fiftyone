"""
FiftyOne's migration interface.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import types

from .runner import (
    get_database_revision,
    get_dataset_revision,
    migrate_all,
    migrate_database_if_necessary,
    migrate_dataset_if_necessary,
    needs_migration,
)

# This enables Sphinx refs to directly use paths imported here
__all__ = [
    k
    for k, v in globals().items()
    if not k.startswith("_") and not isinstance(v, types.ModuleType)
]
