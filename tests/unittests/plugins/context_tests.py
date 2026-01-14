"""
FiftyOne plugin context tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib
import sys
from unittest import mock

import pytest
import yaml

import fiftyone.plugins.context as fpctx
import fiftyone.plugins.definitions as fpd


def test_path_based_module_name_breaks_relative_imports(tmp_path):
    """Relative imports should work even with path-based module names.

    Bug: ModuleNotFoundError: No module named 'sc' when plugin path is /sc/...
    """
    plugin_dir = tmp_path / "operators"
    plugin_dir.mkdir(parents=True)

    submodule_dir = plugin_dir / "model_evaluation"
    submodule_dir.mkdir()

    with open(submodule_dir / "utils.py", "w") as f:
        f.write("SOME_VALUE = 42\n")

    with open(submodule_dir / "__init__.py", "w") as f:
        f.write("from .utils import SOME_VALUE\n")

    with open(plugin_dir / "__init__.py", "w") as f:
        f.write("from .model_evaluation import SOME_VALUE\n")

    module_path = plugin_dir / "__init__.py"
    path_based_name = "sc.home.user.plugins.operators"

    spec = importlib.util.spec_from_file_location(
        path_based_name, str(module_path)
    )
    # Without submodule_search_locations, Python can't resolve relative imports
    spec.submodule_search_locations = None

    module = importlib.util.module_from_spec(spec)
    sys.modules[module.__name__] = module

    # This should not raise - relative imports should work
    spec.loader.exec_module(module)

    for key in list(sys.modules.keys()):
        if key.startswith("sc."):
            del sys.modules[key]


def test_plugin_registers_with_synthetic_module_name(tmp_path):
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
