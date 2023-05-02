"""
FiftyOne Plugin Definitions.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import glob
import eta.core.serial as etas

import fiftyone as fo
import os
import yaml  # BEFORE PR: add to requirements.txt
import traceback
from enum import Enum

import fiftyone.plugins.core as fopc


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


MAX_PLUGIN_SEARCH_DEPTH = 3
PLUGIN_METADATA_FILENAME = "fiftyone"
PLUGIN_METADATA_EXTENSIONS = ["yml", "yaml"]


def find_plugin_metadata_files():
    plugins_dir = fo.config.plugins_dir

    if not plugins_dir:
        return []

    normal_locations = find_files(
        plugins_dir,
        PLUGIN_METADATA_FILENAME,
        PLUGIN_METADATA_EXTENSIONS,
        MAX_PLUGIN_SEARCH_DEPTH,
    )
    node_modules_locations = find_files(
        os.path.join(plugins_dir, "node_modules", "*"),
        PLUGIN_METADATA_FILENAME,
        PLUGIN_METADATA_EXTENSIONS,
        1,
    )
    yarn_packages_locations = find_files(
        os.path.join(plugins_dir, "packages", "*"),
        PLUGIN_METADATA_FILENAME,
        PLUGIN_METADATA_EXTENSIONS,
        1,
    )
    return normal_locations + node_modules_locations + yarn_packages_locations


class PluginDefinition:
    def __init__(self, directory, metadata):
        if not metadata.get("name"):
            raise ValueError("Plugin name is required")
        self.directory = directory
        self.metadata = metadata
        self.name = metadata.get("name", None)
        self.version = metadata.get("version", None)
        self.license = metadata.get("license", None)
        self.description = metadata.get("description", None)
        self.fiftyone_compatibility = metadata.get("fiftyone", {}).get(
            "version", "*"
        )
        self.operators = metadata.get("operators", [])
        self.js_bundle = metadata.get("js_bundle", None)
        self.py_entry = metadata.get("py_entry", None)
        self.js_bundle_exists = False
        self.py_entry_exists = False
        self._load()

    @property
    def package_json_path(self):
        return os.path.join(self.directory, "package.json")

    @property
    def js_bundle_path(self):
        if self.js_bundle:
            return os.path.join(self.directory, self.js_bundle)
        return None

    @property
    def py_entry_path(self):
        if self.py_entry:
            return os.path.join(self.directory, self.py_entry)
        return None

    def _load(self):
        if not self.js_bundle:
            # check if package.json exists
            if os.path.exists(self.package_json_path):
                pkg = etas.read_json(self.package_json_path)
                self.js_bundle = pkg.get("fiftyone", {}).get("script", None)
        if not self.py_entry:
            # check if __init__.py exists
            init_py_path = os.path.join(self.directory, "__init__.py")
            if os.path.exists(init_py_path):
                self.py_entry = "__init__.py"

        if self.js_bundle:
            self.js_bundle_exists = os.path.exists(self.js_bundle_path)
        if self.py_entry:
            self.py_entry_exists = os.path.exists(self.py_entry_path)

    @property
    def server_path(self):
        return "/" + os.path.join(
            "plugins", os.path.relpath(self.directory, fo.config.plugins_dir)
        )

    @property
    def js_bundle_server_path(self):
        if self.has_js:
            return os.path.join(self.server_path, self.js_bundle)

    def can_register_operator(self, operator_name):
        if self.has_py:
            if operator_name in self.operators:
                return True
        return False

    @property
    def has_py(self):
        return self.py_entry is not None and self.py_entry_exists

    @property
    def has_js(self):
        return self.js_bundle is not None and self.js_bundle_exists

    def to_json(self):
        return {
            "name": self.name,
            "version": self.version,
            "license": self.license,
            "description": self.description,
            "fiftyone_compatibility": self.fiftyone_compatibility,
            "operators": self.operators or [],
            "js_bundle": self.js_bundle,
            "py_entry": self.py_entry,
            "js_bundle_exists": self.js_bundle_exists,
            "js_bundle_server_path": self.js_bundle_server_path,
            "has_py": self.has_py,
            "has_js": self.has_js,
        }


def load_plugin_definition(metadata_file):
    """Loads the plugin definition from the given metadata_file."""
    try:
        with open(metadata_file, "r") as f:
            metadata_dict = yaml.safe_load(f)
            module_dir = os.path.dirname(metadata_file)
            definition = PluginDefinition(module_dir, metadata_dict)
            return definition
    except:
        traceback.print_exc()
        return None


def list_plugins():
    """
    List all PluginDefinitions for enabled plugins.
    """
    plugins = [
        pd
        for pd in [
            load_plugin_definition(
                os.path.join(p.path, PLUGIN_METADATA_FILENAME + ".yml")
            )
            for p in fopc._list_plugins(enabled_only=True)
        ]
        if pd
    ]

    return validate_plugins(plugins)


class DuplicatePluginNameError(ValueError):
    pass


class InvalidPluginDefinition(ValueError):
    pass


def validate_plugins(plugins):
    """
    Validates the given list of PluginDefinitions.
    Returns a list of valid PluginDefinitions.
    """
    results = []
    names = set()
    for plugin in plugins:
        if not plugin.name:
            raise InvalidPluginDefinition(
                "Plugin definition in %s is missing a name" % plugin.directory
            )
        if plugin.name in names:
            raise DuplicatePluginNameError(
                "Plugin name %s is not unique" % plugin.name
            )
        else:
            results.append(plugin)
        names.add(plugin.name)
    return results
