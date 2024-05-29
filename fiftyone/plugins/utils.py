"""
FiftyOne plugin utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import multiprocessing.dummy
import os

from bs4 import BeautifulSoup
import yaml

import fiftyone.core.utils as fou
from fiftyone.utils.github import GitHubRepository
from fiftyone.plugins.core import PLUGIN_METADATA_FILENAMES


logger = logging.getLogger(__name__)


def list_zoo_plugins(info=False):
    """Returns a list of available plugins registered in the
    `FiftyOne Plugins repository <https://github.com/voxel51/fiftyone-plugins>`_
    README.

    Example usage::

        import fiftyone.plugins.utils as fopu

        plugins = fopu.list_zoo_plugins()
        print(plugins)

        plugins = fopu.list_zoo_plugins(info=True)
        print(plugins)

    Args:
        info (False): whether to retrieve full plugin info for each plugin
            (True) or just return the available info from the README (False)

    Returns:
        a list of dicts describing the plugins
    """
    repo = GitHubRepository("https://github.com/voxel51/fiftyone-plugins")
    content = repo.get_file("README.md").decode()
    soup = BeautifulSoup(content, "html.parser")

    plugins = []
    for row in soup.find_all("tr"):
        cols = row.find_all(["td"])
        if len(cols) != 2:
            continue

        try:
            name = cols[0].text.strip()
            url = cols[0].find("a")["href"]
            description = cols[1].text.strip()
            plugins.append(dict(name=name, url=url, description=description))
        except Exception as e:
            logger.debug("Failed to parse plugin row: %s", e)

    if not info:
        return plugins

    tasks = [(p["url"], None) for p in plugins]
    return _get_all_plugin_info(tasks)


def find_plugins(gh_repo, info=False):
    """Returns the paths to the fiftyone YAML files for all plugins found in
    the given GitHub repository.

    Example usage::

        import fiftyone.plugins.utils as fopu

        # Search the entire repository
        plugins = fopu.find_plugins("https://github.com/voxel51/fiftyone-plugins")
        print(plugins)

        # Search a specific tree
        plugins = fopu.find_plugins("https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/annotation")
        print(plugins)

    Args:
        gh_repo: a GitHub repository, identifier, or tree root. See
            :class:`GitHubRepository <fiftyone.utils.github.GitHubRepository>`
            for details
        info (False): whether to retrieve full plugin info for each plugin
            (True) or just return paths to the fiftyone YAML files (False)

    Returns:
        a list of paths to fiftyone YAML files or plugin info dicts
    """
    try:
        root = GitHubRepository.parse_url(gh_repo).get("path", None)
    except:
        root = None

    repo = GitHubRepository(gh_repo)

    paths = []
    for d in repo.list_repo_contents(recursive=True):
        path = d["path"]
        if root is not None and not path.startswith(root):
            continue

        if os.path.basename(path) in PLUGIN_METADATA_FILENAMES:
            paths.append(path)

    if not info:
        return paths

    tasks = [(gh_repo, path) for path in paths]
    return _get_all_plugin_info(tasks)


def get_plugin_info(gh_repo, path=None):
    """Returns a dict of plugin info for a FiftyOne plugin hosted in GitHub.

    Example usage::

        import fiftyone.plugins.utils as fopu

        # Directly link to a repository with a top-level`fiftyone YAML
        info = fopu.get_plugin_info("https://github.com/voxel51/voxelgpt")
        print(info)

        # Provide repository and path separately
        info = fopu.get_plugin_info(
            "voxel51/fiftyone-plugins",
            path="plugins/annotation",
        )
        print(info)

        # Directly link to a plugin directory
        info = fopu.get_plugin_info("https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/annotation")
        print(info)

        # Directly link to a fiftyone YAML file
        info = fopu.get_plugin_info("https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/annotation/fiftyone.yml")
        print(info)

    Args:
        gh_repo: a GitHub repository, identifier, tree root, or blob. See
            :class:`GitHubRepository <fiftyone.utils.github.GitHubRepository>`
            for details
        path (None): the path to a fiftyone YAML file or the directory that
            contains it. This is only necessary if the fiftyone YAML file is
            not at the root of the repository and you have not implicitly
            included this path in ``gh_repo`` by providing a tree or blob path

    Returns:
        a dict or list of dicts of plugin info
    """
    if path is None:
        try:
            path = GitHubRepository.parse_url(gh_repo).get("path", None)
        except:
            pass

    # If the user didn't directly provide a blob path, we must try all possible
    # `PLUGIN_METADATA_FILENAMES` values
    paths = []
    if path is None:
        paths.extend(PLUGIN_METADATA_FILENAMES)
    elif not path.endswith(PLUGIN_METADATA_FILENAMES):
        paths.extend(path + "/" + f for f in PLUGIN_METADATA_FILENAMES)
    else:
        paths = [path]

    repo = GitHubRepository(gh_repo)

    content = None
    exception = None
    for path in paths:
        try:
            content = repo.get_file(path).decode()
            break
        except Exception as e:
            if exception is None:
                exception = e

    if content is None:
        raise exception

    return yaml.safe_load(content)


def _get_all_plugin_info(tasks):
    num_tasks = len(tasks)

    if num_tasks == 0:
        return []

    if num_tasks == 1:
        return [_do_get_plugin_info(tasks[0])]

    num_workers = fou.recommend_thread_pool_workers(min(num_tasks, 4))

    info = []
    with multiprocessing.dummy.Pool(processes=num_workers) as pool:
        for d in pool.imap_unordered(_do_get_plugin_info, tasks):
            info.append(d)

    return info


def _do_get_plugin_info(task):
    gh_repo, path = task

    try:
        return get_plugin_info(gh_repo, path=path)
    except Exception as e:
        if path is not None:
            spec = f"{gh_repo} ({path})"
        else:
            spec = gh_repo

        logger.debug("Failed to retrieve plugin info for %s: %s", spec, e)
