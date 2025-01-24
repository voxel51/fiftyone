"""
Core plugin methods.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import dataclass
import json
import logging
import os
from packaging.requirements import Requirement
import re
import shutil
from typing import Optional

import yaml

import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone as fo
import fiftyone.constants as foc
from fiftyone.core.config import locate_app_config
import fiftyone.core.storage as fos
import fiftyone.core.utils as fou
from fiftyone.plugins.definitions import PluginDefinition
from fiftyone.utils.github import GitHubRepository
import fiftyone.plugins.constants as fpc

PLUGIN_METADATA_FILENAMES = ("fiftyone.yml", "fiftyone.yaml")

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
    shadow_paths: Optional[list[str]] = None

    def __repr__(self):
        return f"Plugin(name={self.name}, path={self.path})"


def list_plugins(enabled=True, builtin=False, shadowed=False):
    """Lists available plugins.

    Args:
        enabled (True): whether to include only enabled plugins (True) or only
            disabled plugins (False) or all plugins ("all")
        builtin (False): whether to include only builtin plugins (True) or only
            non-builtin plugins (False) or all plugins ("all")
        shadowed (False): whether to include only "shadowed" duplicate plugins
            (True) or only usable plugins (False) or all plugins ("all")

    Returns:
        a list of :class:`PluginDefinition` instances
    """
    if enabled == "all":
        enabled = None

    if builtin == "all":
        builtin = None

    if shadowed == "all":
        shadowed = None

    plugins = []
    for p in _list_plugins(
        enabled=enabled, builtin=builtin, shadowed=shadowed
    ):
        try:
            plugins.append(_load_plugin_definition(plugin=p))
        except:
            logger.info(f"Failed to parse plugin at '{p.path}'")

    return plugins


def enable_plugin(plugin_name, _allow_missing=False):
    """Enables the given plugin.

    Args:
        plugin_name: the plugin name
    """
    try:
        plugin = get_plugin(plugin_name)
    except ValueError:
        if not _allow_missing:
            raise

        plugin = None

    if plugin is not None and plugin.builtin:
        raise ValueError(
            f"Cannot change enablement of builtin plugin '{plugin_name}'"
        )

    _update_plugin_settings(plugin_name, enabled=True)


def disable_plugin(plugin_name, _allow_missing=False):
    """Disables the given plugin.

    Args:
        plugin_name: the plugin name
    """
    try:
        plugin = get_plugin(plugin_name)
    except ValueError:
        if not _allow_missing:
            raise

        plugin = None

    if plugin is not None and plugin.builtin:
        raise ValueError(
            f"Cannot change enablement of builtin plugin '{plugin_name}'"
        )

    _update_plugin_settings(plugin_name, enabled=False)


def delete_plugin(plugin_name):
    """Deletes the given plugin from local disk.

    Args:
        plugin_name: the plugin name
    """
    plugin = get_plugin(plugin_name)
    if plugin.builtin:
        raise ValueError(f"Cannot delete builtin plugin '{plugin_name}'")

    _update_plugin_settings(plugin_name, delete=True)
    etau.delete_dir(plugin.directory)


def list_downloaded_plugins():
    """Returns a list of all downloaded plugin names.

    Returns:
        a list of plugin names
    """
    plugins = _list_plugins(builtin=False, shadowed=False)
    return [p.name for p in plugins]


def list_enabled_plugins():
    """Returns a list of all enabled plugin names.

    Returns:
        a list of plugin names
    """
    plugins = _list_plugins(enabled=True, builtin=False, shadowed=False)
    return [p.name for p in plugins]


def list_disabled_plugins():
    """Returns a list of all disabled plugin names.

    Returns:
        a list of plugin names
    """
    plugins = _list_plugins(enabled=False, builtin=False, shadowed=False)
    return [p.name for p in plugins]


def get_plugin(name=None, plugin_dir=None):
    """Gets the definition for the given plugin.

    Args:
        name (None): the plugin name
        plugin_dir (None): a directory containing the plugin

    Returns:
        a :class:`PluginDefinition`
    """
    if plugin_dir is not None:
        return _load_plugin_definition(plugin_dir=plugin_dir)

    plugin = _get_plugin(name)
    return _load_plugin_definition(plugin=plugin)


def find_plugin(name):
    """Returns the path to the plugin on local disk.

    Args:
        name: the plugin name

    Returns:
        the path to the plugin directory
    """
    plugin = _get_plugin(name)
    return plugin.path


def download_plugin(url_or_gh_repo, plugin_names=None, overwrite=False):
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
            -   a GitHub tree path like
                ``https://github.com/<user>/<repo>/tree/<branch>/<path>``
            -   a publicly accessible URL of an archive (eg zip or tar) file

        plugin_names (None): a plugin name or iterable of plugin names to
            download. By default, all found plugins are downloaded
        overwrite (False): whether to overwrite an existing plugin with the
            same name if it already exists

    Returns:
        a dict mapping plugin names to plugin directories on disk
    """
    url = None
    repo = None
    if etaw.is_url(url_or_gh_repo):
        if "github" in url_or_gh_repo:
            repo = GitHubRepository(url_or_gh_repo, safe=True)
        else:
            url = url_or_gh_repo
    else:
        repo = GitHubRepository(url_or_gh_repo, safe=True)

    if etau.is_str(plugin_names):
        plugin_names = {plugin_names}
    elif plugin_names is not None:
        plugin_names = set(plugin_names)

    existing_plugins = {
        p.name: p for p in list_plugins(enabled="all", builtin="all")
    }
    downloaded_plugins = {}
    skipped_plugins = set()

    with etau.TempDir() as tmpdir:
        root_dir = tmpdir

        if repo is not None:
            logger.info(f"Downloading {repo.identifier}...")
            repo.download(tmpdir)

            # Limit search to tree path if requested
            if repo.safe_path is not None:
                # There should be exactly one subdir; if there's not then
                # something is wrong and we better not limit the search tree
                subdirs = fos.list_subdirs(root_dir)
                if len(subdirs) == 1:
                    root_dir = os.path.join(
                        root_dir,
                        subdirs[0],
                        *repo.safe_path.split("/"),
                    )
        else:
            logger.info(f"Downloading {url}...")
            _download_archive(url, tmpdir)

        metadata_paths = list(
            _iter_plugin_metadata_files(root_dir=root_dir, strict=True)
        )
        if not metadata_paths:
            src = repo.identifier if repo is not None else url
            logger.info(f"No plugin YAML files found in {src}")

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

            existing_plugin = existing_plugins.get(plugin.name, None)
            if existing_plugin is not None:
                if not overwrite:
                    skipped_plugins.add(plugin.name)
                    logger.info(f"Skipping existing plugin '{plugin.name}'")
                    continue

                if existing_plugin.builtin:
                    raise ValueError(
                        f"Cannot overwrite builtin plugin '{plugin.name}'"
                    )

                logger.info(f"Overwriting existing plugin '{plugin.name}'")
                plugin_dir = existing_plugin.directory
                etau.delete_dir(plugin_dir)
            else:
                plugin_dir = _recommend_plugin_dir(plugin.name)

            logger.info(f"Copying plugin '{plugin.name}' to '{plugin_dir}'")
            etau.copy_dir(plugin.path, plugin_dir)
            downloaded_plugins[plugin.name] = plugin_dir

    if plugin_names is not None:
        missing_plugins = (
            set(plugin_names)
            - set(downloaded_plugins.keys())
            - skipped_plugins
        )
        if missing_plugins:
            logger.warning(f"Plugins not found: {missing_plugins}")

    return downloaded_plugins


def _download_archive(url, outdir):
    archive_name = os.path.basename(url)
    if not os.path.splitext(archive_name)[1]:
        raise ValueError(f"Cannot infer appropriate archive type for '{url}'")

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
            -   1: log warning if requirement is not satisfied
            -   2: ignore unsatisifed requirements

            By default, ``fiftyone.config.requirement_error_level`` is used
        log_success (False): whether to generate a log message if a requirement
            is satisfied
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
    """Ensures that the given plugin is compatible with your current FiftyOne
    package version.

    Args:
        plugin_name: the plugin name
        error_level (None): the error level to use, defined as:

            -   0: raise error if plugin is not compatible
            -   1: log warning if plugin is not satisfied
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
        existing_plugins = {
            p.name: p for p in list_plugins(enabled="all", builtin="all")
        }
        existing_plugin = existing_plugins.get(plugin_name, None)
        if existing_plugin is not None:
            if not overwrite:
                raise ValueError(f"Plugin '{plugin_name}' already exists")

            if existing_plugin.builtin:
                raise ValueError(
                    f"Cannot overwrite builtin plugin '{plugin_name}'"
                )

            plugin_dir = existing_plugin.directory
            logger.info(f"Overwriting existing plugin '{plugin_name}'")
        else:
            plugin_dir = os.path.join(fo.config.plugins_dir, plugin_name)
    elif os.path.isdir(outdir):
        if not overwrite:
            raise ValueError(f"Directory '{outdir}' already exists")

        plugin_dir = outdir
        logger.info(f"Overwriting existing plugin at '{plugin_dir}'")
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
        yaml_path = os.path.join(plugin_dir, PLUGIN_METADATA_FILENAMES[0])

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


def _find_plugin_metadata_file(dirpath):
    for filename in PLUGIN_METADATA_FILENAMES:
        metadata_path = os.path.join(dirpath, filename)
        if os.path.isfile(metadata_path):
            return metadata_path

    return None


def _parse_plugin_metadata(metadata_path):
    with open(metadata_path, "r") as f:
        plugin_name = yaml.safe_load(f).get("name")

    plugin_path = os.path.dirname(metadata_path)
    return PluginPackage(plugin_name, plugin_path)


def _list_plugins(enabled=None, builtin=None, shadowed=None):
    plugin_paths = []

    # Important: builtins are registered first for order of precedence
    if builtin in (True, None):
        plugin_paths.extend(
            _iter_plugin_metadata_files(fpc.BUILTIN_PLUGINS_DIR)
        )

    if builtin in (False, None):
        plugin_paths.extend(_iter_plugin_metadata_files())

    plugins = []
    for metadata_path in plugin_paths:
        try:
            plugin = _parse_plugin_metadata(metadata_path)
            plugins.append(plugin)
        except:
            logger.info(f"Failed to load plugin name from '{metadata_path}'")
            continue

    # Important: shadowed plugins are handled before filtering by enablement
    plugins = _handle_shadowed(plugins, shadowed=shadowed)

    disabled = set(_list_disabled_plugins())

    if enabled is True:
        return [p for p in plugins if p.name not in disabled]

    if enabled is False:
        return [p for p in plugins if p.name in disabled]

    return plugins


def _handle_shadowed(plugins, shadowed=None):
    existing_plugins = {}

    _plugins = []
    for plugin in plugins:
        existing_plugin = existing_plugins.get(plugin.name, None)
        if existing_plugin is not None:
            if existing_plugin.shadow_paths is None:
                existing_plugin.shadow_paths = []
            existing_plugin.shadow_paths.append(plugin.path)

            if shadowed in (True, None):
                _plugins.append(plugin)
        else:
            if shadowed in (False, None):
                _plugins.append(plugin)

            existing_plugins[plugin.name] = plugin

    return _plugins


def _iter_plugin_metadata_files(root_dir=None, strict=False):
    if root_dir is None:
        root_dir = fo.config.plugins_dir

    if not root_dir or not os.path.isdir(root_dir):
        return

    for root, dirs, files in os.walk(root_dir, followlinks=True):
        # Ignore hidden directories
        dirs[:] = [d for d in dirs if not d.startswith(".")]

        for file in files:
            if os.path.basename(file) in PLUGIN_METADATA_FILENAMES:
                yaml_path = os.path.join(root, file)

                # In strict mode we ensure this is a plugin YAML file
                if strict:
                    try:
                        with open(yaml_path, "r") as f:
                            type = yaml.safe_load(f).get("type")
                    except:
                        logger.warning("Failed to parse '%s'", yaml_path)
                        continue

                    # Note: if type is missing, we assume it is a plugin
                    if type not in (None, "plugin"):
                        continue

                yield yaml_path

                # Stop traversing `root` once we find a plugin
                dirs[:] = []
                break


def _get_plugin(name, enabled=None, builtin=None):
    for plugin in _list_plugins(
        enabled=enabled, builtin=builtin, shadowed=False
    ):
        if plugin.name == name:
            return plugin

    raise ValueError(f"Plugin '{name}' not found")


def _load_plugin_definition(plugin=None, plugin_dir=None):
    if plugin is not None:
        plugin_dir = plugin.path
        shadow_paths = plugin.shadow_paths
    else:
        shadow_paths = None

    metadata_path = _find_plugin_metadata_file(plugin_dir)
    return PluginDefinition.from_disk(metadata_path, shadow_paths=shadow_paths)


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
            # Plugins are enabled by default, so just remove entry altogether
            plugin_settings.pop("enabled", None)
            if not plugin_settings:
                plugins.pop(plugin_name)
        else:
            plugin_settings["enabled"] = False

        plugin_settings.update(kwargs)

    with open(app_config_path, "wt") as f:
        json.dump(app_config, f, indent=4)
