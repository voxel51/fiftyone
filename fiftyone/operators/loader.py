"""
FiftyOne operator loader.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone as fo
import glob
import os
import yaml  # BEFORE PR: add to requirements.txt
import importlib
import sys
import traceback
import fiftyone.plugins as fop
from .operator import Operator

KNOWN_PLUGIN_CONTEXTS = {}

class PluginContext:
    def __init__(self, plugin_definition):
        self.name = plugin_definition.name
        self.plugin_definition = plugin_definition
        self.instances = []
        self.errors = []
    
    def has_errors(self):
        return len(self.errors) > 0

    def can_register(self, instance):
        if not isinstance(instance, Operator):
            return False
        if not self.plugin_definition.can_register_operator(instance.name):
            return False
        return True

    def register(self, cls):
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
        self.instances.remove(inst)
        inst.dispose()

    def dispose(self):
        for inst in self.instances:
            self.unregister_inst(inst)

def register_module(plugin_definition, mod):
    pctx = PluginContext(plugin_definition)
    KNOWN_PLUGIN_CONTEXTS[pctx.name] = pctx
    try:
        mod.register(pctx)
    except Exception as e:
        errors = [traceback.format_exc()]
        pctx.errors = errors
    return pctx


def unregister_module(plugin_name):
    """Unegisters all operators in the given module."""
    pctx = REGISTERED_MODULES.get(plugin_name, None)
    if pctx is not None:
        try:
            pctx.unregister_all()
        except Exception as e:
            pass
        del REGISTERED_MODULES[plugin_name]

def dispose_all(plugin_contexts):
    """Disposes all loaded instances."""
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
        pctx = exec_module_from_dir(module_dir, plugin_definition)
        plugin_contexts.append(pctx)
        KNOWN_PLUGIN_CONTEXTS[plugin_definition.name] = pctx
    return plugin_contexts

def exec_module_from_dir(module_dir, plugin_definition):
    mod_dir = os.path.dirname(module_dir)
    mod_filepath = os.path.join(module_dir, "__init__.py")
    spec = importlib.util.spec_from_file_location(mod_dir, mod_filepath)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod.__name__] = mod
    spec.loader.exec_module(mod)
    return register_module(plugin_definition, mod)

# BEFORE PR: where should this go?
def find_files(root_dir, filename, extensions, max_depth):
    """Returns all files matching the given pattern, up to the given depth.

    Args:
        pattern: a glob pattern
        max_depth: the maximum depth to search

    Returns:
        a list of paths
    """
    if max_depth == 0:
        return []

    paths = []
    for i in range(1, max_depth):
        pattern_parts = [root_dir]
        pattern_parts += list("*" * i)
        pattern_parts += [filename]
        pattern = os.path.join(*pattern_parts)
        for extension in extensions:
            paths += glob.glob(pattern + "." + extension)

    return paths
