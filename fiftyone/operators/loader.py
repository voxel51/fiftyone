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

REGISTERED_MODULES = {}
FAILED_MODULES = {}

class PluginContext:
    def __init__(self, plugin_definition):
        self.plugin_definition = plugin_definition
        self.instances = []
    
    def register(self, cls):
        if self.plugin_definition.can_register(cls):
            instance = cls()
            self.instances.append(instance)
        else:
            raise ValueError(self.plugin_definition.name + " cannot register " + cls.__name__)

    def unregister_all():
        for instance in self.instances:
            unregister(instance)

def register_module(plugin_definition, mod):
    """Registers all operators in the given module."""
    if REGISTERED_MODULES.get(plugin_definition.name, None) is not None:
        unregister_module(plugin_definition)
    try:
        pctx = PluginContext(plugin_definition)
        mod.register(pctx)
        REGISTERED_MODULES[plugin_definition.name] = pctx
        if plugin_definition.name in FAILED_MODULES:
            FAILED_MODULES.pop(plugin_definition.name)
        return pctx
    except Exception as e:
        errors = [traceback.format_exc()]
        try:
            mod.unregister()
        except Exception as ue:
            errors.append(traceback.format_exc())
            pass
        FAILED_MODULES[plugin_definition.name] = errors


def unregister_module(plugin_name):
    """Unegisters all operators in the given module."""
    pctx = REGISTERED_MODULES.get(plugin_name, None)
    if pctx is not None:
        try:
            pctx.unregister_all()
        except Exception as e:
            pass
        del REGISTERED_MODULES[plugin_name]


def unregister_all():
    """Unregisters all operators."""
    for name, pctx in REGISTERED_MODULES:
        unregister_module(plugin_name)


def list_module_errors():
    """Lists the errors that occurred when loading modules."""
    return FAILED_MODULES


def load_from_dir():
    """Loads all operators from the default operator directory."""
    plugin_definitions = fop.list_plugins()
    plugin_contexts = []
    for plugin_definition in plugin_definitions:
        module_dir = plugin_definition.directory
        pctx = exec_module_from_dir(module_dir, plugin_definition)
        plugin_contexts.append(pctx)
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
