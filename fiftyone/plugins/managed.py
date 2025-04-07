from fiftyone.plugins.permissions import ManagedPlugins
from fiftyone.plugins.context import PluginContext, build_plugin_contexts


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
    if fingerprint != cache.fingerprint:
        # TODO: pass managed_plugins to build_plugin_contexts
        # and use it to avoid searching for plugins
        # this will require a change to the plugins API to return
        # plugin.filepath
        plugin_contexts = build_plugin_contexts(enabled=enabled)
        cache.contexts = plugin_contexts
        cache.fingerprint = fingerprint
        return plugin_contexts
    return cache.contexts
