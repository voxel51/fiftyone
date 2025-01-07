"""
FiftyOne plugin context.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import importlib
import logging
import os
import sys
import traceback

import fiftyone as fo
import fiftyone.plugins as fop

from fiftyone.operators.decorators import plugins_cache
from fiftyone.operators.operator import Operator


logger = logging.getLogger(__name__)

INIT_FILENAME = "__init__.py"


@plugins_cache
def build_plugin_contexts(enabled=True):
    """Returns contexts for all available plugins.

    Args:
        enabled (True): whether to include only enabled plugins (True) or only
            disabled plugins (False) or all plugins ("all")

    Returns:
        a list of :class:`PluginContext` instances
    """
    plugin_contexts = []
    for pd in fop.list_plugins(enabled=enabled, builtin="all"):
        pctx = PluginContext(pd)
        pctx.register_all()
        plugin_contexts.append(pctx)

    return plugin_contexts


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

    @property
    def secrets(self):
        """List of keys for required secrets as specified in the plugin
        definition.
        """
        return self.plugin_definition.secrets

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
            cls: an :class:`fiftyone.operators.operator.Operator` or
                :class:`fiftyone.operators.panel.Panel` class
        """
        try:
            instance = cls(_builtin=self.plugin_definition.builtin)
            if self.can_register(instance):
                instance.plugin_name = self.name
                if self.secrets:
                    instance.add_secrets(self.secrets)
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
            module_path = os.path.join(module_dir, INIT_FILENAME)
            if not os.path.isfile(module_path):
                return

            module_name = os.path.relpath(
                module_dir, fo.config.plugins_dir
            ).replace("/", ".")
            spec = importlib.util.spec_from_file_location(
                module_name, module_path
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
