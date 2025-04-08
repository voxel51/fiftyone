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
    if fingerprint != cache.fingerprint or cache.contexts is None:
        print("Cache miss ------------------")
        print("Cache fingerprint:", cache.fingerprint)
        print("Managed plugins fingerprint:", fingerprint)
        print("Building.....")
        # TODO: pass managed_plugins to build_plugin_contexts
        # and use it to avoid searching for plugins
        # this will require a change to the plugins API to return
        # plugin.filepath
        plugin_contexts = build_plugin_contexts(enabled=enabled)
        print("Built plugin contexts:", plugin_contexts)
        cache.contexts = plugin_contexts
        cache.fingerprint = fingerprint
        return plugin_contexts
    print("Cache hit ------------------")
    print("Cache fingerprint:", cache.fingerprint)
    return cache.contexts
