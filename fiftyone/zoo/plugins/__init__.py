import configparser
import glob
import json
import logging
import os
import re
import shutil
from io import BytesIO
from typing import Optional, Set
from urllib.error import HTTPError
from urllib.request import urlopen
from zipfile import ZipFile

import eta.core.serial as etas
import eta.core.web as etaw
import yaml

import fiftyone as fo
import fiftyone.zoo.utils.github as fozug
import datetime


class GitHubRepo:
    """A GitHub repo containing a FiftyOne zoo package"""

    def __init__(self, repo_or_url: str):
        """
        Args:
            github_repo: URL or '<user>/<repo>[/<ref>]' of the GitHub repo containing the plugin
        """
        if not etaw.is_url(repo_or_url):
            params = fozug.parse_repo(repo_or_url)
        else:
            params = fozug.parse_url(repo_or_url)
        self._user = params.get("user")
        self._name = params.get("repo")
        self._ref = params.get("branch")
        self.download_url = fozug.get_zip_url(repo_or_url)

    @property
    def user(self) -> str:
        return self._user

    @property
    def name(self) -> str:
        return self._name

    @property
    def ref(self) -> Optional[str]:
        return self._ref

    @ref.setter
    def ref(self, ref: str):
        self._ref = ref


class ZooPluginConfig(etas.Serializable):
    """A Zoo plugin configuration."""

    def __init__(
        self,
        /,
        plugin_name: str,
        author: str,
        ref: str = "",
        description: str = "",
        installed: bool = False,
    ):
        """
        Args:
            repo_path: the <username>/<repo> of the GitHub repo containing the plugin
            description: a description of the plugin
            installed: whether to enable the plugin in the app
        """
        self.plugin_name = plugin_name
        self.author = author
        self.ref = ref
        self.description = description
        self.installed = installed
        self.download_url = fozug.get_zip_url(
            os.path.join(author, plugin_name), ref=ref
        )
        self.download_date = datetime.datetime.utcnow().strftime(
            "%Y-%m-%d %H:%M:%S"
        )

    def save(self) -> None:
        config = configparser.ConfigParser()
        config["SETTINGS"] = {"installed": str(self.installed).lower()}
        config["INFO"] = {
            "plugin_name": self.plugin_name,
            "author": self.author,
            "ref": self.ref,
            "description": self.description,
            "installed": self.installed,
            "download_url": self.download_url,
            "download_date": self.download_date,
        }
        plugin_download_dir_name = "-".join(
            [self.author, self.plugin_name, self.ref]
        )
        plugin_download_dir_path = find_zoo_plugin(plugin_download_dir_name)
        print(f"Checking {plugin_download_dir_path} for plugin files")
        if os.path.isdir(plugin_download_dir_path):
            print("Writing config file to: ", plugin_download_dir_path)
            with open(
                os.path.join(plugin_download_dir_path, ".fiftyone-plugin"), "w"
            ) as configfile:
                config.write(configfile)
        else:
            logging.warning(
                f" `Plugin directory '{plugin_download_dir_path}' does not exist. Cannot save config."
            )


def download_zoo_plugin(
    github_repo: str, install: bool = False
) -> Optional[str]:
    """Downloads a GitHub repo into the directory specified by FIFTYONE_PLUGINS_DIR.

    Args:
        github_repo: URL or '<user>/<repo>[/<ref>]' of the GitHub repo containing the plugin

    Returns:
        the path to the downloaded plugin
    """
    plugins_dir = fo.config.plugins_dir
    if not plugins_dir:
        raise ValueError("Plugins directory not set.")
    elif not os.path.isdir(plugins_dir):
        raise ValueError(f"Plugins directory '{plugins_dir}' does not exist.")
    gh_repo = GitHubRepo(github_repo)
    zipurl = gh_repo.download_url
    try:
        with urlopen(zipurl) as zipresp:
            print(f"Attempting to download plugin from {zipurl}...")
            with ZipFile(BytesIO(zipresp.read())) as zfile:
                extracted_dir = zfile.namelist()[0]
                gh_repo.ref = extracted_dir.rsplit("-")[-1]
                if _is_downloaded(extracted_dir):
                    print(
                        "Plugin already downloaded and up to date. Skipping download."
                    )
                else:
                    print(f"Extracting plugin to {extracted_dir}...")
                    zfile.extractall(fo.config.plugins_dir)
                    config = ZooPluginConfig(
                        author=gh_repo.user,
                        plugin_name=gh_repo.name,
                        ref=gh_repo.ref,
                        installed=install,
                    )
                    config.save()

                    print(
                        f"Downloaded plugin to {os.path.join(fo.config.plugins_dir, extracted_dir)}"
                    )
            return os.path.join(fo.config.plugins_dir, extracted_dir)
    except HTTPError as e:
        print(
            f"Error downloading archive of repo '{github_repo}' ({zipurl}): {e}"
        )
        return None


def install_zoo_plugin(plugin_name: str):
    """Enable the plugin in the app.

    Args:
        plugin_name: the name of the zoo plugin

    Returns:
        the path to the installed plugin
    """
    plugin_dir = find_zoo_plugin(plugin_name)
    if not plugin_dir:
        logging.warning(
            f"Plugin '{plugin_name}' not downloaded. "
            f"Run `download_zoo_plugin({plugin_name}, install = True)` to download and install."
        )

    return _update_plugin_config(plugin_dir, installed=True)


def uninstall_zoo_plugin(plugin_name):
    """Enable the plugin in the app.

    Args:
        plugin_name: the name of the zoo plugin

    Returns:
        the path to the installed plugin
    """
    plugin_dir = find_zoo_plugin(plugin_name)
    if not plugin_dir:
        raise ValueError(f"Plugin '{plugin_name}' not downloaded.")

    return _update_plugin_config(plugin_dir, installed=False)


def _update_plugin_config(plugin_dir, installed: bool):
    if os.path.exists(os.path.join(plugin_dir, ".fiftyone-plugin")):
        config = configparser.ConfigParser()
        config.read(os.path.join(plugin_dir, ".fiftyone-plugin"))
        config["SETTINGS"]["installed"] = str(installed).lower()
        with open(
            os.path.join(plugin_dir, ".fiftyone-plugin"), "w"
        ) as configfile:
            config.write(configfile)
    else:
        print(
            f"Plugin config file not found at {plugin_dir}. Creating new local config file."
        )
        config = configparser.ConfigParser()
        config["SETTINGS"] = {"installed": str(installed).lower()}
        with open(
            os.path.join(plugin_dir, ".fiftyone-plugin"), "w"
        ) as configfile:
            config.write(configfile)

    status = "Installed" if installed else "Uninstalled"
    print(f"{status} plugin at {plugin_dir}")
    return


def delete_zoo_plugin(plugin_name):
    """Deletes a downloaded zoo plugin.

    Args:
        plugin_name: the name of the downloaded plugin
    """
    plugin_dir = find_zoo_plugin(plugin_name)
    if not os.path.isdir(plugin_dir):
        raise ValueError(f"Plugin directory '{plugin_dir}' does not exist.")

    shutil.rmtree(plugin_dir)
    print(f"Deleted plugin at {plugin_dir}")


def list_downloaded_zoo_plugins():
    """Returns a list of all downloaded zoo plugins."""
    return _list_plugins()


def list_installed_zoo_plugins():
    """Returns a list of all installed zoo plugins."""
    return _list_plugins(installed_only=True)


def list_uninstalled_zoo_plugins():
    """Returns a list of all downloaded zoo plugins that are currently disabled in the app."""
    return _list_plugins(installed_only=False)


def _list_plugins(installed_only: bool = None) -> Set[str]:
    """Returns a list of zoo plugins.
    If installed_only == True, only returns installed plugins.
    If installed_only == False, only returns uninstalled plugins.
    If installed_only == None, all downloaded plugins will be listed
    """
    # TODO: check local .fiftyone-plugin file for installed status instead
    plugins = set()
    # python plugins must have a fiftyone.yml file at the root of the plugin
    for fpath in filter(
        lambda x: x.endswith("fiftyone.yml"),
        glob.glob(os.path.join(fo.config.plugins_dir, "**"), recursive=True),
    ):
        try:
            # get plugin name from directory name
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
            logging.debug(f"error parsing plugin_name from filepath: {fpath}")
            continue

        if (
            installed_only == _is_installed(plugin_name)
        ) or installed_only is None:
            plugins.add(plugin_name + " (.py)")

    # js plugins must have a package.json file at the root of the plugin
    for fpath in filter(
        lambda x: x.endswith("package.json"),
        glob.glob(os.path.join(fo.config.plugins_dir, "**"), recursive=True),
    ):
        with open(fpath) as f:
            # get the plugin name from the package.json file
            config = json.load(f)
            if (
                installed_only == _is_installed(plugin_name)
            ) or installed_only is None:
                logging.debug(f'Found js plugin: {config.get("name")}')
                plugins.add(config.get("name") + " (.js)")

    return plugins


def _is_downloaded(plugin_name: str) -> bool:
    """Returns True if the plugin is downloaded, False otherwise."""
    pat = re.sub(r"[-/_]", ".", plugin_name)
    print("Checking for previous download with pattern: ", pat)
    for fp in glob.glob(fo.config.plugins_dir + "/**", recursive=True):
        if re.search(pat, fp):
            return True

    return False


def _is_installed(plugin_name: str) -> bool:
    """Returns True if the plugin is installed, False otherwise."""
    plugin_dir = find_zoo_plugin(plugin_name)
    if plugin_dir:
        if os.path.exists(os.path.join(plugin_dir, ".fiftyone-plugin")):
            print(f"Found config file for '{plugin_name}' at {plugin_dir}")
            config = configparser.ConfigParser()
            config.read(os.path.join(plugin_dir, ".fiftyone-plugin"))
            if (
                "SETTINGS" in config.sections()
                and "installed" in config["SETTINGS"]
            ):
                print(
                    f"installed = {config.getboolean('SETTINGS', 'installed')}"
                )
                return config.getboolean("SETTINGS", "installed")
        else:
            # For backwards compatibility, if the plugin is downloaded,
            # but does not have a config file, consider it installed and
            # create a config file the first time it is queried
            print("Creating config file for plugin: ", plugin_name)
            _update_plugin_config(plugin_dir, installed=True)
            return True
    # If the plugin is not downloaded, it is not installed
    return False


def find_zoo_plugin(plugin_name: str) -> Optional[str]:
    """Returns the path to the plugin directory if it exists, None otherwise."""
    pat = re.sub(r"[-/_]", ".", plugin_name)
    for fp in glob.glob(fo.config.plugins_dir + "/**", recursive=True):
        if re.search(pat, fp):
            print(fp)
            return fp

    return None
