"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import types
import deprecated
import wrapt

from .core import (
    enable_plugin,
    disable_plugin,
    delete_plugin,
    list_disabled_plugins,
    list_downloaded_plugins,
    list_enabled_plugins,
    find_plugin,
    download_plugin,
    create_plugin,
)
from .definitions import list_plugins

# This enables Sphinx refs to directly use paths imported here
# and ignore functions marked as depreciated
__all__ = [
    k
    for k, v in globals().items()
    if not k.startswith("_")
    and not (type(v) in [wrapt.decorators.AdapterWrapper, types.ModuleType])
]
