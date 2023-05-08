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
import yaml
import traceback

import fiftyone.plugins.core as fopc
import fiftyone.constants as foc

REQUIRED_PLUGIN_METADATA_KEYS = ["name"]


class PluginDefinition:
    def __init__(self, directory, metadata):
        missing = []
        if not directory:
            missing.append("directory")
        if not metadata:
            missing.append("metadata")
        if len(missing) > 0:
            raise ValueError("Missing required fields: %s" % missing)

        self.directory = directory
        self._metadata = metadata
        self.js_bundle = None
        self.js_bundle_path = None
        self.py_entry = None
        self.py_entry_path = None
        self._load_and_validate()

    def _get_fullpath(self, filename):
        if not filename:
            return None
        if filename in os.listdir(self.directory):
            return os.path.join(self.directory, filename)
        return None

    @property
    def name(self):
        return self._metadata.get("name", None)

    @property
    def author(self):
        return self._metadata.get("author", None)

    @property
    def version(self):
        return self._metadata.get("version", None)

    @property
    def license(self):
        return self._metadata.get("license", None)

    @property
    def description(self):
        return self._metadata.get("description", None)

    @property
    def fiftyone_compatibility(self):
        return self._metadata.get("fiftyone", {}).get("version", foc.Version)

    @property
    def operators(self):
        return self._metadata.get("operators", [])

    @property
    def package_json_path(self):
        return self._get_fullpath("package.json")

    def _set_js_bundle_path(self):
        js_bundle = self._metadata.get("js_bundle", None)
        path = self._get_fullpath(js_bundle)
        if not path:
            if self.package_json_path:
                pkg = etas.read_json(self.package_json_path)
                js_bundle = pkg.get("fiftyone", {}).get("script", None)
                path = self._get_fullpath(js_bundle)
        if path:
            self.js_bundle_path = path
            self.js_bundle = js_bundle

    def _set_py_entry_path(self):
        py_entry = self._metadata.get("py_entry", None)
        path = self._get_fullpath(py_entry)
        if not path:
            # check for __init__.py if none specified
            py_entry = "__init__.py"
            path = self._get_fullpath(py_entry)
        if path:
            self.py_entry = py_entry
            self.py_entry_path = path
        return None

    def _load_and_validate(self):
        missing_metadata_keys = [
            k
            for k in REQUIRED_PLUGIN_METADATA_KEYS
            if not self._metadata.get(k, None)
        ]
        if len(missing_metadata_keys) > 0:
            raise ValueError(
                f"Plugin definition missing required fields: {missing_metadata_keys}"
            )
        self._set_js_bundle_path()
        self._set_py_entry_path()

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
        if self.has_py and (operator_name in self.operators):
            return True
        return False

    @property
    def has_py(self):
        return bool(self.py_entry_path)

    @property
    def has_js(self):
        return bool(self.js_bundle_path)

    def to_json(self):
        return {
            "name": self.name,
            "author": self.author,
            "version": self.version,
            "license": self.license,
            "description": self.description,
            "fiftyone_compatibility": self.fiftyone_compatibility,
            "operators": self.operators or [],
            "js_bundle": self.js_bundle,
            "py_entry": self.py_entry,
            "js_bundle_exists": self.has_js,
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
            load_plugin_definition(p.metadata_filepath)
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
