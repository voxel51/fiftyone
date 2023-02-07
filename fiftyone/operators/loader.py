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
        mod.register()


def exec_module_from_dir(module_dir):
    spec = importlib.util.spec_from_file_location(
        os.path.dirname(module_dir), os.path.join(module_dir, "__init__.py")
    )

    mod = importlib.util.module_from_spec(spec)

    spec.loader.exec_module(mod)

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
