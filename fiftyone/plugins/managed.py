"""
FiftyOne managed plugins.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
import logging

from fiftyone.plugins.permissions import ManagedPlugins
from fiftyone.plugins.context import PluginContext, build_plugin_contexts


logger = logging.getLogger(__name__)


class ManagedPluginContextCache:
    def __init__(self):
        self.clear()

    def clear(self):
        self.fingerprint = None
        self.contexts = None


cache = ManagedPluginContextCache()


def build_managed_plugin_contexts(
    enabled, managed_plugins: ManagedPlugins
) -> PluginContext:
    fingerprint = managed_plugins.fingerprint()
    if fingerprint != cache.fingerprint or cache.contexts is None:
        logger.info(
            f"Managed plugins fingerprint changed: {cache.fingerprint} -> {fingerprint}"
        )
        start = datetime.datetime.now()
        plugin_contexts = build_plugin_contexts(enabled=enabled)
        duration = datetime.datetime.now() - start
        seconds = duration.total_seconds()
        logger.info(f"Managed plugin contexts built in {seconds:.2f}s")
        cache.contexts = plugin_contexts
        cache.fingerprint = fingerprint
        return plugin_contexts
    return cache.contexts
