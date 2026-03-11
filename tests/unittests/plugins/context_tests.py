"""
FiftyOne plugin context tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import multiprocessing
import os
import pickle
import sys
from unittest import mock

import pytest
import yaml

import fiftyone.plugins.context as fpctx
import fiftyone.plugins.definitions as fpd


class TestPluginModuleNameParsing:
    """Tests for _to_python_safe_name and _get_plugin_module_name."""

    @pytest.mark.parametrize(
        "input_name,expected",
        [
            ("simple", "simple"),
            ("my-plugin", "my_plugin"),
            ("my_plugin", "my_plugin"),
            ("MyPlugin", "my_plugin"),
            ("FooBatBar", "foo_bat_bar"),
            ("@org", "org"),
            ("my plugin", "my_plugin"),
            ("123plugin", "_123plugin"),
            ("", ""),
        ],
    )
    def test_to_python_safe_name(self, input_name, expected):
        assert fpd._to_python_safe_name(input_name) == expected

    @pytest.mark.parametrize(
        "plugin_name,fallback,expected",
        [
            ("@org/plugin", None, "fiftyone.plugins.orgs.org.plugin"),
            (
                "@test_org/test_plugin",
                None,
                "fiftyone.plugins.orgs.test_org.test_plugin",
            ),
            (
                "@MyOrg/MyPlugin",
                None,
                "fiftyone.plugins.orgs.my_org.my_plugin",
            ),
            (
                "@org-name/plugin-name",
                None,
                "fiftyone.plugins.orgs.org_name.plugin_name",
            ),
            (
                "plugin-name",
                None,
                "fiftyone.plugins.orgs.external.plugin_name",
            ),
            (
                "SimplePlugin",
                None,
                "fiftyone.plugins.orgs.external.simple_plugin",
            ),
            (
                None,
                "fallback-dir",
                "fiftyone.plugins.orgs.external.fallback_dir",
            ),
            ("", "my-dir", "fiftyone.plugins.orgs.external.my_dir"),
        ],
    )
    def test_get_plugin_module_name(self, plugin_name, fallback, expected):
        assert fpd._get_plugin_module_name(plugin_name, fallback) == expected


class TestPluginRegistration:
    """Tests for plugin module registration."""

    def test_plugin_registers_with_synthetic_module_name(self, tmp_path):
        """Plugin modules should use fiftyone.plugins.orgs.<org>.<plugin> namespace."""
        plugin_dir = tmp_path / "test-plugin"
        plugin_dir.mkdir(parents=True)

        metadata = {
            "name": "@test_org/test_plugin",
            "label": "Test Plugin",
            "version": "1.0.0",
            "operators": ["TestOperator"],
        }
        with open(plugin_dir / "fiftyone.yml", "w") as f:
            yaml.dump(metadata, f)

        with open(plugin_dir / "__init__.py", "w") as f:
            f.write("def register(ctx): pass\n")

        with mock.patch("fiftyone.config.plugins_dir", str(tmp_path)):
            plugin_def = fpd.PluginDefinition(str(plugin_dir), metadata)
            ctx = fpctx.PluginContext(plugin_def)
            ctx.register_all()

            expected_module_name = "fiftyone.plugins.orgs.test_org.test_plugin"
            assert expected_module_name in sys.modules

    def test_plugin_without_org_uses_external_namespace(self, tmp_path):
        """Plugins without org should use 'external' namespace."""
        plugin_dir = tmp_path / "my-plugin"
        plugin_dir.mkdir(parents=True)

        metadata = {
            "name": "my-plugin",
            "label": "My Plugin",
            "version": "1.0.0",
            "operators": ["TestOperator"],
        }
        with open(plugin_dir / "fiftyone.yml", "w") as f:
            yaml.dump(metadata, f)

        with open(plugin_dir / "__init__.py", "w") as f:
            f.write("def register(ctx): pass\n")

        with mock.patch("fiftyone.config.plugins_dir", str(tmp_path)):
            plugin_def = fpd.PluginDefinition(str(plugin_dir), metadata)
            ctx = fpctx.PluginContext(plugin_def)
            ctx.register_all()

            expected_module_name = "fiftyone.plugins.orgs.external.my_plugin"
            assert expected_module_name in sys.modules

    def test_relative_imports_work(self, tmp_path):
        """Relative imports should work within plugins."""
        plugin_dir = tmp_path / "test-plugin"
        plugin_dir.mkdir(parents=True)

        submodule_dir = plugin_dir / "utils"
        submodule_dir.mkdir()
        with open(submodule_dir / "__init__.py", "w") as f:
            f.write("VALUE = 42\n")

        with open(plugin_dir / "__init__.py", "w") as f:
            f.write(
                """
from .utils import VALUE

def register(ctx):
    ctx.test_value = VALUE
"""
            )

        metadata = {
            "name": "@myorg/myplugin",
            "label": "My Plugin",
            "version": "1.0.0",
            "operators": ["TestOperator"],
        }
        with open(plugin_dir / "fiftyone.yml", "w") as f:
            yaml.dump(metadata, f)

        with mock.patch("fiftyone.config.plugins_dir", str(tmp_path)):
            plugin_def = fpd.PluginDefinition(str(plugin_dir), metadata)
            ctx = fpctx.PluginContext(plugin_def)
            ctx.register_all()

            assert not ctx.has_errors(), f"Plugin had errors: {ctx.errors}"
            # pylint: disable=no-member
            assert ctx.test_value == 42

    def test_absolute_imports_work(self, tmp_path):
        """Absolute imports should work for plugin submodules."""
        plugin_dir = tmp_path / "test-plugin"
        plugin_dir.mkdir(parents=True)

        submodule_dir = plugin_dir / "helpers"
        submodule_dir.mkdir()
        with open(submodule_dir / "__init__.py", "w") as f:
            f.write("HELPER_VALUE = 99\n")

        with open(plugin_dir / "__init__.py", "w") as f:
            f.write(
                """
import importlib

def register(ctx):
    # Import using absolute path
    helpers = importlib.import_module(
        "fiftyone.plugins.orgs.testorg.testplugin.helpers"
    )
    ctx.helper_value = helpers.HELPER_VALUE
"""
            )

        metadata = {
            "name": "@testorg/testplugin",
            "label": "Test Plugin",
            "version": "1.0.0",
            "operators": ["TestOperator"],
        }
        with open(plugin_dir / "fiftyone.yml", "w") as f:
            yaml.dump(metadata, f)

        with mock.patch("fiftyone.config.plugins_dir", str(tmp_path)):
            plugin_def = fpd.PluginDefinition(str(plugin_dir), metadata)
            ctx = fpctx.PluginContext(plugin_def)
            ctx.register_all()

            assert not ctx.has_errors(), f"Plugin had errors: {ctx.errors}"
            # pylint: disable=no-member
            assert ctx.helper_value == 99


def _make_plugin(tmp_path, name="@test_org/spawn_plugin", operators=None):
    """Helper to create a temporary plugin on disk and return its definition."""
    plugin_dir = tmp_path / "spawn-plugin"
    plugin_dir.mkdir(parents=True, exist_ok=True)

    metadata = {
        "name": name,
        "label": "Spawn Test Plugin",
        "version": "1.0.0",
        "operators": operators or ["SpawnOperator"],
    }
    with open(plugin_dir / "fiftyone.yml", "w") as f:
        yaml.dump(metadata, f)

    with open(plugin_dir / "__init__.py", "w") as f:
        f.write(
            """
def worker_fn(x):
    return x * 2


def register(ctx):
    pass
"""
        )

    return fpd.PluginDefinition(str(plugin_dir), metadata)


def _clear_synthetic_modules(module_name):
    """Remove a synthetic plugin module and its parents from sys.modules."""
    to_remove = [
        k
        for k in sys.modules
        if k == module_name or k.startswith(module_name + ".")
    ]
    parts = module_name.split(".")
    for i in range(len(parts), 0, -1):
        prefix = ".".join(parts[:i])
        if (
            prefix.startswith("fiftyone.plugins.orgs")
            and prefix != "fiftyone.plugins"
        ):
            to_remove.append(prefix)

    for k in set(to_remove):
        sys.modules.pop(k, None)


def _reset_finder():
    """Reset finder state to simulate a fresh process."""
    fpctx.PluginModuleFinder._plugin_map = None
    fpctx.PluginModuleFinder._discovering = False


class TestPluginModuleFinder:
    """Tests for PluginModuleFinder resolving synthetic modules in a
    spawn multiprocessing context where sys.modules is empty."""

    def test_plugin_function_survives_pickle_roundtrip(self, tmp_path):
        """A function from a plugin module should be picklable and
        unpicklable via the finder — this is what multiprocessing.spawn does."""
        pd = _make_plugin(tmp_path)
        module_name = pd.module_name

        with mock.patch("fiftyone.config.plugins_dir", str(tmp_path)):
            ctx = fpctx.PluginContext(pd)
            ctx.register_all()

            fn = sys.modules[module_name].worker_fn
            pickled = pickle.dumps(fn)

            # Simulate spawn: clear modules, reset finder
            _clear_synthetic_modules(module_name)
            _reset_finder()

            restored_fn = pickle.loads(pickled)
            assert restored_fn(7) == 14

    def test_spawn_process_can_call_plugin_function(self, tmp_path):
        """End-to-end: a spawn child process should be able to call a
        function defined in a plugin module."""
        pd = _make_plugin(tmp_path)
        module_name = pd.module_name

        # Use env var so the spawn child (fresh process) discovers the plugin
        old_env = os.environ.get("FIFTYONE_PLUGINS_DIR")
        old_db_admin = os.environ.get("FIFTYONE_DATABASE_ADMIN")
        os.environ["FIFTYONE_PLUGINS_DIR"] = str(tmp_path)
        os.environ["FIFTYONE_DATABASE_ADMIN"] = "false"
        try:
            with mock.patch("fiftyone.config.plugins_dir", str(tmp_path)):
                ctx = fpctx.PluginContext(pd)
                ctx.register_all()

                fn = sys.modules[module_name].worker_fn

                mp_ctx = multiprocessing.get_context("spawn")
                with mp_ctx.Pool(1) as pool:
                    results = pool.map(fn, [1, 2, 3])

                assert results == [2, 4, 6]
        finally:
            if old_env is None:
                os.environ.pop("FIFTYONE_PLUGINS_DIR", None)
            else:
                os.environ["FIFTYONE_PLUGINS_DIR"] = old_env
            if old_db_admin is None:
                os.environ.pop("FIFTYONE_DATABASE_ADMIN", None)
            else:
                os.environ["FIFTYONE_DATABASE_ADMIN"] = old_db_admin
