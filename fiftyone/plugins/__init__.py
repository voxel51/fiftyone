"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .definitions import list_plugins
from .core import *


def list_all_plugins():
    """Wrapper for backwards compatibility. Returns a list of all plugins that have not explicitly been disabled."""
    return list_plugins()
