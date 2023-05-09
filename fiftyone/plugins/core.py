"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import glob
import json
import logging
import os
import pprint
import re
import shutil
from collections import defaultdict
from dataclasses import dataclass
from io import BytesIO
from time import time
from typing import List, Optional
from urllib.error import HTTPError
from urllib.request import urlopen
from zipfile import ZipFile

import eta.core.web as etaw
import yaml

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.config as focc
import fiftyone.zoo.utils.github as fozug

logger = logging.getLogger(__name__)
_PLUGIN_DEFINITION_FILE_PATTERN = r"/?fiftyone\.ya?ml$"
_PLUGIN_DIRS = [fo.config.plugins_dir]


@dataclass
class plugin_package:
    """A plugin package.

    Args:
        name: the name of the plugin
        path: the path to the plugin's root directory
    """

    name: str
    path: str


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
    """Updates the app config settings for a plugin using a dict."""
    try:
        app_config_path = focc.locate_app_config()
        with open(app_config_path, "r") as f:
            app_config = json.load(f)
    except OSError as e:
        # app config file doesn't exist at specified location so create an empty dict and continue
        app_config = {}
    except json.decoder.JSONDecodeError as e:
        if (
            os.path.exists(app_config_path)
            and os.path.getsize(app_config_path) > 0
        ):
            # app config file exists but is invalid json so fail silently
            if "enabled" in kwargs and kwargs["enabled"] == True:
                # if the user is trying to enable a plugin and the app config file is invalid
                # then we can assume that the plugin is already enabled
                return
            # TODO: Just log for now, but figure out how to handle if the user is trying to disable a plugin and the app config file is invalid...
            logging.debug(
                "Could not parse app config file. Please ensure that the `FIFTYONE_APP_CONFIG_PATH` is pointing to a valid json file and try again."
            )
            return
        else:
            # app config file doesn't exist or is empty so create an empty dict and continue
            app_config = {}
    except Exception as e:
        # shouldn't get here, but log and fail silently
        logging.debug(f"Uncaught error when loading app config file: {e}.")
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
    with open(app_config_path, "w+") as f:
        json.dump(app_config, f, indent=4)
    return


def _list_disabled_plugins():
    """Returns the list of plugins with `enabled == False` in the app_config settings."""
    try:
        with open(focc.locate_app_config(), "r") as f:
            app_config = json.load(f)
    except:
        # no plugins have been disabled if the app config file doesn't exist or is invalid
        return []

    if len(app_config.get("plugins", {})) > 0:
        plugins = app_config["plugins"]
        return list(
            filter(lambda x: plugins[x].get("enabled", None) == False, plugins)
        )


def delete_plugin(plugin_name, dry_run=False, cleanup=True, limit=None):
    """Deletes all plugins with the name matching <plugin_name> from the local filesystem.

    Args:
        plugin_name: the name of the downloaded plugin
        dry_run: if True, will print the files that will be deleted without actually deleting them
        cleanup: if True, will delete the plugin directory if it is empty after deleting the plugin
    """
    deleted = []
    for plugin_dir in _find_plugin_paths(plugin_name):
        if limit is not None and len(deleted) >= limit:
            break
        if plugin_dir:
            if dry_run:
                to_delete = glob.glob(
                    os.path.join(plugin_dir, "**"), recursive=True
                )
                logging.info(
                    f"Deleting `{plugin_name}` will permanently remove the following items from the filesystem:\n {to_delete}"
                )
                return
            shutil.rmtree(plugin_dir)
            logging.debug(f"Deleted plugin at {plugin_dir}")
            if cleanup:
                _cleanup_plugin_dir(plugin_dir)
        deleted.append(plugin_dir)
    if len(deleted) > 0:
        logging.info(
            f"Deleted {len(deleted)} plugins with name `{plugin_name}`:{deleted}"
        )
        return deleted
    logging.info(
        f"Nothing to delete. Plugin directory '{plugin_dir}' does not exist."
    )


def _cleanup_plugin_dir(plugin_dir: str, recursive: bool = True):
    """Deletes any empty plugin parent directories if empty after deleting the plugin."""
    if plugin_dir in _PLUGIN_DIRS:
        return
    plugin_parent_dir = os.path.dirname(plugin_dir)
    if len(glob.glob(os.path.join(plugin_parent_dir, "*"))) == 0:
        if plugin_parent_dir not in _PLUGIN_DIRS:
            shutil.rmtree(plugin_parent_dir)
        logging.debug(f"Deleted empty directory {plugin_parent_dir}")
    if recursive:
        return _cleanup_plugin_dir(plugin_parent_dir, recursive=recursive)


def list_downloaded_plugins():
    """Returns a list of all downloaded plugins by name."""
    return _list_plugins_by_name()


def list_enabled_plugins():
    """Returns a list of all enabled plugins by name."""
    return _list_plugins_by_name(enabled_only=True)


def list_disabled_plugins():
    """Returns a list of all downloaded but disabled plugins by name."""
    return _list_plugins_by_name(enabled_only=False)


def _is_plugin_definition_file(path):
    """Returns whether the given path is a plugin."""
    return re.search(_PLUGIN_DEFINITION_FILE_PATTERN, path) is not None


def _list_plugins_by_name(
    enabled_only: bool = None, check_for_duplicates=True
) -> List[Optional[str]]:
    """Returns a list of plugins.

    Args:
        enabled_only: If enabled_only == True, only returns enabled plugins.
            If enabled_only == False, only returns disabled plugins.
            If enabled_only == None, all downloaded plugins will be listed
        check_for_duplicates (True): raises an error if duplicate plugin names are found
    """
    if not fo.config.plugins_dir or not os.path.exists(fo.config.plugins_dir):
        logging.debug("No plugins directory found.")
        return []

    plugins = _list_plugins(enabled_only=enabled_only)
    if check_for_duplicates:
        dupes = []
        plugin_map = defaultdict(list)
        for plugin in plugins:
            if len(plugin_map[plugin.name]) > 0:
                dupes.append(plugin.name)
            plugin_map[plugin.name].append(plugin.path)

        if len(dupes) > 0:
            pprint.pprint(
                ({k: v for k, v in plugin_map.items() if k in dupes})
            )
            raise ValueError(
                f"Plugin names not unique. Please rename or delete the duplicates."
            )

    return [p.name for p in plugins]


def _list_plugins(enabled_only: bool = None) -> List[Optional[plugin_package]]:
    """Returns a list of plugins.
    If enabled_only == True, only returns enabled plugins.
    If enabled_only == False, only returns disabled plugins.
    If enabled_only == None, all downloaded plugins will be listed
    """
    if not fo.config.plugins_dir or not os.path.exists(fo.config.plugins_dir):
        logging.debug("No plugins directory found.")
        return []
    plugins = []
    disabled = _list_disabled_plugins()
    # plugin directory must have a fiftyone.yml file defining the plugin
    for fpath in _iter_plugin_definition_files():
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
            logging.debug(f"Found plugin {plugin_name} at {fpath}")
            plugin = plugin_package(plugin_name, os.path.dirname(fpath))
            plugins.append(plugin)

    if enabled_only and (disabled is not None):
        return [p for p in plugins if p.name not in disabled]
    elif enabled_only is False:
        return [p for p in plugins if p.name in disabled]
    return plugins


def find_plugin(name: str, check_for_duplicates: bool = True) -> Optional[str]:
    """Returns the path to the plugin directory if it exists, None otherwise.
    Raises an error if multiple paths are found.
    Args:
        name: the name of the plugin as it appears in the .yml file
    Returns:
        the path to the plugin directory or error if not found or multiple found
    """

    plugin_dir = list(_find_plugin_paths(name))
    if len(plugin_dir) == 1:
        logging.debug(f"Found plugin at {plugin_dir}")
        return plugin_dir[0]
    elif (len(plugin_dir) > 1) and check_for_duplicates:
        raise ValueError(
            f"Multiple plugins found with name '{name}': {plugin_dir}."
        )

    raise ValueError(f"Plugin '{name}' not found in {_PLUGIN_DIRS[0]}.")


def _iter_plugin_definition_files(filepaths: Optional[List[str]] = None):
    """Returns an iterator that finds all plugin definition files in filepaths.
    If filepaths is not provided, the default plugin directory is searched.

    """

    if filepaths and len(filepaths) > 0:
        for fpath in filter(
            lambda x: _is_plugin_definition_file(x), filepaths
        ):
            yield fpath
    else:
        for root, dirs, files in os.walk(_PLUGIN_DIRS[0]):
            # ignore hidden directories
            dirs[:] = [d for d in dirs if not re.search(r"^[._]", d)]
            for file in files:
                if _is_plugin_definition_file(file):
                    yield os.path.join(root, file)
                    files[:] = []


def _find_plugin_paths(name: str = None) -> Optional[str]:
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
        try:
            # create plugins directory at set path if it doesn't exist
            os.makedirs(plugins_dir)
        except:
            raise ValueError(
                f"Plugins directory '{plugins_dir}' does not exist."
            )
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
            if zipresp.info().get("Content-Type") != "application/zip":
                raise ValueError(
                    f"File at {zip_url} is not a zip archive. Aborting download."
                )
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


def create_plugin(
    plugin_name: str,
    from_dir: Optional[str] = None,
    from_files: Optional[list] = None,
    label: Optional[str] = None,
    description: Optional[str] = None,
    overwrite=False,
    **kwargs,
) -> None:
    """Creates a local plugin with the given name and places it in the `<FIFTYONE_PLUGINS_DIR>/local` directory.
    If no files are specified, only a directory with a plugin definition file will be created.

    Args:
        plugin_name: the name of the plugin. An error will be raised if a plugin with this name already exists unless overwrite=True
        from_dir: the path to the directory containing the plugin files
        from_files: a list of filepaths to include in the plugin
        overwrite: whether to overwrite the plugin directory if it already exists
        label: the display name of the plugin
        description: a description of the plugin
        **kwargs: optional keyword arguments to include in the plugin definition
    """
    if from_dir and from_files:
        raise ValueError("Cannot specify both from_dir and from_files.")
    if plugin_name in _list_plugins_by_name(check_for_duplicates=False):
        if not overwrite:
            raise ValueError(
                f"Plugin '{plugin_name}' already exists. Rerun `create` with overwrite=True to overwrite it."
            )
        else:
            deleted_dir = delete_plugin(plugin_name)
            print(
                f'Deleted existing plugin with name "{plugin_name}" at {deleted_dir}'
            )

    plugin_dir = os.path.join(
        fo.config.plugins_dir,
        "local",
        "-".join([plugin_name, str(round(time()))]),
    )
    os.makedirs(plugin_dir)
    if from_dir:
        if not (os.path.isdir(from_dir) and os.path.exists(from_dir)):
            raise ValueError(f"'{from_dir}' is not a directory.")
        from_files = [os.path.join(from_dir, f) for f in os.listdir(from_dir)]
    if from_files:
        for fpath in from_files:
            if not (os.path.isfile(fpath) and os.path.exists(fpath)):
                raise ValueError(f"'{fpath}' is not a file.")
            shutil.copytree(fpath, plugin_dir)
    yml_path = next(
        _iter_plugin_definition_files(os.listdir(plugin_dir)), None
    )
    plugin_definition = {
        "name": plugin_name,
        "description": description,
        "label": label,
        "fiftyone": {"version": foc.VERSION},
        **kwargs,
    }
    if not yml_path:
        yml_path = os.path.join(plugin_dir, "fiftyone.yml")
    else:
        with open(yml_path, "r") as yml_file:
            old_yml = yaml.safe_load(yml_file)
            # add any missing and overwrite existing fields with the values
            # from the new plugin definition
            plugin_definition = old_yml | plugin_definition

    with open(yml_path, "w") as yml_file:
        yaml.dump(plugin_definition, yml_file)
    print(f"Created plugin with name `{plugin_name}` at {plugin_dir}")
    return


def _label_from_name(name: str) -> str:
    # replace non-alphanumeric characters with spaces
    label = re.sub("[^A-Za-z0-9]+", " ", name)
    # capitalize each word
    return " ".join([w.capitalize() for w in label.split(" ")])
