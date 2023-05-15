"""
Core plugin methods.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import Counter
from dataclasses import dataclass
import json
import logging
import os
import re
import shutil

import yaml

import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.core.config as foc
import fiftyone.core.utils as fou
from fiftyone.plugins.definitions import PluginDefinition
from fiftyone.utils.github import GitHubRepository


_PLUGIN_METADATA_FILENAMES = ["fiftyone.yaml", "fiftyone.yml"]

logger = logging.getLogger(__name__)


@dataclass
class PluginPackage:
    """Plugin package.

    Args:
        name: the name of the plugin
        path: the path to the plugin's root directory
    """

    name: str
    path: str

    def __repr__(self):
        return f"Plugin(name={self.name}, path={self.path})"


def list_plugins(enabled=True):
    """Returns the definitions of downloaded plugins.

    Args:
        enabled (True): whether to include only enabled plugins (True) or only
            disabled plugins (False) or all plugins ("all")

    Returns:
        a list of :class:`PluginDefinition` instances
    """
    if enabled == "all":
        enabled = None

    plugins = []
    for p in _list_plugins(enabled=enabled):
        metadata_path = _find_plugin_metadata_file(p.path)
        try:
            pd = PluginDefinition.from_disk(metadata_path)
        except:
            logger.debug(f"Failed to load metadata from '{metadata_path}'")
            continue

        plugins.append(pd)

    return plugins


def enable_plugin(plugin_name):
    """Enables the given plugin in the FiftyOne App.

    Args:
        plugin_name: the plugin name

    Returns:
        the path to the enabled plugin
    """
    return _update_plugin_settings(plugin_name, enabled=True)


def disable_plugin(plugin_name):
    """Disables the given plugin in the FiftyOne App.

    Args:
        plugin_name: the plugin name

    Returns:
        the path to the enabled plugin
    """
    return _update_plugin_settings(plugin_name, enabled=False)


def delete_plugin(plugin_name):
    """Deletes the given plugin from local disk.

    Args:
        plugin_name: the plugin name
    """
    plugin_dir = _find_plugin(plugin_name)
    etau.delete_dir(plugin_dir)


def list_downloaded_plugins():
    """Returns a list of all downloaded plugin names.

    Returns:
        a list of plugin names
    """
    return _list_plugins_by_name()


def list_enabled_plugins():
    """Returns a list of all enabled plugin names.

    Returns:
        a list of plugin names
    """
    return _list_plugins_by_name(enabled=True)


def list_disabled_plugins():
    """Returns a list of all disabled plugin names.

    Returns:
        a list of plugin names
    """
    return _list_plugins_by_name(enabled=False)


def find_plugin(name, check_for_duplicates=True):
    """Returns the path to the plugin on local disk.

    Args:
        name: the plugin name
        check_for_duplicates (True): whether to ensure that multiple plugins
            with the given name do not exist

    Returns:
        the path to the plugin directory
    """
    return _find_plugin(name, check_for_duplicates=check_for_duplicates)


def download_plugin(
    url_or_gh_repo,
    plugin_names=None,
    max_depth=3,
    overwrite=False,
):
    """Downloads the given plugin(s) to your local plugins directory
    (``fo.config.plugins_dir``).

    Args:
        url_or_gh_repo: the location to download the plugin from, which can be:

            -   a publicly accessible URL of an archive (eg zip) file
            -   a GitHub repository like ``https://github.com/<org>/<repo>``
            -   a string with format ``<user>/<repo>[/<ref>]`` specifying the
                GitHub repository to use

        plugin_names (None): a plugin name or iterable of plugin names to
            download. By default, all found plugins are downloaded
        max_depth (3): the maximum depth within the downloaded archive to
            search for plugins:

            - ``max_depth=1``: only search the top-level downloaded directory
            - ``max_depth=2``: also search immediate subdirectories
            - ``max_depth=3``: search two levels deep
            - etc

        overwrite (False): whether to overwrite an existing plugin with the
            same name if it already exists

    Returns:
        the path to the downloaded plugin
    """
    if etaw.is_url(url_or_gh_repo):
        if "github" in url_or_gh_repo:
            repo = GitHubRepository(url)
            url = repo.download_url
        else:
            url = url_or_gh_repo
    else:
        repo = GitHubRepository(url_or_gh_repo)
        url = repo.download_url

    return _download_plugin(
        url,
        plugin_names=plugin_names,
        max_depth=max_depth,
        overwrite=overwrite,
    )


def _download_plugin(url, plugin_names=None, max_depth=3, overwrite=False):
    if etau.is_str(plugin_names):
        plugin_names = {plugin_names}
    elif plugin_names is not None:
        plugin_names = set(plugin_names)

    existing_plugin_dirs = {p.name: p.path for p in _list_plugins()}

    with etau.TempDir() as tmpdir:
        path = os.path.join(tmpdir, os.path.basename(url))
        etaw.download_file(url, path=path)
        etau.extract_archive(path)

        metadata_paths = _find_plugin_metadata_files(
            os.path.join(tmpdir, "*"),
            max_depth=max_depth + 1,
        )

        for metadata_path in metadata_paths:
            try:
                plugin = _parse_plugin_metadata(metadata_path)
            except AttributeError:
                logger.debug(
                    f"Failed to load plugin name from '{metadata_path}'"
                )
                continue

            if plugin_names is not None and plugin.name not in plugin_names:
                logger.debug(f"Skipping unwanted plugin '{plugin.name}'")
                continue

            existing_dir = existing_plugin_dirs.get(plugin.name, None)
            if existing_dir is not None:
                if not overwrite:
                    logger.debug(f"Skipping existing plugin '{plugin.name}'")
                    continue

                logger.debug(f"Overwriting existing plugin '{plugin.name}'")
                etau.delete_dir(existing_dir)
                plugin_dir = existing_dir
            else:
                plugin_dir = _recommend_plugin_dir(plugin)

            logger.debug(f"Copying plugin '{plugin.name}' to '{plugin_dir}'")
            etau.copy_dir(plugin.path, plugin_dir)


def create_plugin(
    plugin_name,
    from_dir=None,
    from_files=None,
    outdir=None,
    label=None,
    description=None,
    version=None,
    overwrite=False,
    **kwargs,
):
    """Creates a plugin with the given name.

    If no input files are provided, a directory containing only the plugin's
    metadata file will be created.

    If no ``outdir`` is specified, the plugin is created within your local
    plugins directory (``fo.config.plugins_dir``).

    Args:
        plugin_name: the name of the plugin
        from_dir (None): the path to the directory containing the plugin
        from_files (None): an explicit list of filepaths and/or directories to
            include in the plugin
        outdir (None): the path at which to create the plugin directory. If
            not provided, the plugin is created within your
            ``fo_config.plugins_dir``
        label (None): a display name for the plugin
        description (None): a description for the plugin
        version (None): an optional FiftyOne version requirement string
        overwrite (False): whether to overwrite a local plugin with the same
            name if one exists
        **kwargs: optional keyword arguments to include in the plugin
            definition

    Returns:
        the directory containing the plugin
    """
    if outdir is None:
        existing_plugin_dirs = {p.name: p.path for p in _list_plugins()}
        if plugin_name in existing_plugin_dirs:
            if not overwrite:
                raise ValueError(f"Plugin '{plugin_name}' already exists")

            logger.debug(f"Overwriting existing plugin '{plugin_name}'")
            outdir = existing_plugin_dirs[plugin_name]
        else:
            outdir = os.path.join(fo.config.plugins_dir, plugin_name)
    elif os.path.isdir(outdir):
        if not overwrite:
            raise ValueError(f"Directory '{outdir}' already exists")

        logger.debug(f"Overwriting existing plugin directory '{outdir}'")

    etau.ensure_empty_dir(outdir, cleanup=True)

    if from_dir:
        from_files = [os.path.join(from_dir, f) for f in os.listdir(from_dir)]

    if from_files:
        for from_path in from_files:
            if os.path.isfile(from_path):
                shutil.copy(from_path, outdir)
            elif os.path.isdir(from_path):
                shutil.copytree(from_path, outdir)
            else:
                logger.warning(
                    f"Skipping nonexistent file or directory '{from_path}'"
                )

    yaml_path = _find_plugin_metadata_file(outdir)
    if yaml_path is None:
        yaml_path = os.path.join(outdir, _PLUGIN_METADATA_FILENAMES[0])

    if label is None:
        label = _recommend_plugin_label(plugin_name)

    pd = {
        "name": plugin_name,
        "label": label,
        "description": description,
        **kwargs,
    }

    if version is not None:
        if "fiftyone" not in pd:
            pd["fiftyone"] = {}

        pd["fiftyone"]["version"] = version

    # Merge with existing YAML file, if necessary
    if os.path.isfile(yaml_path):
        with open(yaml_path, "r") as f:
            pd = yaml.safe_load(f) | pd

    with open(yaml_path, "w") as f:
        yaml.dump(pd, f)


def _is_plugin_metadata_file(path):
    return os.path.basename(path) in _PLUGIN_METADATA_FILENAMES


def _find_plugin_metadata_file(dirpath):
    for filename in _PLUGIN_METADATA_FILENAMES:
        metadata_path = os.path.join(dirpath, filename)
        if os.path.isfile(metadata_path):
            return metadata_path

    return None


def _parse_plugin_metadata(metadata_path):
    with open(metadata_path, "r") as f:
        plugin_name = yaml.safe_load(f).get("name")

    plugin_path = os.path.dirname(metadata_path)
    return PluginPackage(plugin_name, plugin_path)


def _list_plugins(enabled=None):
    plugins = []
    for metadata_path in _iter_plugin_metadata_files():
        try:
            plugin = _parse_plugin_metadata(metadata_path)
            plugins.append(plugin)
        except:
            logger.debug(f"Failed to load plugin name from '{metadata_path}'")
            continue

    disabled = set(_list_disabled_plugins())

    if enabled is True:
        return [p for p in plugins if p.name not in disabled]

    if enabled is False:
        return [p for p in plugins if p.name in disabled]

    return plugins


def _list_plugins_by_name(enabled=None, check_for_duplicates=True):
    plugin_names = [p.name for p in _list_plugins(enabled=enabled)]

    if check_for_duplicates:
        dups = [n for n, c in Counter(plugin_names).items() if c > 1]
        if dups:
            raise ValueError(f"Found multiple plugins with name {dups}")

    return plugin_names


def _find_plugin_metadata_files(root_dir, max_depth=1):
    return fou.find_files(
        root_dir,
        _PLUGIN_METADATA_FILENAMES,
        max_depth=max_depth,
    )


def _iter_plugin_metadata_files():
    plugins_dir = fo.config.plugins_dir
    if not plugins_dir or not os.path.isdir(plugins_dir):
        return

    for root, dirs, files in os.walk(plugins_dir, followlinks=True):
        # ignore hidden directories
        dirs[:] = [d for d in dirs if not re.search(r"^[._]", d)]
        for file in files:
            if _is_plugin_metadata_file(file):
                yield os.path.join(root, file)
                files[:] = []


def _find_plugin(name, check_for_duplicates=False):
    plugin_dir = None
    for plugin in _list_plugins():
        if name == plugin.name:
            if check_for_duplicates and plugin_dir is not None:
                raise ValueError(f"Multiple plugins found with name '{name}'")

            plugin_dir = plugin.path

    if plugin_dir is None:
        raise ValueError(f"Plugin '{name}' not found")

    return plugin_dir


def _list_disabled_plugins():
    try:
        with open(foc.locate_app_config(), "r") as f:
            app_config = json.load(f)
    except:
        return {}

    plugins = app_config.get("plugins", {})
    return [name for name, d in plugins.items() if d.get("enabled") == False]


def _recommend_plugin_dir(plugin):
    plugins_dir = fo.config.plugins_dir
    if os.path.isdir(plugins_dir):
        existing_dirs = set(os.listdir(plugins_dir))
    else:
        existing_dirs = {}

    dirname = os.path.basename(plugin.path)
    if dirname not in existing_dirs:
        return os.path.join(plugins_dir, dirname)

    name = plugin.name
    if name not in existing_dirs:
        return os.path.join(plugins_dir, name)

    unique_name = None
    i = 2
    while True:
        unique_name = name + str(i)
        if unique_name in existing_dirs:
            i += 1
        else:
            break

    return os.path.join(plugins_dir, unique_name)


def _recommend_plugin_label(name):
    label = re.sub("[^A-Za-z0-9]+", " ", name)
    return " ".join([w.capitalize() for w in label.split()])


def _update_plugin_settings(plugin_name, enabled=None, **kwargs):
    # This would ensure that the plugin actually exists
    # _find_plugin(plugin_name)

    # Plugins are enabled by default, so if we can't read the App config or it
    # doesn't exist, don't do anything
    okay_missing = enabled in (True, None) and not kwargs

    # Load existin App config, if any
    app_config_path = foc.locate_app_config()
    if os.path.isfile(app_config_path):
        try:
            with open(app_config_path, "rt") as f:
                app_config = json.load(f)
        except Exception as e:
            if okay_missing:
                return

            raise ValueError(
                f"Failed to parse App config at '{app_config_path}'"
            ) from e
    elif okay_missing:
        return
    else:
        app_config = {}

    if app_config.get("plugins") is None:
        app_config["plugins"] = {}

    plugins = app_config["plugins"]

    if not plugins.get(plugin_name):
        plugins[plugin_name] = {}

    plugin_settings = plugins[plugin_name]

    if enabled in (True, None):
        # Plugins are enabled by default, so just remove the entry altogether
        plugin_settings.pop("enabled", None)
        if not plugin_settings:
            plugins.pop(plugin_name)
    else:
        plugin_settings["enabled"] = False

    plugin_settings.update(kwargs)

    with open(app_config_path, "wt") as f:
        json.dump(app_config, f, indent=4)
