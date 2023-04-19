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


class ZooPluginConfig(etas.Serializable):
    """A Zoo plugin configuration."""

    def __init__(
        self,
        /,
        repo_name: str,
        author: str,
        ref: str = "",
        description: str = "",
        installed: bool = False,
    ):
        """
        Args:
            repo_name: the name of the GitHub repo containing the plugin
            author: the GitHub username of the plugin author
            ref: the GitHub ref of the plugin
            description: a description of the plugin
            installed: True if the plugin is enabled in the app
        """
        self.repo_name = repo_name.strip("/")
        self.author = author.strip("/")
        self.ref = ref.strip("/")
        self.description = description
        self.installed = installed
        self.download_url = fozug.get_zip_url(
            os.path.join(author, repo_name), ref=ref
        )
        self.download_date = datetime.datetime.utcnow().strftime(
            "%Y-%m-%d %H:%M:%S"
        )

    def _create_parser(self) -> configparser.ConfigParser:
        config = configparser.ConfigParser()
        config["SETTINGS"] = {"installed": str(self.installed).lower()}
        config["INFO"] = {
            "repo_name": self.repo_name,
            "author": self.author,
            "ref": self.ref,
            "description": self.description,
            "download_url": self.download_url,
            "download_date": self.download_date,
        }
        for fn in ["package.json", "fiftyone.yml"]:
            config_file = os.path.join(
                fo.config.plugins_dir, self._plugin_id, fn
            )
            logging.debug(f"Checking for name in {config_file}")
            name = _get_plugin_name(config_file)
            if name:
                logging.debug(f"Found name: {name}")
                config["INFO"]["name"] = name
                break
        return config

    @property
    def _plugin_id(self) -> str:
        return "-".join([self.author, self.repo_name, self.ref])

    def save(self) -> None:
        plugin_download_dir_name = "-".join(
            [self.author, self.repo_name, self.ref]
        )
        plugin_download_dir_path = find_zoo_plugin(plugin_download_dir_name)
        logging.debug(f"Checking {plugin_download_dir_path} for plugin files")
        if os.path.isdir(plugin_download_dir_path):
            logging.debug(
                f"Writing config file to: '{plugin_download_dir_path}'"
            )
            with open(
                os.path.join(plugin_download_dir_path, ".fiftyone-plugin"), "w"
            ) as configfile:
                parser = self._create_parser()
                parser.write(configfile)
        else:
            logging.warning(
                f" `Plugin directory '{plugin_download_dir_path}' does not exist. Cannot save config."
            )


def download_zoo_plugin(
    github_repo: str, install: bool = False, force: bool = False
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

    gh_repo = fozug.GitHubRepo(github_repo)
    # TODO:
    #  - should we check the contents of the archive before downloading? (eg check if repo contains a package.json or fiftyone.yml run config file + other requirements?)
    # - add error for non-existent repo?

    zipurl = gh_repo.download_url
    try:
        with urlopen(zipurl) as zipresp:
            logging.info(f"Attempting to download plugin from {zipurl}...")
            with ZipFile(BytesIO(zipresp.read())) as zfile:
                logging.debug(f"Files in archive: {zfile.namelist()}")
                if not _is_valid_plugin(zfile.namelist()):
                    logging.warning(
                        f"Plugin '{github_repo}' is not a valid plugin. "
                        f"Repo must contain a `package.json` or `fiftyone.yml` file."
                    )
                    return
                extracted_dir = zfile.namelist()[0]
                gh_repo.ref = extracted_dir.rsplit("-")[-1]
                if _is_downloaded(extracted_dir) and not force:
                    logging.info(
                        "Plugin already downloaded and up to date. Skipping download."
                    )
                else:
                    logging.debug(
                        f"Extracting plugin files to {extracted_dir}..."
                    )
                    zfile.extractall(fo.config.plugins_dir)
                    logging.info(
                        f"Downloaded plugin to {os.path.join(fo.config.plugins_dir, extracted_dir)}"
                    )
    except HTTPError as e:
        if e.status == 404:
            raise ValueError(
                f"Plugin '{github_repo}' not found at {zipurl}. Check that the URL or <user>/<repo_name> is correct."
            )
        else:
            raise ValueError(
                f"Error downloading archive of repo '{github_repo}' ({zipurl}): {e}"
            )
    config = ZooPluginConfig(
        author=gh_repo.user,
        repo_name=gh_repo.name,
        ref=gh_repo.ref,
        installed=install,
    )
    config.save()
    return os.path.join(fo.config.plugins_dir, extracted_dir)


def _is_valid_plugin(plugin_files: list) -> bool:
    """Checks whether the plugin directory contains a valid plugin.

    Args:
        plugin_dir: the path to the plugin directory

    Returns:
        True if the plugin is valid, False otherwise
    """
    return any(
        filter(
            lambda x: x.endswith("package.json") or x.endswith("fiftyone.yml"),
            plugin_files,
        )
    )


# def _extract_plugin_files(zipfile:ZipFile) -> Optional[list]:
#     """Extracts the plugin files from the archive.
#
#     Args:
#         zipfile: the ZipFile object
#
#     Returns:
#         list of plugin files
#     """
#


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


def _update_plugin_config(plugin_dir, installed: bool, **kwargs):
    """Updates the plugin config file to reflect the installed status of the plugin."""
    logging.debug(
        f"Updating plugin config file at {plugin_dir} to installed={installed}..."
    )
    if os.path.exists(os.path.join(plugin_dir, ".fiftyone-plugin")):
        config = configparser.ConfigParser()
        config.read(os.path.join(plugin_dir, ".fiftyone-plugin"))
        config["SETTINGS"]["installed"] = str(installed).lower()
        with open(
            os.path.join(plugin_dir, ".fiftyone-plugin"), "w"
        ) as configfile:
            config.write(configfile)
    else:
        logging.debug(
            f"Plugin config file not found at {plugin_dir}. Creating new local config file."
        )
        config = configparser.ConfigParser()
        config["SETTINGS"] = {"installed": str(installed).lower()}
        with open(
            os.path.join(plugin_dir, ".fiftyone-plugin"), "w"
        ) as configfile:
            config.write(configfile)

    status = "Installed" if installed else "Uninstalled"
    logging.info(f"{status} plugin at {plugin_dir}")
    return


def delete_zoo_plugin(plugin_name):
    """Deletes a downloaded zoo plugin from the local filesystem.

    Args:
        plugin_name: the name of the downloaded plugin
    """
    plugin_dir = find_zoo_plugin(plugin_name)
    if plugin_dir and os.path.isdir(plugin_dir):
        shutil.rmtree(plugin_dir)
        print(f"Deleted plugin at {plugin_dir}")
        return
    raise ValueError(f"Plugin directory '{plugin_dir}' does not exist.")


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
            # get plugin name from yml
            with open(fpath, "r") as f:
                plugin_name = yaml.safe_load(f).get("name")
            if not plugin_name:
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
            logging.debug(
                f"error parsing plugin_name from yml file and filepath: {fpath}"
            )
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
            plugin_name = config.get("name")
            if (
                installed_only == _is_installed(plugin_name)
            ) or installed_only is None:
                logging.debug(f'Found js plugin: {config.get("name")}')
                plugins.add(plugin_name + " (.js)")

    return plugins


def _is_downloaded(plugin_name: str) -> bool:
    """Returns True if the plugin is downloaded, False otherwise."""
    pat = re.sub(r"[-/_]", ".", plugin_name)
    logging.debug(f"Checking for previous download with pattern: {pat}")
    for fp in glob.glob(fo.config.plugins_dir + "/**", recursive=True):
        if re.search(pat, fp):
            return True
    return False


def _is_installed(plugin_name: str) -> bool:
    """Returns True if the plugin is installed, False otherwise."""
    plugin_dir = find_zoo_plugin(plugin_name)
    if plugin_dir:
        if os.path.exists(os.path.join(plugin_dir, ".fiftyone-plugin")):
            logging.debug(
                f"Found config file for '{plugin_name}' at {plugin_dir}"
            )
            config = configparser.ConfigParser()
            config.read(os.path.join(plugin_dir, ".fiftyone-plugin"))
            if (
                "SETTINGS" in config.sections()
                and "installed" in config["SETTINGS"]
            ):
                logging.debug(
                    f"installed = {config.getboolean('SETTINGS', 'installed')}"
                )
                return config.getboolean("SETTINGS", "installed")
        else:
            # For backwards compatibility, if the plugin is downloaded,
            # but does not have a config file, consider it installed and
            # create a config file the first time it is queried
            logging.debug(f"Creating config file for plugin: {plugin_name}")
            _update_plugin_config(plugin_dir, installed=True)
            return True
    # If the plugin is not downloaded, it is not installed
    logging.debug(f"Plugin '{plugin_name}' not downloaded")
    return False


def find_zoo_plugin(name: str) -> Optional[str]:
    """Returns the path to the plugin directory if it exists, None otherwise.
    Args:
        name: the name of the plugin as it appears in the .yml/.json file or
        the 'username/repo_name' of the GitHub repo from which it was downloaded
    """

    plugin_dir = _find_plugin_dir_js(name) or _find_plugin_dir_python(name)

    if plugin_dir:
        logging.debug(f"Found plugin at {plugin_dir}")
        return plugin_dir

    raise ValueError(f"Plugin '{name}' not found in {fo.config.plugins_dir}.")


def _find_plugin_dir_python(name: str) -> Optional[str]:
    """Returns the path to the plugin directory if it exists."""

    pat = (
        re.sub(r"[-/_]", ".", name.rstrip("/"))
        + r"[a-zA-Z0-9./-]*/(.*/)*(fiftyone.yml|package.json)$"
    )
    logging.debug(f"Checking for plugin with pattern: {pat}")
    for fp in glob.glob(fo.config.plugins_dir + "/**", recursive=True):
        if re.search(pat, fp):
            logging.debug(f"Found plugin at {os.path.dirname(fp)}")
            with open(fp) as config_file:
                config = yaml.safe_load(config_file)
                logging.debug(f"name = {config.get('name')}")
            return os.path.dirname(fp)
    logging.debug(f"Plugin '{name}' not found in {fo.config.plugins_dir}.")
    return


def _find_plugin_dir_js(name: str) -> Optional[str]:
    """Returns the path to the JS plugin on disk by its unique name."""
    for fpath in filter(
        lambda x: x.endswith("package.json") or x.endswith("fiftyone.yml"),
        glob.glob(os.path.join(fo.config.plugins_dir, "**"), recursive=True),
    ):
        logging.debug(fpath)
        with open(fpath) as f:
            if fpath.endswith("fiftyone.yml"):
                config = yaml.safe_load(f)
            elif fpath.endswith("package.json"):
                config = json.load(f)
            if config.get("name") == name:
                return os.path.dirname(fpath)
    logging.debug(
        f"'{name}' does not match any plugin name found in {fo.config.plugins_dir}."
    )
    return


def _get_plugin_name(config_file: str) -> Optional[str]:
    """Returns the plugin name."""
    if not os.path.exists(config_file):
        return None
    if config_file.endswith("fiftyone.yml"):
        return _get_plugin_name_python(config_file)
    elif config_file.endswith("package.json"):
        return _get_plugin_name_js(config_file)
    return None


def _get_plugin_name_python(yml_path: str) -> Optional[str]:
    """Returns the plugin name from the yml file."""
    if os.path.exists(yml_path):
        with open(yml_path) as f:
            config = yaml.safe_load(f)
            return config["name"]
    return None


def _get_plugin_name_js(package_path: str) -> Optional[str]:
    """Returns the plugin name from the package.json file."""
    if os.path.exists(package_path):
        with open(package_path) as f:
            config = json.load(f)
            return config["name"]
        return None
