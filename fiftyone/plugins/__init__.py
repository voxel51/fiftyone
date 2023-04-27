"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import types
from .definitions import list_plugins
from .core import *
from deprecated import deprecated


@deprecated(reason="Use list_plugins() instead")
def list_all_plugins():
    """Wrapper for backwards compatibility. Returns a list of all plugins that have not explicitly been disabled.
    .. warning::

            This method is deprecated and will be removed in a future release.
            Use the drop-in replacement :meth:`list_plugins()` or `list_downloaded_plugins()` instead.
    """

    return list_plugins()


# This enables Sphinx refs to directly use paths imported here
__all__ = [
    k
    for k, v in globals().items()
    if not k.startswith("_") and not isinstance(v, types.ModuleType)
]
