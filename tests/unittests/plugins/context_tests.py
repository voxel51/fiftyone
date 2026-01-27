"""
FiftyOne plugin context tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

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
        assert fpctx._to_python_safe_name(input_name) == expected

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
        assert fpctx._get_plugin_module_name(plugin_name, fallback) == expected


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
