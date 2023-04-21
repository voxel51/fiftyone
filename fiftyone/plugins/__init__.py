"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import glob
import json
import logging
import os
import re
import shutil
from io import BytesIO
from typing import List, Optional
from urllib.error import HTTPError
from urllib.request import urlopen
from zipfile import ZipFile

import eta.core.web as etaw
import yaml

import fiftyone as fo
import fiftyone.core.config as focc
import fiftyone.zoo.utils.github as fozug
from .registry import list_all_plugins

logger = logging.getLogger(__name__)
_PLUGIN_DEFINITION_FILE_PATTERN = r"/?fiftyone\.y*ml$"
_PLUGIN_DIRS = [fo.config.plugins_dir]


def enable_plugin(plugin_name: str):
    """Enable the plugin in the app.

    Args:
        plugin_name: the name of the  plugin

    Returns:
        the path to the enabled plugin
    """

    return _update_app_config(plugin_name, enabled=True)


def disable_plugin(plugin_name):
    """Disables the plugin in the app.

    Args:
        plugin_name: the name of the  plugin

    Returns:
        the path to the enabled plugin
    """

    return _update_app_config(plugin_name, enabled=False)


def _update_app_config(plugin_name, **kwargs):
    """Updates the app config settings for a plugin using using a dict."""
    try:
        with open(focc.locate_app_config(), "r") as f:
            app_config = json.load(f)
    except OSError as e:
        logging.error(
            "Could not locate app config file. Please ensure that the `FIFTYONE_APP_CONFIG_PATH` is pointing to an existing json filepath."
        )
        return
    except json.decoder.JSONDecodeError as e:
        logging.error(
            "Could not parse app config file. Please ensure that the `FIFTYONE_APP_CONFIG_PATH` is pointing to a valid json file."
        )
        return

    if app_config.get("plugins") is None:
        app_config["plugins"] = {}
    if not app_config["plugins"].get(plugin_name):
        app_config["plugins"][plugin_name] = {}
    for k, v in kwargs.items():
        app_config["plugins"][plugin_name][k] = v

    logging.debug(
        f"Updated app config settings for `{plugin_name}:\n{app_config['plugins'][plugin_name]}"
    )
    with open(focc.locate_app_config(), "w") as f:
        json.dump(app_config, f, indent=4)
    return


def _list_disabled_plugins():
    """Returns the list of plugins with `enabled == False` in the app_config settings."""
    try:
        with open(focc.locate_app_config(), "r") as f:
            app_config = json.load(f)
    except OSError as e:
        logging.error(
            "Could not locate app config file. Please ensure that the `FIFTYONE_APP_CONFIG_PATH` is pointing to an existing json filepath."
        )
        return
    except json.decoder.JSONDecodeError as e:
        logging.error(
            "Could not parse app config file. Please ensure that the `FIFTYONE_APP_CONFIG_PATH` is pointing to a valid json file."
        )
        return

    if len(app_config.get("plugins", {})) > 0:
        plugins = app_config["plugins"]
        return list(
            filter(lambda x: plugins[x].get("enabled", None) == False, plugins)
        )


def delete_plugin(plugin_name, dry_run=False, cleanup=True):
    """Deletes a downloaded plugin from the local filesystem.

    Args:
        plugin_name: the name of the downloaded plugin
        dry_run: if True, will print the files that will be deleted without actually deleting them
        cleanup: if True, will delete the plugin directory if it is empty after deleting the plugin
    """
    plugin_dir = find_plugin(plugin_name)
    if plugin_dir:
        if dry_run:
            to_delete = glob.glob(
                os.path.join(_PLUGIN_DIRS[0], "**"), recursive=True
            )
            print(
                f"Deleting `{plugin_name}` will permanently remove the following files from the filesystem:\n {to_delete}"
            )
            return
        shutil.rmtree(plugin_dir)
        print(f"Deleted plugin at {plugin_dir}")
        _cleanup_plugin_dir(plugin_dir)
        return
    raise ValueError(f"Plugin directory '{plugin_dir}' does not exist.")


def _cleanup_plugin_dir(plugin_dir: str, recursive: bool = True):
    if plugin_dir == _PLUGIN_DIRS[0]:
        print("Done cleaning up plugin directory.")
        return
    plugin_parent_dir = os.path.dirname(plugin_dir)
    if len(glob.glob(os.path.join(plugin_parent_dir, "*"))) == 0:
        if plugin_parent_dir != _PLUGIN_DIRS[0]:
            shutil.rmtree(plugin_parent_dir)
        print(f"Deleted empty directory {plugin_parent_dir}")
    if recursive:
        return _cleanup_plugin_dir(plugin_parent_dir, recursive=recursive)


def list_downloaded_plugins():
    """Returns a list of all downloaded  plugins."""
    return _list_plugins()


def list_enabled_plugins():
    """Returns a list of all enabled  plugins."""
    return _list_plugins(enabled_only=True)


def list_disabled_plugins():
    """Returns a list of all downloaded  plugins that are currently disabled in the app."""
    return _list_plugins(enabled_only=False)


def _is_plugin_definition_file(path):
    """Returns whether the given path is a  plugin."""
    return re.search(_PLUGIN_DEFINITION_FILE_PATTERN, path) is not None


def _list_plugins(enabled_only: bool = None) -> set[str]:
    """Returns a list of  plugins.
    If enabled_only == True, only returns enabled plugins.
    If enabled_only == False, only returns disabled plugins.
    If enabled_only == None, all downloaded plugins will be listed
    """
    plugins = set()
    disabled = _list_disabled_plugins()
    # plugins must have a fiftyone.yml file at the root of the directory
    for fpath in filter(
        lambda x: _is_plugin_definition_file(x),
        glob.glob(os.path.join(_PLUGIN_DIRS[0], "**"), recursive=True),
    ):
        try:
            # get plugin name from yml
            with open(fpath, "r") as f:
                plugin_name = yaml.safe_load(f).get("name")
        except AttributeError:
            logging.debug(
                f"error parsing plugin_name from yml file and filepath: {fpath}"
            )
            continue

        if plugin_name:
            plugins.add(plugin_name)
    if enabled_only:
        return plugins - set(disabled)
    elif enabled_only is False:
        return set(disabled).intersection(plugins)

    return plugins


def find_plugin(name: str) -> Optional[str]:
    """Returns the path to the plugin directory if it exists, None otherwise.
    Args:
        name: the name of the plugin as it appears in the .yml file
    Returns:
        the path to the plugin directory or error if not found or multiple found
    """

    plugin_dir = list(_find_plugin_dirs(name))
    if len(plugin_dir) == 1:
        logging.debug(f"Found plugin at {plugin_dir}")
        return plugin_dir[0]
    elif len(plugin_dir) > 1:
        raise ValueError(
            f"Multiple plugins found with name '{name}': {plugin_dir}."
        )

    raise ValueError(f"Plugin '{name}' not found in {_PLUGIN_DIRS[0]}.")


def _iter_plugin_definition_files(filepaths: Optional[List[str]] = None):
    """Returns an iterator that finds all plugin definition files in filepaths.
    If filepaths is not provided, the default plugin directory is searched.
    """
    if not filepaths:
        filepaths = glob.glob(
            os.path.join(_PLUGIN_DIRS[0], "**"), recursive=True
        )
    for fpath in filter(lambda x: _is_plugin_definition_file(x), filepaths):
        yield fpath


def _find_plugin_dirs(name: str = None) -> Optional[str]:
    """Returns plugin path[s].
    Args:
        name: the name of the plugin as it appears in the .yml file (optional)
    """
    plugin_dirs = []
    for fpath in _iter_plugin_definition_files():
        try:
            # get plugin name from yml
            with open(fpath, "r") as f:
                plugin_name = yaml.safe_load(f).get("name")
                if not plugin_name:
                    continue
                if not name:
                    name = plugin_name
                if name == plugin_name:
                    yield os.path.dirname(fpath)
        except AttributeError:
            logging.debug(
                f"error parsing plugin_name from yml file and filepath: {fpath}"
            )
            continue


def download_plugin(
    name: str = None,
    url: str = None,
    gh_repo: str = None,
    overwrite: bool = False,
    **kwargs,
) -> Optional[str]:
    """Downloads a plugin into the directory specified by FIFTYONE_PLUGINS_DIR.
    Currently only supports downloading zip archives directly via URL or from public GitHub repos.

    Args:
        name: the name of the plugin as it appears in the .yml file
        url: the URL to the plugin zip archive
        gh_repo: URL or '<user>/<repo>[/<ref>]' of the GitHub repo containing the plugin
        overwrite: whether to force re-download and overwrite the plugin if it already exists
        **kwargs: optional keyword arguments to pass to the plugin's `install()` method
    Returns:
        the path to the downloaded plugin
    """
    plugins_dir = _PLUGIN_DIRS[0]
    if not plugins_dir:
        raise ValueError("Plugins directory not set.")
    elif not os.path.isdir(plugins_dir):
        raise ValueError(f"Plugins directory '{plugins_dir}' does not exist.")
    download_ref = next(ref for ref in [name, url, gh_repo] if ref is not None)
    if not download_ref:
        raise ValueError("Must provide name, url, or github_repo.")
    if etaw.is_url(download_ref) and "github" not in download_ref:
        logging.debug("Downloading from URL")
        zip_url = download_ref
    else:
        logging.debug("Downloading from GitHub")
        zip_url = _get_gh_download_url(download_ref)
    if not zip_url:
        raise ValueError("Could not determine zip download URL.")
    extracted_dir_path = _download_and_extract_zip(
        zip_url, overwrite=overwrite
    )

    return extracted_dir_path


def _get_gh_download_url(gh_repo: str) -> str:
    """Returns the URL to the plugin zip archive on GitHub."""
    repo = fozug.GitHubRepo(gh_repo)
    return repo.download_url


def _download_and_extract_zip(
    zip_url: str,
    plugin_names: Optional[List[str]] = None,
    overwrite: Optional[bool] = False,
) -> Optional[str]:
    """Downloads and extracts a zip archive to the plugin directory.

    Args:
        zip_url: the URL of the zip archive
        plugin_names: an optional list of plugin names to extract.
            If not provided, all plugins in the archive will be extracted
        overwrite: whether to force re-download and overwrite the plugin if it already exists
    """

    # TODO: add support for specifying plugin names to extract

    extracted_dir_name = "-".join(re.findall(r"\w+", zip_url))

    extracted_dir_path = os.path.join(
        fo.config.plugins_dir, extracted_dir_name
    )
    if not overwrite:
        print("overwrite=", overwrite)
        if os.path.isdir(extracted_dir_path):
            print(
                f"Plugin from {zip_url} already downloaded at {extracted_dir_path}. Skipping download."
            )
            return extracted_dir_path

    try:
        with urlopen(zip_url) as zipresp:
            logging.info(f"Attempting to download plugin from {zip_url}...")
            with ZipFile(BytesIO(zipresp.read())) as zfile:
                logging.debug(f"Files in archive: {zfile.namelist()}")
                plugin_defs = list(
                    _iter_plugin_definition_files(zfile.namelist())
                )
                if len(plugin_defs) < 1:
                    logging.warning(
                        f"Aborting download. Archive missing `fiftyone.yml` file."
                    )
                    return
                # TODO (followup): Extracting entire archive for now, but may need to
                #  limit to extracting only plugin directories (with .yml files at their root)
                zfile.extractall(extracted_dir_path)
                print(f"Downloaded plugin to {extracted_dir_path}")
                return extracted_dir_path

    except HTTPError as e:
        raise ValueError(f"Error downloading archive at {zip_url}: \n{e}")


def _has_plugin_definition(plugin_files: list) -> bool:
    """Checks whether the plugin directory contains a valid plugin definition.

    Args:
        plugin_dir: the path to the plugin directory

    Returns:
        True if the plugin is valid, False otherwise
    """
    return any(
        filter(
            lambda x: _is_plugin_definition_file(x),
            plugin_files,
        )
    )
