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
from packaging.requirements import Requirement
import re
import shutil

import yaml

import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.constants as foc
from fiftyone.core.config import locate_app_config
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
        try:
            plugins.append(_load_plugin_definition(p))
        except:
            logger.debug(f"Failed to parse plugin at '{p.path}'")

    return plugins


def enable_plugin(plugin_name):
    """Enables the given plugin.

    Args:
        plugin_name: the plugin name
    """
    _update_plugin_settings(plugin_name, enabled=True)


def disable_plugin(plugin_name):
    """Disables the given plugin.

    Args:
        plugin_name: the plugin name
    """
    _update_plugin_settings(plugin_name, enabled=False)


def delete_plugin(plugin_name):
    """Deletes the given plugin from local disk.

    Args:
        plugin_name: the plugin name
    """
    plugin = _get_plugin(plugin_name)
    _update_plugin_settings(plugin_name, delete=True)
    etau.delete_dir(plugin.path)


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


def get_plugin(name):
    """Gets the definition for the given plugin.

    Args:
        name: the plugin name

    Returns:
        a :class:`PluginDefinition`
    """
    plugin = _get_plugin(name)
    return _load_plugin_definition(plugin)


def find_plugin(name):
    """Returns the path to the plugin on local disk.

    Args:
        name: the plugin name

    Returns:
        the path to the plugin directory
    """
    plugin = _get_plugin(name)
    return plugin.path


def download_plugin(
    url_or_gh_repo,
    plugin_names=None,
    max_depth=3,
    overwrite=False,
):
    """Downloads the plugin(s) from the given location to your local plugins
    directory (``fo.config.plugins_dir``).

    .. note::

        To download from a private GitHub repository that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Args:
        url_or_gh_repo: the location to download from, which can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a publicly accessible URL of an archive (eg zip or tar) file

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
        a dict mapping plugin names to plugin directories on disk
    """
    url = None
    repo = None
    if etaw.is_url(url_or_gh_repo):
        if "github" in url_or_gh_repo:
            repo = GitHubRepository(url_or_gh_repo)
        else:
            url = url_or_gh_repo
    else:
        repo = GitHubRepository(url_or_gh_repo)

    if etau.is_str(plugin_names):
        plugin_names = {plugin_names}
    elif plugin_names is not None:
        plugin_names = set(plugin_names)

    existing_plugin_dirs = {p.name: p.path for p in _list_plugins()}

    downloaded_plugins = {}
    with etau.TempDir() as tmpdir:
        if repo is not None:
            logger.info(f"Downloading {repo.identifier}...")
            repo.download(tmpdir)
        else:
            logger.info(f"Downloading {url}...")
            _download_archive(url, tmpdir)

        metadata_paths = _find_plugin_metadata_files(
            os.path.join(tmpdir, "*"),
            max_depth=max_depth + 1,
        )
        if not metadata_paths:
            logger.info(
                f"No {_PLUGIN_METADATA_FILENAMES} files found in {url} (max_depth={max_depth})"
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
                    logger.info(f"Skipping existing plugin '{plugin.name}'")
                    continue

                logger.debug(f"Overwriting existing plugin '{plugin.name}'")
                etau.delete_dir(existing_dir)
                plugin_dir = existing_dir
            else:
                plugin_dir = _recommend_plugin_dir(plugin.name)

            logger.info(f"Copying plugin '{plugin.name}' to '{plugin_dir}'")
            etau.copy_dir(plugin.path, plugin_dir)
            downloaded_plugins[plugin.name] = plugin_dir

    if plugin_names is not None:
        missing_plugins = set(plugin_names) - set(downloaded_plugins.keys())
        if missing_plugins:
            logger.warning(f"Plugins not found: {missing_plugins}")

    return downloaded_plugins


def _download_archive(url, outdir):
    archive_name = os.path.basename(url)
    if not os.path.splitext(archive_name)[1]:
        raise ValueError("Cannot infer appropriate archive type for '{url}'")

    archive_path = os.path.join(outdir, archive_name)
    etaw.download_file(url, path=archive_path)
    etau.extract_archive(archive_path)


def load_plugin_requirements(plugin_name):
    """Loads the Python package requirements associated with the given plugin,
    if any.

    Args:
        plugin_name: the plugin name

    Returns:
        a list of requirement strings, or ``None``
    """
    req_path = _find_requirements(plugin_name)
    return fou.load_requirements(req_path) if req_path else None


def install_plugin_requirements(plugin_name, error_level=None):
    """Installs any Python package requirements associated with the given
    plugin.

    Args:
        plugin_name: the plugin name
        error_level (None): the error level to use, defined as:

            -   0: raise error if the install fails
            -   1: log warning if the install fails
            -   2: ignore install fails

            By default, ``fiftyone.config.requirement_error_level`` is used
    """
    req_path = _find_requirements(plugin_name)
    if req_path:
        fou.install_requirements(req_path, error_level=error_level)


def ensure_plugin_requirements(
    plugin_name, error_level=None, log_success=False
):
    """Ensures that any Python package requirements associated with the given
    plugin are installed.

    Args:
        plugin_name: the plugin name
        error_level (None): the error level to use, defined as:

            -   0: raise error if requirement is not satisfied
            -   1: log warning if requirement is not satisifed
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        log_success (False): whether to generate a log message if a requirement
            is satisifed
    """

    req_path = _find_requirements(plugin_name)
    if req_path:
        fou.ensure_requirements(
            req_path, error_level=error_level, log_success=log_success
        )


def _find_requirements(plugin_name):
    plugin_dir = find_plugin(plugin_name)
    req_path = os.path.join(plugin_dir, "requirements.txt")
    if os.path.isfile(req_path):
        return req_path

    logger.info(f"No requirements.txt found for '{plugin_name}")
    return None


def ensure_plugin_compatibility(
    plugin_name, error_level=None, log_success=False
):
    """Ensures that the given plugin is compatibile with your current FiftyOne
    pacakge version.

    Args:
        plugin_name: the plugin name
        error_level (None): the error level to use, defined as:

            -   0: raise error if plugin is not compatibile
            -   1: log warning if plugin is not satisifed
            -   2: ignore fiftyone compatibility requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        log_success (False): whether to generate a log message if the plugin is
            compatible
    """
    if error_level is None:
        error_level = fo.config.requirement_error_level

    pd = get_plugin(plugin_name)
    req_str = pd.fiftyone_requirement
    if req_str is None:
        return

    try:
        req = Requirement(req_str)
    except:
        logger.warning(
            f"Unable to understand plugin {plugin_name}'s fiftyone version '{pd.fiftyone_compatibility}'"
        )
        return

    if not req.specifier.contains(foc.VERSION):
        exception = ImportError(
            f"Plugin {plugin_name} requires {req_str} but you are running {foc.VERSION}, which is not compatible"
        )
        fou.handle_error(exception, error_level)
    elif log_success:
        logger.info(
            f"Plugin {plugin_name} is compatible: requires {req_str} (found {foc.VERSION})"
        )


def create_plugin(
    plugin_name,
    from_files=None,
    outdir=None,
    description=None,
    version=None,
    overwrite=False,
    **kwargs,
):
    """Creates a plugin with the given name.

    If no ``from_files`` are provided, a directory containing only the plugin's
    metadata file will be created.

    If no ``outdir`` is specified, the plugin is created within your local
    plugins directory (``fo.config.plugins_dir``).

    Args:
        plugin_name: the name of the plugin
        from_files (None): a directory or list of explicit filepaths to include
            in the plugin
        outdir (None): the path at which to create the plugin directory. If
            not provided, the plugin is created within your
            ``fo_config.plugins_dir``
        description (None): a description for the plugin
        version (None): an optional FiftyOne version requirement string
        overwrite (False): whether to overwrite a local plugin with the same
            name if one exists
        **kwargs: additional keyword arguments to include in the plugin
            definition

    Returns:
        the directory containing the created plugin
    """
    if outdir is None:
        existing_plugin_dirs = {p.name: p.path for p in _list_plugins()}
        if plugin_name in existing_plugin_dirs:
            if not overwrite:
                raise ValueError(f"Plugin '{plugin_name}' already exists")

            plugin_dir = existing_plugin_dirs[plugin_name]
            logger.info(f"Overwriting existing plugin '{plugin_name}'")
        else:
            plugin_dir = os.path.join(fo.config.plugins_dir, plugin_name)
    elif os.path.isdir(outdir):
        if not overwrite:
            raise ValueError(f"Directory '{outdir}' already exists")

        plugin_dir = outdir
        logger.debug(f"Overwriting existing plugin at '{plugin_dir}'")
    else:
        plugin_dir = _recommend_plugin_dir(plugin_name)
        logger.info(f"Creating plugin at '{plugin_dir}'")

    etau.ensure_empty_dir(plugin_dir, cleanup=True)

    if from_files is not None:
        if etau.is_str(from_files):
            from_files = [from_files]

        for from_path in from_files:
            if os.path.isfile(from_path):
                shutil.copy(from_path, plugin_dir)
            elif os.path.isdir(from_path):
                shutil.copytree(from_path, plugin_dir)
            else:
                logger.warning(
                    f"Skipping nonexistent file or directory '{from_path}'"
                )

    yaml_path = _find_plugin_metadata_file(plugin_dir)
    if yaml_path is None:
        yaml_path = os.path.join(plugin_dir, _PLUGIN_METADATA_FILENAMES[0])

    pd = {"name": plugin_name}
    if description:
        pd[description] = description

    pd.update(kwargs)

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

    return plugin_dir


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
        # Ignore hidden directories
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for file in files:
            if _is_plugin_metadata_file(file):
                yield os.path.join(root, file)
                dirs[:] = []  # stop traversing `root` once we find a plugin
                break


def _get_plugin(name, enabled=None, check_for_duplicates=True):
    plugin = None
    for _plugin in _list_plugins(enabled=enabled):
        if _plugin.name == name:
            if check_for_duplicates and plugin is not None:
                raise ValueError(f"Multiple plugins found with name '{name}'")

            plugin = _plugin

    if plugin is None:
        raise ValueError(f"Plugin '{name}' not found")

    return plugin


def _load_plugin_definition(plugin):
    metadata_path = _find_plugin_metadata_file(plugin.path)
    return PluginDefinition.from_disk(metadata_path)


def _list_disabled_plugins():
    try:
        with open(locate_app_config(), "r") as f:
            app_config = json.load(f)
    except:
        return {}

    plugins = app_config.get("plugins", {})
    return [name for name, d in plugins.items() if d.get("enabled") == False]


def _recommend_plugin_dir(plugin_name, src_dir=None):
    plugins_dir = fo.config.plugins_dir
    if os.path.isdir(plugins_dir):
        existing_dirs = etau.list_subdirs(plugins_dir, recursive=True)
    else:
        existing_dirs = set()

    # Use `src_dir` if provided
    if src_dir is not None:
        dirname = os.path.basename(src_dir)
        if dirname not in existing_dirs:
            return os.path.join(plugins_dir, dirname)

    # Else use directory-ified plugin name
    name = os.path.join(*plugin_name.split("/"))  # Windows compatibility
    if name not in existing_dirs:
        return os.path.join(plugins_dir, name)

    # Else generate a unique name based on the plugin name
    unique_name = None
    i = 2
    while True:
        unique_name = name + str(i)
        if unique_name in existing_dirs:
            i += 1
        else:
            break

    return os.path.join(plugins_dir, unique_name)


def _recommend_label(name):
    label = re.sub("[^A-Za-z0-9]+", " ", name)
    return " ".join([w.capitalize() for w in label.split()])


def _update_plugin_settings(plugin_name, enabled=None, delete=False, **kwargs):
    # This would ensure that the plugin actually exists
    # _get_plugin(plugin_name)

    # Plugins are enabled by default, so if we can't read the App config or it
    # doesn't exist, don't do anything
    okay_missing = enabled in (True, None) and not kwargs

    # Load existing App config, if any
    app_config_path = locate_app_config()
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

    if delete:
        # Delete entire plugin entry
        plugins.pop(plugin_name, None)
    else:
        # Update plugin settings
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
