"""
FiftyOne plugin context.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib
import importlib.abc
import importlib.machinery
import logging
import os
import sys
import traceback
import types

import fiftyone.plugins as fop
import fiftyone.plugins.constants as fpc

from fiftyone.operators.decorators import plugins_cache
from fiftyone.operators.operator import Operator

logger = logging.getLogger(__name__)

INIT_FILENAME = "__init__.py"


class PluginModuleFinder(importlib.abc.MetaPathFinder):
    """Custom meta-path finder that resolves synthetic plugin module names.

    This finder resolves the plugin module with synthetic names
    like ``fiftyone.plugins.orgs.<org>.<plugin>`` back to the original file on
    disk using the same :class:`PluginDefinition` objects that the normal
    plugin-loading path uses.
    """

    _installed = False
    _plugin_map = None  # {module_name: PluginDefinition}
    _discovering = False

    @classmethod
    def install(cls):
        """Installs this finder on ``sys.meta_path`` (idempotent)."""
        if not cls._installed:
            sys.meta_path.append(cls())
            cls._installed = True

    @classmethod
    def _get_plugin_map(cls):
        """Returns the ``{module_name: PluginDefinition}`` map.

        On first call (e.g. in a spawned child process), performs a
        lightweight filesystem scan via :func:`list_plugins` — the same
        discovery that the normal plugin-loading path uses.  No plugin
        code is executed.
        """
        if cls._plugin_map is not None:
            return cls._plugin_map

        if cls._discovering:
            return {}

        cls._discovering = True
        try:
            plugin_map = {}
            for pd in fop.list_plugins(enabled="all", builtin="all"):
                if os.path.isfile(pd.py_entry_path):
                    plugin_map[pd.module_name] = pd
            cls._plugin_map = plugin_map
        except Exception:
            logger.debug(
                "Failed to discover plugin paths for module finder",
                exc_info=True,
            )
            cls._plugin_map = {}
        finally:
            cls._discovering = False

        return cls._plugin_map

    def find_spec(self, fullname, path, target=None):
        """Implements the :class:`importlib.abc.MetaPathFinder` protocol."""
        if not fullname.startswith(fpc.PLUGIN_MODULE_PREFIX):
            return None

        plugin_map = self._get_plugin_map()

        # Registered plugin module — return a real file-backed spec
        if fullname in plugin_map:
            pd = plugin_map[fullname]
            return importlib.util.spec_from_file_location(
                fullname,
                pd.py_entry_path,
                submodule_search_locations=[pd.directory],
            )

        # Check if fullname is a namespace prefix (intermediate package)
        # e.g. "fiftyone.plugins.orgs" or "fiftyone.plugins.orgs.voxel51"
        prefix = fullname + "."
        is_prefix = fullname == fpc.PLUGIN_MODULE_PREFIX or any(
            k.startswith(prefix) for k in plugin_map
        )
        if is_prefix:
            spec = importlib.machinery.ModuleSpec(
                fullname, None, is_package=True
            )
            spec.submodule_search_locations = []
            return spec

        return None


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

            module_name = self.plugin_definition.module_name

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
