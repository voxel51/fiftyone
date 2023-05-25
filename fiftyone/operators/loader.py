"""
FiftyOne operator loader.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import cachetools.func
import importlib
import logging
import os
import sys
import traceback

import fiftyone.plugins as fop

from .operator import Operator


KNOWN_PLUGIN_CONTEXTS = {}

logger = logging.getLogger(__name__)


class PluginContext(object):
    """Context that represents a plugin and the Python objects it creates.

    Args:
        plugin_definition: the :class:`fiftyone.plugins.PluginDefinition` for
            the plugin
    """

    def __init__(self, plugin_definition):
        self.plugin_definition = plugin_definition
        self.instances = []
        self.errors = []

    @property
    def name(self):
        """The plugin name."""
        return self.plugin_definition.name

    def has_errors(self):
        """Determines whether the plugin has errors.

        Returns:
            True/False
        """
        return bool(self.errors)

    def can_register(self, instance):
        """Determines whether the given operator can be registered.

        Args:
            instance: an :class:`fiftyone.operators.operator.Operator`

        Returns:
            True/False
        """
        if not isinstance(instance, Operator):
            return False

        return self.plugin_definition.can_register_operator(instance.name)

    def register(self, cls):
        """Registers the given operator on the plugin.

        .. note::

            Any errors are logged rather than being raised.

        Args:
            cls: an :class:`fiftyone.operators.operator.Operator` class
        """
        try:
            instance = cls()
            if self.can_register(instance):
                instance.plugin_name = self.name
                self.instances.append(instance)
        except:
            logger.warning(
                f"Failed to register operator {cls.__name__} on plugin {self.name}"
            )
            self.errors.append(traceback.format_exc())

    def register_all(self):
        """Registers all operators defined by the plugin on this context.

        .. note::

            Any errors are logged rather than being raised.
        """
        self.dispose_all()

        try:
            module_dir = self.plugin_definition.directory
            module_path = os.path.join(module_dir, "__init__.py")
            if not os.path.isfile(module_path):
                return

            parent_dir = os.path.dirname(module_dir)
            spec = importlib.util.spec_from_file_location(
                parent_dir, module_path
            )
            module = importlib.util.module_from_spec(spec)
            sys.modules[module.__name__] = module
            spec.loader.exec_module(module)
            module.register(self)
        except:
            logger.warning(
                f"Failed to register operators for plugin {self.name}"
            )
            self.errors.append(traceback.format_exc())

    def dispose_all(self):
        """Disposes all operators from this context."""
        self.instances.clear()
        self.errors.clear()


def build_plugin_contexts(enabled=True):
    """Returns contexts for all available plugins.

    Args:
        enabled (True): whether to include only enabled plugins (True) or only
            disabled plugins (False) or all plugins ("all")

    Returns:
        a list of :class:`PluginContext` instances
    """
    plugin_contexts = []
    for pd in fop.list_plugins(enabled=enabled):
        pctx = PluginContext(pd)
        pctx.register_all()
        plugin_contexts.append(pctx)

    return plugin_contexts


@cachetools.func.ttl_cache(ttl=60)
def register_all():
    """Registers all operators associated with all enabled plugins.

    Returns:
        a list of :class:`PluginContext` instances
    """
    dispose_all()

    plugin_contexts = build_plugin_contexts()
    for pctx in plugin_contexts:
        KNOWN_PLUGIN_CONTEXTS[pctx.name] = pctx

    return plugin_contexts


def dispose_plugin(plugin_name):
    """Unegisters the given plugin and all associated operators.

    Args:
        plugin_name: the name of a plugin
    """
    pctx = KNOWN_PLUGIN_CONTEXTS.pop(plugin_name, None)
    if pctx is not None:
        pctx.dispose_all()


def dispose_all():
    """Disposes all known plugin contexts."""
    for pctx in KNOWN_PLUGIN_CONTEXTS.values():
        pctx.dispose_all()

    KNOWN_PLUGIN_CONTEXTS.clear()
