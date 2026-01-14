"""
FiftyOne plugin context.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib
import logging
import os
import re
import sys
import traceback
import types

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.plugins as fop

from fiftyone.operators.decorators import plugins_cache
from fiftyone.operators.operator import Operator


logger = logging.getLogger(__name__)

INIT_FILENAME = "__init__.py"
PLUGIN_MODULE_PREFIX = "fiftyone.plugins.orgs"


def _to_python_safe_name(name):
    """Converts a name to a Python-safe identifier.

    - PascalCase → snake_case
    - Hyphens/spaces → underscores
    - Strips leading @ symbol
    """
    if not name:
        return name

    # Strip @ prefix
    name = name.lstrip("@")

    # PascalCase to snake_case: insert underscore before uppercase letters
    name = re.sub(r"(?<!^)(?=[A-Z])", "_", name)

    # Replace hyphens and spaces with underscores, lowercase
    name = re.sub(r"[-\s]+", "_", name).lower()

    # Remove any remaining non-alphanumeric characters except underscore
    name = re.sub(r"[^a-z0-9_]", "", name)

    # Ensure doesn't start with a number
    if name and name[0].isdigit():
        name = "_" + name

    return name


def _get_plugin_module_name(plugin_name, fallback_name=None):
    """Gets the synthetic module name for a plugin.

    Args:
        plugin_name: the plugin name (e.g., "@org/plugin" or "plugin")
        fallback_name: fallback name to use if plugin_name can't be parsed

    Returns:
        module name like "fiftyone.plugins.orgs.<org>.<plugin>"
    """
    org = "external"
    name = None

    if plugin_name:
        if "/" in plugin_name:
            parts = plugin_name.split("/", 1)
            org = _to_python_safe_name(parts[0])
            name = _to_python_safe_name(parts[1])
        else:
            name = _to_python_safe_name(plugin_name)

    # Ensure we have valid names
    org = org or "external"
    name = name or _to_python_safe_name(fallback_name) or "plugin"

    return f"{PLUGIN_MODULE_PREFIX}.{org}.{name}"


def _ensure_parent_modules(module_name, plugin_dir):
    """Ensures parent namespace packages exist in sys.modules.

    This enables absolute imports like:
        from fiftyone.plugins.orgs.myorg.myplugin.submodule import X
    """
    parts = module_name.split(".")

    for i in range(1, len(parts)):
        parent_name = ".".join(parts[:i])
        if parent_name not in sys.modules:
            parent_module = types.ModuleType(parent_name)
            parent_module.__path__ = []
            parent_module.__package__ = parent_name
            sys.modules[parent_name] = parent_module

    # Set the plugin directory as search path on the immediate parent
    # so absolute imports of plugin submodules work
    plugin_parent = ".".join(parts[:-1])
    if plugin_parent in sys.modules:
        parent = sys.modules[plugin_parent]
        if hasattr(parent, "__path__") and plugin_dir not in parent.__path__:
            parent.__path__.append(plugin_dir)


@plugins_cache
def build_plugin_contexts(enabled=True):
    """Returns contexts for all available plugins.

    Args:
        enabled (True): whether to include only enabled plugins (True) or only
            disabled plugins (False) or all plugins ("all")

    Returns:
        a list of :class:`PluginContext` instances
    """
    plugin_contexts = []
    for pd in fop.list_plugins(enabled=enabled, builtin="all"):
        pctx = PluginContext(pd)
        pctx.register_all()
        plugin_contexts.append(pctx)

    return plugin_contexts


class PluginContext(object):
    """Context that represents a plugin and the Python objects it creates.

    Args:
        plugin_definition: the :class:`fiftyone.plugins.PluginDefinition` for
            the plugin
    """

    def __init__(self, plugin_definition):
        self.plugin_definition = plugin_definition
        self.instances = []
        self.errors = []

    @property
    def name(self):
        """The plugin name."""
        return self.plugin_definition.name

    @property
    def secrets(self):
        """List of keys for required secrets as specified in the plugin
        definition.
        """
        return self.plugin_definition.secrets

    def has_errors(self):
        """Determines whether the plugin has errors.

        Returns:
            True/False
        """
        return bool(self.errors)

    def can_register(self, instance):
        """Determines whether the given operator can be registered.

        Args:
            instance: an :class:`fiftyone.operators.operator.Operator`

        Returns:
            True/False
        """
        if not isinstance(instance, Operator):
            return False

        return self.plugin_definition.can_register_operator(instance.name)

    def register(self, cls):
        """Registers the given operator on the plugin.

        .. note::

            Any errors are logged rather than being raised.

        Args:
            cls: an :class:`fiftyone.operators.operator.Operator` or
                :class:`fiftyone.operators.panel.Panel` class
        """
        try:
            instance = cls(_builtin=self.plugin_definition.builtin)
            if self.can_register(instance):
                instance.plugin_name = self.name
                if self.secrets:
                    instance.add_secrets(self.secrets)
                self.instances.append(instance)
        except:
            logger.warning(
                f"Failed to register operator {cls.__name__} on plugin {self.name}"
            )
            self.errors.append(traceback.format_exc())

    def register_all(self):
        """Registers all operators defined by the plugin on this context.

        .. note::

            Any errors are logged rather than being raised.
        """
        self.dispose_all()

        try:
            module_dir = self.plugin_definition.directory
            entrypoint = self.plugin_definition.py_entry
            module_path = os.path.join(module_dir, entrypoint)

            # Verify the resolved path is within the plugin directory
            if os.path.isabs(entrypoint) or ".." in os.path.normpath(
                entrypoint
            ):
                raise ValueError(
                    f"Invalid plugin's Python entrypoint: {entrypoint}"
                )

            real_module_path = os.path.realpath(module_path)
            real_module_dir = os.path.realpath(module_dir)
            if not (
                real_module_path == real_module_dir
                or real_module_path.startswith(real_module_dir + os.sep)
            ):
                raise ValueError(
                    "Plugin's Python entrypoint must be located within the plugin directory"
                )

            if not os.path.isfile(module_path):
                return

            # Use synthetic module name based on plugin name to avoid
            # path-dependent naming issues (e.g., /sc/... becoming sc.home...)
            fallback_name = os.path.basename(module_dir)
            module_name = _get_plugin_module_name(self.name, fallback_name)

            _ensure_parent_modules(module_name, module_dir)

            spec = importlib.util.spec_from_file_location(
                module_name, module_path
            )
            module = importlib.util.module_from_spec(spec)
            sys.modules[module.__name__] = module
            spec.loader.exec_module(module)
            module.register(self)
        except:
            logger.warning(
                f"Failed to register operators for plugin {self.name}"
            )
            self.errors.append(traceback.format_exc())

    def dispose_all(self):
        """Disposes all operators from this context."""
        self.instances.clear()
        self.errors.clear()
