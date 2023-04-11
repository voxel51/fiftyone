import glob
import json
import os
import re
from io import BytesIO
from typing import Optional
from urllib.error import HTTPError
from urllib.request import urlopen
from zipfile import ZipFile

import yaml

import fiftyone as fo
from fiftyone.core import logging


class ZooPluginConfig(object):
    """A Zoo plugin configuration.

    Args:
        repo_path: the <username>/<repo> of the GitHub repo containing the plugin
        description: a description of the plugin
        installed: whether to enable the plugin in the app

    """

    def __init__(self, repo_path, description=None, installed=False):
        if not (isinstance(repo_path, str) and len(repo_path.split("/")) == 2):
            raise ValueError(
                "repo_path must be a string in the form '<username>/<repo>'"
            )
        self.plugin_name = repo_path.split("/")[1]
        self.author = repo_path.split("/")[0]
        self.description = description
        self.installed = installed


def download_zoo_plugin(
    github_repo: str, install: bool = False
) -> Optional[str]:
    """Downloads a GitHub repo into the directory specified by FIFTYONE_PLUGINS_DIR.

    Args:
        github_repo: URL or '<username>/<repo>' of the GitHub repo containing the plugin

    Returns:
        the path to the downloaded plugin
    """

    plugins_dir = fo.config.plugins_dir
    if not plugins_dir:
        raise ValueError("Plugins directory not set.")
    elif not os.path.isdir(plugins_dir):
        raise ValueError(f"Plugins directory '{plugins_dir}' does not exist.")
    zipurl = _get_zip_url(github_repo)
    try:
        with urlopen(zipurl) as zipresp:
            print(f"Downloading plugin from {zipurl}...")
            with ZipFile(BytesIO(zipresp.read())) as zfile:
                extracted_dir = zfile.namelist()[0]
                if extracted_dir in os.listdir(plugins_dir):
                    print(
                        "Plugin already exists and up to date. Skipping download."
                    )
                else:
                    print("Extracting plugin...")
                    zfile.extractall(fo.config.plugins_dir)
                    with open(
                        os.path.join(
                            plugins_dir, extracted_dir, ".app_config"
                        ),
                        "w",
                    ) as config_file:
                        config = ZooPluginConfig(
                            extracted_dir, install=install
                        )
                        config.write(f"name: {extracted_dir}")

                    print(
                        f"Downloaded plugin to {os.path.join(fo.config.plugins_dir, extracted_dir)}"
                    )
            return os.path.join(fo.config.plugins_dir, extracted_dir)
    except HTTPError as e:
        print(
            f"Error downloading archive of repo '{github_repo}' ({zipurl}): {e}"
        )
        return None


def _get_zip_url(github_repo):
    repo = github_repo.split("github.com/")[-1]
    if "tree" in repo:
        repo.replace("tree", "zipball")
    else:
        repo = repo + "/zipball"
    return f"https://api.github.com/repos/{repo}"


def install_zoo_plugin(plugin_name):
    """Enable the plugin in the app.

    Args:
        plugin_name: the name of the zoo plugin

    Returns:
        the path to the installed plugin
    """

    return _install_plugin("fiftyone.zoo.plugins", plugin_name)


def _download_plugin(module, plugin_name):
    plugin = importlib.import_module("%s.%s" % (module, plugin_name))
    return plugin.download()


def list_downloaded_zoo_plugins():
    """Returns a list of all downloaded zoo plugins."""
    return _list_plugins()


def list_installed_zoo_plugins():
    """Returns a list of all installed zoo plugins."""
    return _list_plugins(installed_only=True)


def _list_plugins(installed_only: bool = None):
    """Returns a list of zoo plugins.
    If installed_only == True, only returns installed plugins.
    If installed_only == False, only returns uninstalled plugins.
    If installed_only == None, all downloaded plugins will be listed
    """
    plugins = []
    # python plugins must have a fiftyone.yml file at the root of the plugin
    for fpath in filter(
        lambda x: x.endswith("fiftyone.yml"),
        glob.glob(os.path.join(fo.config.plugins_dir, "**"), recursive=True),
    ):
        with open(fpath) as f:
            config = yaml.safe_load(f)
            if (
                installed_only and config.get("enabled", True)
            ) or installed_only is None:
                try:
                    plugin_name = (
                        re.search(
                            r"/(?P<plugin_name>[a-zA-Z0-9_.-]+)/fiftyone.yml",
                            fpath,
                        )
                        .groupdict()
                        .get("plugin_name")
                    )
                    logging.debug(plugin_name)
                except AttributeError:
                    logging.debug(
                        "error parsing plugin_name from filepath: ", fpath
                    )

    # js plugins must have a package.json file at the root of the plugin
    for fpath in filter(
        lambda x: x.endswith("package.json"),
        glob.glob(os.path.join(fo.config.plugins_dir, "**"), recursive=True),
    ):
        with open(fpath) as f:
            config = json.load(f)

            if (
                installed_only and config.get("enabled", True)
            ) or installed_only is None:
                print(config.get("name"))

    return plugins
