"""
FiftyOne Server ``/plugins`` route.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import glob
import os
import eta.core.serial as etas
import fiftyone as fo
import fiftyone as fo
import os
import yaml  # BEFORE PR: add to requirements.txt
import importlib
import sys
import traceback

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


def list_javascript_plugin_packages():
    plugins_dir = fo.config.plugins_dir

    if not plugins_dir:
        return {"plugins": [], "settings": None}

    settings_path = os.path.join(plugins_dir, "settings.json")
    settings = load_json_or_none(settings_path)

    pkgs = glob.glob(os.path.join(plugins_dir, "*", "package.json"))
    pkgs += glob.glob(
        os.path.join(plugins_dir, "node_modules", "*", "package.json")
    )
    plugin_packages = []

    for filepath in pkgs:
        pkg = etas.read_json(filepath)

        if "fiftyone" not in pkg or not pkg["fiftyone"].get("enabled", True):
            continue

        plugin_definition = {
            "name": pkg["name"],
            "version": pkg["version"],
        }
        plugin_definition.update(pkg["fiftyone"])
        plugin_definition["scriptPath"] = "/" + os.path.join(
            "plugins",
            os.path.dirname(os.path.relpath(filepath, plugins_dir)),
            plugin_definition["script"],
        )
        plugin_packages.append(plugin_definition)

    return plugin_packages


def list_javascript_plugins():
    packages = list_javascript_plugin_packages()
    return [p["name"] for p in packages]


def list_python_plugin_packages():
    plugins_dir = fo.config.plugins_dir

    if not plugins_dir:
        return []

    fiftyone_plugin_yamls = find_files(
        plugins_dir, "fiftyone", ["yml", "yaml"], 3
    )
    packages = []
    for yaml_path in fiftyone_plugin_yamls:
        with open(yaml_path, "r") as f:
            plugin_dict = yaml.load(f, Loader=yaml.FullLoader)
            module_dir = os.path.basename(os.path.dirname(yaml_path))
            # not enabled, skip
            if not plugin_dict.get("enabled", True):
                continue
            packages.append(
                {
                    **plugin_dict,
                    "name": plugin_dict.get("name", module_dir),
                }
            )
    return packages


def list_python_plugins():
    packages = list_python_plugin_packages()
    return [p["name"] for p in packages]


def load_json_or_none(filepath):
    try:
        return etas.read_json(filepath)
    except FileNotFoundError:
        return None


def list_all_plugins():
    results = {
        "python": list_python_plugins(),
        "javascript": list_javascript_plugins(),
    }
    all = results.get("python", []) + results.get("javascript", [])
    return {
        "all": all,
        **results,
    }
