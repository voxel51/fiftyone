"""
FiftyOne plugin utilities.

| Copyright 2017-2025, Voxel51, Inc.
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


def find_plugins(gh_repo, path=None, info=False):
    """Returns the paths to the fiftyone YAML files for all plugins found in
    the given GitHub repository.

    Example usage::

        import fiftyone.plugins.utils as fopu

        # Search the entire repository
        plugins = fopu.find_plugins("https://github.com/voxel51/fiftyone-plugins")
        print(plugins)

        # Search a specific tree root
        plugins = fopu.find_plugins(
            "https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/annotation"
        )
        print(plugins)

        # Search a specific branch + subdirectory
        plugins = fopu.find_plugins(
            "https://github.com/voxel51/fiftyone-plugins/tree/main",
            path="plugins/annotation",
        )
        print(plugins)

    Args:
        gh_repo: the GitHub repository, identifier, or tree path, which can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a GitHub tree path like
                ``https://github.com/<user>/<repo>/tree/<branch>/<path>``

        path (None): an optional subdirectory of the repository to which to
            restrict the search. If ``gh_repo`` also contains a ``<path>``, it
            is prepended to this value
        info (False): whether to retrieve full plugin info for each plugin
            (True) or just return paths to the fiftyone YAML files (False)

    Returns:
        a list of paths to fiftyone YAML files or plugin info dicts
    """
    root = path
    repo = GitHubRepository(gh_repo, safe=True)

    if repo.safe_path is not None:
        if path is not None:
            root = repo.safe_path + "/" + path
        else:
            root = repo.safe_path

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

        # A repository with a top-level fiftyone YAML file
        info = fopu.get_plugin_info("https://github.com/voxel51/voxelgpt")
        print(info)

        # A plugin that lives in a subdirectory
        # Manually specify the branch to use
        info = fopu.get_plugin_info(
            "https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/annotation"
        )
        print(info)

        # Directly link to a fiftyone YAML file
        info = fopu.get_plugin_info(
            "https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/annotation/fiftyone.yml"
        )
        print(info)

        # Provide subdirectory separately
        info = fopu.get_plugin_info(
            "voxel51/fiftyone-plugins",
            path="plugins/annotation",
        )
        print(info)

        # Provide fiftyone YAML file path separately
        info = fopu.get_plugin_info(
            "voxel51/fiftyone-plugins",
            path="plugins/annotation/fiftyone.yml",
        )
        print(info)

    Args:
        gh_repo: the GitHub repository, identifier, tree path, or blob path,
            which can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
            -   a GitHub tree path like
                ``https://github.com/<user>/<repo>/tree/<branch>/<path>``
            -   a GitHub blob path like
                ``https://github.com/<user>/<repo>/blob/<branch>/<path>``

        path (None): the path to a fiftyone YAML file or the directory that
            contains it. This is only necessary if the fiftyone YAML file is
            not at the root of the repository and you have not implicitly
            included this path in ``gh_repo`` by providing a tree or blob path

    Returns:
        a dict or list of dicts of plugin info
    """
    if gh_repo.endswith(PLUGIN_METADATA_FILENAMES):
        gh_repo, path = gh_repo.rsplit("/", 1)

    paths = []
    if path is None:
        paths.extend(PLUGIN_METADATA_FILENAMES)
    elif not path.endswith(PLUGIN_METADATA_FILENAMES):
        paths.extend(path + "/" + f for f in PLUGIN_METADATA_FILENAMES)
    else:
        paths = [path]

    # Here `gh_repo` may contain a subdirectory or blob path, which is not
    # allowed by `GitHubRepository` in general, but it's okay here because we
    # only need to call `get_file()`
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
