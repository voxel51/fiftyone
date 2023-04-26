import os
from unittest.mock import patch

import fiftyone as fo
import pytest
import tempfile
import json
import yaml
from unittest import mock
import fiftyone.plugins as fop

_DEFAULT_TEST_PLUGINS = ["test-plugin1", "test-plugin2"]
_DEFAULT_APP_CONFIG = {}
_REQUIRED_YML_KEYS = ["name", "label", "version"]


@pytest.fixture(scope="function")
def app_config_path(tmp_path_factory):
    fn = tmp_path_factory.mktemp(".fiftyone") / "app_config.json"
    with open(fn, "w") as f:
        f.write(json.dumps(_DEFAULT_APP_CONFIG))
    return fn


@pytest.fixture(autouse=True, scope="function")
def fiftyone_plugins_dir(tmp_path_factory):
    fn = tmp_path_factory.mktemp("fiftyone-plugins")
    for plugin in _DEFAULT_TEST_PLUGINS:
        os.makedirs(fn / plugin, exist_ok=True)
        with open(fn / plugin / "fiftyone.yml", "w") as f:
            pd = {k: plugin + "-" + k for k in _REQUIRED_YML_KEYS}
            f.write(yaml.dump(pd))
    return fn


def test_enable_plugin(mocker, app_config_path):
    mocker.patch(
        "fiftyone.core.config.locate_app_config", return_value=app_config_path
    )
    fop.enable_plugin("my-plugin")
    with open(app_config_path, "r") as f:
        config = json.load(f)
    assert config["plugins"]["my-plugin"]["enabled"] == True


def test_disable_plugin(mocker, app_config_path):
    mocker.patch(
        "fiftyone.core.config.locate_app_config", return_value=app_config_path
    )
    fop.disable_plugin("my-plugin")
    with open(app_config_path, "r") as f:
        config = json.load(f)
    assert config["plugins"]["my-plugin"]["enabled"] == False


def test_delete_plugin_success(mocker, fiftyone_plugins_dir):
    mocker.patch("fiftyone.config.plugins_dir", fiftyone_plugins_dir)
    print(os.listdir(fiftyone_plugins_dir))
    assert fo.config.plugins_dir == fiftyone_plugins_dir


def test_list_downloaded_plugins(mocker, fiftyone_plugins_dir):
    mocker.patch("fiftyone.config.plugins_dir", fiftyone_plugins_dir)
    mocker.patch("fiftyone.plugins.core._PLUGIN_DIRS", [fiftyone_plugins_dir])
    assert fo.config.plugins_dir == fiftyone_plugins_dir

    actual = fop.list_downloaded_plugins()

    # Test that the exact `name` from yml file is used
    expected = [n + "-name" for n in _DEFAULT_TEST_PLUGINS]
    assert len(actual) == len(expected)
    assert all([a == b for a, b in zip(actual, expected)])


#
def test_list_enabled_plugins(mocker, fiftyone_plugins_dir):
    mocker.patch("fiftyone.config.plugins_dir", fiftyone_plugins_dir)
    mocker.patch("fiftyone.plugins.core._PLUGIN_DIRS", [fiftyone_plugins_dir])
    assert fo.config.plugins_dir == fiftyone_plugins_dir

    # enable all
    for p in fop.list_disabled_plugins():
        fop.enable_plugin(p)
    initial = fop.list_enabled_plugins()
    expected = [n + "-name" for n in _DEFAULT_TEST_PLUGINS]
    downloaded = fop.list_downloaded_plugins()

    assert len(initial) == len(expected)
    assert all([a == b for a, b in zip(initial, expected)])
    assert all([a == b for a, b in zip(downloaded, expected)])

    # disable one
    disabled = expected.pop()
    fop.disable_plugin(disabled)

    # verify that disabled plugin not in enabled list but still in downloaded
    actual = fop.list_enabled_plugins()
    assert disabled not in actual
    assert disabled in downloaded
    assert len(actual) == len(expected)
    assert all([a == b for a, b in zip(actual, expected)])


def test_find_plugin_success(mocker, fiftyone_plugins_dir):
    mocker.patch("fiftyone.plugins.core._PLUGIN_DIRS", [fiftyone_plugins_dir])
    plugin_name = _DEFAULT_TEST_PLUGINS[0] + "-name"
    actual_path = fop.find_plugin(plugin_name)
    expected_path = os.path.join(
        fiftyone_plugins_dir, _DEFAULT_TEST_PLUGINS[0]
    )
    assert actual_path == expected_path


#
def test_find_plugin_error_not_found(mocker, fiftyone_plugins_dir):
    mocker.patch("fiftyone.plugins.core._PLUGIN_DIRS", [fiftyone_plugins_dir])
    plugin_dir_name = _DEFAULT_TEST_PLUGINS[0]
    with pytest.raises(ValueError):
        _ = fop.find_plugin(plugin_dir_name)


def mock_plugin_package_name(plugin_name, plugin_path):
    if not plugin_name:
        plugin_name = "test-plugin1-name"
    if not plugin_path:
        plugin_path = "path/to/plugin"
    return fop.plugin_package(plugin_name, plugin_path)


def test_find_plugin_error_duplicate_name(fiftyone_plugins_dir):
    # with patch("fiftyone.plugins.core.plugin_package") as mock:
    plugin_name = "test-plugin1-name"
    m = mock.Mock(spec=fop.core.plugin_package(plugin_name, "path/to/plugin"))

    with pytest.raises(ValueError):
        _ = fop.find_plugin("test-plugin1-name")


# def test_download_plugin_success():
#
# def test_download_plugin_no_redownload():
#
# def test_download_plugin_force_redownload():
#
# def test_download_plugin_error_bad_url():
#
# def test_download_plugin_error_bad_zip():
#
