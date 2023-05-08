"""
FiftyOne operator loader.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import importlib
import sys
import traceback
import fiftyone.plugins as fop
from .operator import Operator

KNOWN_PLUGIN_CONTEXTS = {}


class PluginContext:
    """Represents a the relevant information for a plugin and the python objects it creates.

    Args:
        plugin_definition: the :class:`PluginDefinition` for the plugin
    """

    def __init__(self, plugin_definition):
        self.name = plugin_definition.name
        self.plugin_definition = plugin_definition
        self.instances = []
        self.errors = []

    def has_errors(self):
        """Whether the plugin has errors.

        Returns:
            True if the plugin has errors, False otherwise
        """
        return len(self.errors) > 0

    def can_register(self, instance):
        """Whether the given instance can be registered.

        Args:
            instance: the instance to check

        Returns:
            True if the instance can be registered, False otherwise
        """
        if not isinstance(instance, Operator):
            return False
        if not self.plugin_definition.can_register_operator(instance.name):
            return False
        return True

    def register(self, cls):
        """Registers the given class as an instance of the plugin.

        Args:
            cls: the class to register
        """
        try:
            instance = cls()
            if self.can_register(instance):
                instance.plugin_name = self.name
                self.instances.append(instance)
            else:
                instance.dispose()
        except Exception as e:
            self.errors.append(traceback.format_exc())

    def unregister_inst(self, inst):
        """Unregisters the given instance."""
        self.instances.remove(inst)
        inst.dispose()

    def dispose(self):
        """Disposes all instances."""
        for inst in self.instances:
            self.unregister_inst(inst)


def register_module(plugin_definition, mod):
    """Registers all operators in the given module.

    Args:
        plugin_definition: the :class:`PluginDefinition` for the plugin
        mod: the module to register

    Returns:
        the :class:`PluginContext` for the plugin
    """
    try:
        pctx = PluginContext(plugin_definition)
        KNOWN_PLUGIN_CONTEXTS[pctx.name] = pctx
        mod.register(pctx)
    except Exception as e:
        errors = [traceback.format_exc()]
        pctx.errors = errors
    return pctx


def unregister_module(plugin_name):
    """Unegisters all operators in the given module."""

    pctx = KNOWN_PLUGIN_CONTEXTS.get(plugin_name, None)
    if pctx is not None:
        try:
            pctx.unregister_all()
        except Exception as e:
            pass
        del KNOWN_PLUGIN_CONTEXTS[plugin_name]


def dispose_all(plugin_contexts):
    """Disposes all given plugin_contexts."""
    global KNOWN_PLUGIN_CONTEXTS
    for name, pctx in plugin_contexts.items():
        try:
            pctx.dispose()
        except Exception as e:
            print("Error disposing plugin context: %s" % name)
            print(e)
    KNOWN_PLUGIN_CONTEXTS = {}


def load_from_dir():
    """Loads all operators from the default operator directory."""
    dispose_all(KNOWN_PLUGIN_CONTEXTS.copy())
    plugin_definitions = fop.list_plugins()
    plugin_contexts = []
    for plugin_definition in plugin_definitions:
        module_dir = plugin_definition.directory
        if plugin_definition.has_py:
            try:
                pctx = exec_module_from_dir(module_dir, plugin_definition)
                plugin_contexts.append(pctx)
                KNOWN_PLUGIN_CONTEXTS[plugin_definition.name] = pctx
            except ValueError as e:
                print("Error loading plugin from %s" % module_dir)
                pass
    return plugin_contexts


def exec_module_from_dir(module_dir, plugin_definition):
    """Executes the module in the given directory and registers all operators.

    Args:
        module_dir: the directory to execute
        plugin_definition: the :class:`PluginDefinition` for the plugin

    Returns:
        the :class:`PluginContext` for the plugin
    """
    mod_dir = os.path.dirname(module_dir)
    mod_filepath = os.path.join(module_dir, "__init__.py")
    if not os.path.isfile(mod_filepath):
        raise ValueError(
            f"Cannot execute module from {mod_dir}. Missing __init__.py"
        )
    spec = importlib.util.spec_from_file_location(mod_dir, mod_filepath)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod.__name__] = mod
    spec.loader.exec_module(mod)
    return register_module(plugin_definition, mod)
