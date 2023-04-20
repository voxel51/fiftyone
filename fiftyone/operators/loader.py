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


def register_module(filepath, mod, plugin_definition):
    """Registers all operators in the given module."""
    if REGISTERED_MODULES.get(filepath, None) is not None:
        unregister_module(filepath)
    try:
        mod.register(plugin_definition)
        REGISTERED_MODULES[filepath] = mod
        if filepath in FAILED_MODULES:
            FAILED_MODULES.pop(filepath)
    except Exception as e:
        errors = [traceback.format_exc()]
        try:
            mod.unregister()
        except Exception as ue:
            errors.append(traceback.format_exc())
            pass
        FAILED_MODULES[filepath] = errors


def unregister_module(filepath):
    """Unegisters all operators in the given module."""
    mod = REGISTERED_MODULES.get(filepath, None)
    if mod is not None:
        try:
            mod.unregister()
        except Exception as e:
            pass
        del REGISTERED_MODULES[filepath]


def unregister_all():
    """Unregisters all operators."""
    for filepath, mod in REGISTERED_MODULES:
        unregister_module(filepath)


def list_module_errors():
    """Lists the errors that occurred when loading modules."""
    return FAILED_MODULES


def load_from_dir():
    """Loads all operators from the default operator directory."""
    plugin_definitions = fop.list_plugins()
    for plugin_definition in plugin_definitions:
        module_dir = plugin_definition.directory
        exec_module_from_dir(module_dir, plugin_definition)


def exec_module_from_dir(module_dir, plugin_definition):
    mod_dir = os.path.dirname(module_dir)
    mod_filepath = os.path.join(module_dir, "__init__.py")
    spec = importlib.util.spec_from_file_location(mod_dir, mod_filepath)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod.__name__] = mod
    spec.loader.exec_module(mod)
    register_module(mod_filepath, mod, plugin_definition)
    return mod


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
