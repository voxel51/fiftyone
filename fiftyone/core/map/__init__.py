"""
ODM package declaration.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import types

from .factory import MapBackendFactory, MapBackendType
from .map import MapBackend
from .sequential import SequentialMapBackend
from .process import ProcessMapBackend
from .threading import ThreadingMapBackend


# This enables Sphinx refs to directly use paths imported here
__all__ = [
    k
    for k, v in globals().items()
    if not k.startswith("_") and not isinstance(v, types.ModuleType)
]
