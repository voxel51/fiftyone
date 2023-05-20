import os

import fiftyone as fo
import pytest
import json
import yaml
from unittest import mock
import fiftyone.plugins as fop

_DEFAULT_TEST_PLUGINS = ["test-plugin1", "test-plugin2"]
_DEFAULT_APP_CONFIG = {}
_REQUIRED_YML_KEYS = ["name", "label", "version"]


@pytest.fixture(autouse=True, scope="function")
def app_config_path(tmp_path_factory):
    fn = tmp_path_factory.mktemp(".fiftyone") / "app_config.json"
    with open(fn, "w") as f:
        f.write(json.dumps(_DEFAULT_APP_CONFIG))
    return str(fn)


@pytest.fixture(autouse=True)
def mock_app_config_env_var(app_config_path):
    with mock.patch.dict(
        os.environ, {"FIFTYONE_APP_CONFIG_PATH": app_config_path}
    ):
        yield


@pytest.fixture(autouse=True, scope="function")
def fiftyone_plugins_dir(tmp_path_factory):
    fn = tmp_path_factory.mktemp("fiftyone-plugins")
    for plugin in _DEFAULT_TEST_PLUGINS:
        os.makedirs(fn / plugin, exist_ok=True)
        with open(fn / plugin / "fiftyone.yml", "w") as f:
            pd = {k: plugin + "-" + k for k in _REQUIRED_YML_KEYS}
            f.write(yaml.dump(pd))
    return fn


def test_enable_plugin(app_config_path):
    fop.enable_plugin("my-plugin")
    with open(app_config_path, "r") as f:
        config = json.load(f)

    assert config["plugins"].get("my-plugin", {}).get("enabled", True) == True


def test_disable_plugin(app_config_path):
    fop.disable_plugin("my-plugin")
    with open(app_config_path, "r") as f:
        config = json.load(f)
    assert config["plugins"]["my-plugin"]["enabled"] == False


def test_delete_plugin_success(mocker, fiftyone_plugins_dir):
    mocker.patch("fiftyone.config.plugins_dir", fiftyone_plugins_dir)
    assert fo.config.plugins_dir == fiftyone_plugins_dir
    before_delete = fop.list_downloaded_plugins()
    to_delete = before_delete.pop()
    fop.delete_plugin(to_delete)
    after_delete = fop.list_downloaded_plugins()
    assert to_delete not in after_delete
    assert set(before_delete) == set(after_delete)


def test_list_downloaded_plugins(mocker, fiftyone_plugins_dir):
    mocker.patch("fiftyone.config.plugins_dir", fiftyone_plugins_dir)
    assert fo.config.plugins_dir == fiftyone_plugins_dir

    actual = fop.list_downloaded_plugins()

    # Test that the exact `name` from yml file is used
    expected = [n + "-name" for n in _DEFAULT_TEST_PLUGINS]
    assert len(actual) == len(expected)
    assert set(actual) == set(expected)


def test_list_enabled_plugins(mocker, fiftyone_plugins_dir):
    mocker.patch("fiftyone.config.plugins_dir", fiftyone_plugins_dir)
    assert fo.config.plugins_dir == fiftyone_plugins_dir

    # enable all
    for p in fop.list_disabled_plugins():
        fop.enable_plugin(p)
    initial = fop.list_enabled_plugins()
    expected = [n + "-name" for n in _DEFAULT_TEST_PLUGINS]
    downloaded = fop.list_downloaded_plugins()

    assert len(initial) == len(expected)
    assert set(initial) == set(expected)

    # disable one
    disabled = expected.pop()
    fop.disable_plugin(disabled)

    # verify that disabled plugin not in enabled list but still in downloaded
    actual = fop.list_enabled_plugins()
    assert disabled not in actual
    assert disabled in downloaded
    assert len(actual) == len(expected)
    assert set(actual) == set(expected)


def test_find_plugin_success(mocker, fiftyone_plugins_dir):
    mocker.patch("fiftyone.config.plugins_dir", fiftyone_plugins_dir)
    plugin_name = _DEFAULT_TEST_PLUGINS[0] + "-name"
    actual_path = fop.find_plugin(plugin_name)
    expected_path = os.path.join(
        fiftyone_plugins_dir, _DEFAULT_TEST_PLUGINS[0]
    )
    assert actual_path == expected_path


def test_find_plugin_error_not_found(mocker, fiftyone_plugins_dir):
    mocker.patch("fiftyone.config.plugins_dir", fiftyone_plugins_dir)
    plugin_dir_name = _DEFAULT_TEST_PLUGINS[0]
    with pytest.raises(ValueError):
        _ = fop.find_plugin(plugin_dir_name)


@pytest.fixture(scope="function")
def mock_plugin_package_name(plugin_name, plugin_path):
    if not plugin_name:
        plugin_name = "test-plugin1-name"
    if not plugin_path:
        plugin_path = "path/to/plugin"
    return fop.core.PluginPackage(plugin_name, plugin_path)


def test_find_plugin_error_duplicate_name(mocker, fiftyone_plugins_dir):
    mocker.patch("fiftyone.config.plugins_dir", fiftyone_plugins_dir)

    plugin_name = "test-plugin1"
    dup_plugin_dir = fiftyone_plugins_dir / "test-plugin2"
    m = mock.Mock(spec=fop.core.PluginPackage(plugin_name, "path/to/plugin"))
    with open(os.path.join(dup_plugin_dir, "fiftyone.yml"), "w") as f:
        pd = {k: plugin_name + "-" + k for k in _REQUIRED_YML_KEYS}
        f.write(yaml.dump(pd))

    with pytest.raises(ValueError):
        _ = fop.find_plugin("test-plugin1-name")
