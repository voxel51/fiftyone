"""
FiftyOne plugins.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import types

from .core import (
    enable_plugin,
    disable_plugin,
    delete_plugin,
    list_plugins,
    list_disabled_plugins,
    list_downloaded_plugins,
    list_enabled_plugins,
    get_plugin,
    find_plugin,
    download_plugin,
    create_plugin,
    load_plugin_requirements,
    install_plugin_requirements,
    ensure_plugin_requirements,
    ensure_plugin_compatibility,
)
from .definitions import PluginDefinition
from .context import PluginContext
from .secrets import PluginSecretsResolver

# This enables Sphinx refs to directly use paths imported here
__all__ = [
    k
    for k, v in globals().items()
    if not k.startswith("_") and not isinstance(v, types.ModuleType)
]
