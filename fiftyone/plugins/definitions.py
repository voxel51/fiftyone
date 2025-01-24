"""
Plugin definitions.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import hashlib
import os

import yaml

import eta.core.serial as etas

import fiftyone as fo
import fiftyone.plugins.constants as fpc


class PluginDefinition(object):
    """A plugin definition.

    Args:
        directory: the directory containing the plugin
        metadata: a plugin metadata dict
        shadow_paths (None): a list of plugin directories that this plugin
            shadows
    """

    _REQUIRED_METADATA_KEYS = ["name"]

    def __init__(self, directory, metadata, shadow_paths=None):
        self._directory = directory
        self._metadata = metadata
        self._shadow_paths = shadow_paths
        self._validate()

    @property
    def name(self):
        """The name of the plugin."""
        return self._metadata.get("name", None)

    @property
    def directory(self):
        """The directory containing the plugin."""
        return self._directory

    @property
    def builtin(self):
        """Whether the plugin is a builtin plugin."""
        return self.directory.startswith(fpc.BUILTIN_PLUGINS_DIR)

    @property
    def shadow_paths(self):
        """A list of plugin directories that this plugin shadows."""
        return self._shadow_paths

    @property
    def author(self):
        """The author of the plugin."""
        return self._metadata.get("author", None)

    @property
    def version(self):
        """The version of the plugin."""
        return self._metadata.get("version", None)

    @property
    def url(self):
        """The URL of the plugin."""
        return self._metadata.get("url", None)

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
        """The FiftyOne compatibility version."""
        return self._metadata.get("fiftyone", {}).get("version", None)

    @property
    def fiftyone_requirement(self):
        """The FiftyOne requirement as a string like ``fiftyone>=0.21``."""
        req_str = self.fiftyone_compatibility or ""
        req_str = req_str.strip()

        if not req_str or req_str == "*":
            return None

        if not req_str.startswith("fiftyone"):
            req_str = "fiftyone" + req_str

        return req_str

    @property
    def operators(self):
        """The operators of the plugin."""
        return self._metadata.get("operators", []) + self._metadata.get(
            "panels", []
        )

    @property
    def package_json_path(self):
        """The absolute path to the package.json file."""
        return self._get_abs_path("package.json")

    @property
    def has_package_json(self):
        """Whether the plugin has a package.json file."""
        return os.path.isfile(self.package_json_path)

    @property
    def js_bundle(self):
        """The relative path to the JS bundle file."""
        js_bundle = self._metadata.get("js_bundle", None)

        if not js_bundle and self.has_package_json:
            pkg = etas.read_json(self.package_json_path)
            js_bundle = pkg.get("fiftyone", {}).get("script", None)

        if not js_bundle:
            js_bundle = "dist/index.umd.js"

        return js_bundle

    @property
    def js_bundle_path(self):
        return self._get_abs_path(self.js_bundle)

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
        relpath = os.path.relpath(self.directory, fo.config.plugins_dir)
        return "/" + os.path.join("plugins", relpath)

    @property
    def js_bundle_server_path(self):
        """The default server path to the JS bundle."""
        if self.has_js:
            return os.path.join(self.server_path, self.js_bundle)

    @property
    def js_bundle_hash(self):
        """A hash of the plugin's JS bundle file."""
        if not self.has_js:
            return None

        try:
            with open(self.js_bundle_path, "rb") as f:
                h = hashlib.sha1()
                h.update(f.read())
                return h.hexdigest()
        except:
            return None

    def can_register_operator(self, name):
        """Whether the plugin can register the given operator.

        Args:
            name: the operator name

        Returns:
            True/False
        """
        return self.has_py and name in self.operators

    @property
    def has_py(self):
        """Whether the plugin has a Python entry file."""
        return os.path.isfile(self.py_entry_path)

    @property
    def has_js(self):
        """Whether the plugin has a JS bundle file."""
        return os.path.isfile(self.js_bundle_path)

    @property
    def secrets(self):
        """A list of required secrets for the plugin."""
        return self._metadata.get("secrets")

    def to_dict(self):
        """Returns a JSON dict representation of the plugin metadata.

        Returns:
            a JSON dict
        """
        return {
            "name": self.name,
            "builtin": self.builtin,
            "author": self.author,
            "version": self.version,
            "url": self.url,
            "license": self.license,
            "description": self.description,
            "fiftyone_compatibility": self.fiftyone_compatibility,
            "operators": self._metadata.get("operators", []),
            "panels": self._metadata.get("panels", []),
            "js_bundle": self.js_bundle,
            "py_entry": self.py_entry,
            "js_bundle_exists": self.has_js,
            "js_bundle_server_path": self.js_bundle_server_path,
            "js_bundle_hash": self.js_bundle_hash,
            "has_py": self.has_py,
            "has_js": self.has_js,
            "server_path": self.server_path,
            "secrets": self.secrets,
            "shadow_paths": self.shadow_paths,
        }

    @classmethod
    def from_disk(cls, metadata_path, shadow_paths=None):
        """Creates a :class:`PluginDefinition` for the given metadata file.

        Args:
            metadata_path: the path to a plugin ``.yaml`` file
            shadow_paths (None): a list of plugin directories that this plugin
                shadows

        Returns:
            a :class:`PluginDefinition`
        """
        dirpath = os.path.dirname(metadata_path)
        with open(metadata_path, "r") as f:
            metadata = yaml.safe_load(f)

        return cls(dirpath, metadata, shadow_paths=shadow_paths)

    def _validate(self):
        missing = [
            k for k in self._REQUIRED_METADATA_KEYS if k not in self._metadata
        ]
        if missing:
            raise ValueError(
                f"Plugin metadata is missing required fields: {missing}"
            )

    def _get_abs_path(self, filename):
        if not filename:
            return None

        return os.path.join(self.directory, filename)
