"""
Plugin definitions.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import yaml

import eta.core.serial as etas

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.utils as fou


REQUIRED_PLUGIN_METADATA_KEYS = ["name"]


logger = logging.getLogger(__name__)


def load_plugin_definition(metadata_path):
    """Loads the plugin definition from the given metadata file.

    Args:
        metadata_path: path to the plugin metadata

    Returns:
        a :class:`PluginDefinition`
    """
    try:
        module_dir = os.path.dirname(metadata_path)
        with open(metadata_path, "r") as f:
            metadata_dict = yaml.safe_load(f)
            return PluginDefinition(module_dir, metadata_dict)
    except Exception as e:
        logger.warning(
            "Failed to load plugin metadata from '%s': %s", metadata_path, e
        )
        return None


def validate_plugins(plugins):
    """Validates the given plugin definitions, checking for things like missing
    or duplicate names.

    Args:
        plugins: a list of :class:`PluginDefinition` instances

    Returns:
        a list of valid :class:`PluginDefinition` instances
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


class PluginDefinition(object):
    """A plugin definition.

    Args:
        directory: the directory containing the plugin
        metadata: a dict of plugin metadata

    Attributes:
        directory: the directory containing the plugin
        js_bundle: relative path to the JS bundle file
        js_bundle_path: absolute path to the JS bundle file
        py_entry: relative path to the Python entry file
        py_entry_path: absolute path to the Python entry file
    """

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

        missing_metadata_keys = [
            k
            for k in REQUIRED_PLUGIN_METADATA_KEYS
            if not self._metadata.get(k, None)
        ]
        if len(missing_metadata_keys) > 0:
            raise ValueError(
                f"Plugin definition missing required fields: {missing_metadata_keys}"
            )

    def _get_abs_path(self, filename):
        if not filename:
            return None
        return os.path.join(self.directory, filename)

    @property
    def name(self):
        """The name of the plugin."""
        return self._metadata.get("name", None)

    @property
    def author(self):
        """The author of the plugin."""
        return self._metadata.get("author", None)

    @property
    def version(self):
        """The version of the plugin."""
        return self._metadata.get("version", None)

    @property
    def license(self):
        """The license of the plugin."""
        return self._metadata.get("license", None)

    @property
    def description(self):
        """The description of the plugin."""
        return self._metadata.get("description", None)

    @property
    def fiftyone_compatibility(self):
        """The FiftyOne compatible version as a semver string."""
        return self._metadata.get("fiftyone", {}).get("version", foc.Version)

    @property
    def operators(self):
        """The operators of the plugin."""
        return self._metadata.get("operators", [])

    @property
    def package_json_path(self):
        """The absolute path to the package.json file."""
        return self._get_abs_path("package.json")

    @property
    def has_package_json(self):
        """Whether the plugin has a package.json file."""
        return os.path.exists(self.package_json_path)

    @property
    def js_bundle(self):
        """The relative path to the JS bundle file."""
        js_bundle = self._metadata.get("js_bundle", None)
        if not js_bundle and self.has_package_json:
            pkg = etas.read_json(self.package_json_path)
            js_bundle = pkg.get("fiftyone", {}).get("script", None)
        return js_bundle or "dist/index.umd.js"

    @property
    def js_bundle_path(self):
        js_bundle = self.js_bundle
        return self._get_abs_path(js_bundle)

    @property
    def py_entry(self):
        return self._metadata.get("py_entry", "__init__.py")

    @property
    def py_entry_path(self):
        """The absolute path to the Python entry file."""
        return self._get_abs_path(self.py_entry)

    @property
    def server_path(self):
        """The default server path to the plugin."""
        return "/" + os.path.join(
            "plugins", os.path.relpath(self.directory, fo.config.plugins_dir)
        )

    @property
    def js_bundle_server_path(self):
        """The default server path to the JS bundle."""
        if self.has_js:
            return os.path.join(self.server_path, self.js_bundle)

    def can_register_operator(self, operator_name):
        """Whether the plugin can register the given operator."""
        if self.has_py and (operator_name in self.operators):
            return True
        return False

    @property
    def has_py(self):
        """Whether the plugin has a Python entry file."""
        return os.path.exists(self.py_entry_path)

    @property
    def has_js(self):
        """Whether the plugin has a JS bundle file."""
        return os.path.exists(self.js_bundle_path)

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
            "server_path": self.server_path,
        }


class DuplicatePluginNameError(ValueError):
    pass


class InvalidPluginDefinition(ValueError):
    pass
