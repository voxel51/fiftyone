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

REGISTERED_MODULES = {}
FAILED_MODULES = {}


def register_module(filepath, mod):
    """Registers all operators in the given module."""
    if filepath in REGISTERED_MODULES:
        unregister_module(filepath)
    try:
        mod.register()
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
    """Registers all operators in the given module."""
    try:
        mod.register()
        REGISTERED_MODULES.append(mod)
    except:
        try:
            mod.unregister()
        except:
            pass


def unregister_all():
    """Unregisters all operators."""
    for mod in REGISTERED_MODULES:
        mod.unregister()
    REGISTERED_MODULES = []


def list_module_errors():
    """Lists the errors that occurred when loading modules."""
    return FAILED_MODULES


def load_from_dir():
    """Loads all operators from the default operator directory."""
    plugins_dir = fo.config.plugins_dir

    if not plugins_dir:
        return []

    fiftyone_plugin_yamls = find_files(
        plugins_dir, "fiftyone", ["yml", "yaml"], 3
    )
    for yaml_path in fiftyone_plugin_yamls:
        with open(yaml_path, "r") as f:
            plugin_dict = yaml.load(f, Loader=yaml.FullLoader)

        module_dir = os.path.dirname(yaml_path)
        mod = exec_module_from_dir(module_dir)


def exec_module_from_dir(module_dir):
    mod_dir = os.path.dirname(module_dir)
    mod_filepath = os.path.join(module_dir, "__init__.py")
    spec = importlib.util.spec_from_file_location(mod_dir, mod_filepath)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod.__name__] = mod
    spec.loader.exec_module(mod)
    register_module(mod_filepath, mod)
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
