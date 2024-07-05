"""
FiftyOne plugins.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import types

from .context import PluginContext
from .core import (
    create_plugin,
    delete_plugin,
    disable_plugin,
    download_plugin,
    enable_plugin,
    ensure_plugin_compatibility,
    ensure_plugin_requirements,
    find_plugin,
    get_plugin,
    install_plugin_requirements,
    list_disabled_plugins,
    list_downloaded_plugins,
    list_enabled_plugins,
    list_plugins,
    load_plugin_requirements,
)
from .definitions import PluginDefinition
from .secrets import PluginSecretsResolver


# This enables Sphinx refs to directly use paths imported here
__all__ = [
    k
    for k, v in globals().items()
    if not k.startswith("_") and not isinstance(v, types.ModuleType)
]
