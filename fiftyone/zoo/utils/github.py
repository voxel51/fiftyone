import logging
import os
import re
from typing import Optional

import eta.core.web as etaw


def parse_url(url):
    """Parses a GitHub URL into its components."""
    logging.debug(f"Parsing url: {url}")
    params = re.search(
        "github.com/(?P<user>[A-Za-z0-9_-]+)/((?P<repo>["
        "A-Za-z0-9_-]+)((/.+?)?/(?P<branch>[A-Za-z0-9_-]+)?(?P<path>.*)?)?)",
        str(url),
    ).groupdict()
    params["is_gist"] = False
    params["branch"] = params["branch"] or "main"
    params["path"] = params["path"] or ""
    logging.debug(f"params = {params}")
    return params


def parse_repo(repo):
    """Parses a GitHub repo string into its components."""
    logging.debug(f"Parsing repo: {repo}")
    params = repo.split("/")
    if len(params) < 2:
        raise ValueError(
            "Invalid repo format. Must be in the form of user/repo/<branch>"
        )
    return {
        "user": params[0],
        "repo": params[1],
        "branch": params[2] if len(params) > 2 else "main",
        "is_gist": False,
        "path": "",
    }


def parse_gist_url(url):
    """Parses a GitHub Gist URL into its components."""
    logging.debug(f"Parsing gist url: {url}")
    params = re.search(
        r"gist.github.com/(?P<user>[A-Za-z0-9_-]+)/(?P<gist_id>[A-Za-z0-9_-]+)(#file-(?P<file>[A-Za-z0-9_.-]+))?",
        url,
    ).groupdict()
    params["is_gist"] = True
    logging.debug(f"params = {params}")
    return params


def get_zip_url(github_repo: str, ref: str = None):
    """
    Returns the URL to the zip file of the GitHub repo
    Args:
        github_repo: URL or '<username>/<repo>' of the GitHub repo containing the plugin
    """
    repo_spec = github_repo.split("github.com/")[-1]

    if "tree" in repo_spec:
        repo_spec.replace("tree", "zipball")
    else:
        repo_spec = os.path.join(repo_spec, "zipball")
    if ref:
        repo_spec = os.path.join(repo_spec, ref)
    return f"https://api.github.com/repos/{repo_spec}"


class GitHubRepo:
    """A GitHub repo containing a FiftyOne zoo package"""

    def __init__(self, repo_or_url: str):
        """
        Args:
            github_repo: URL or '<user>/<repo>[/<ref>]' of the GitHub repo containing the plugin
        """
        if not etaw.is_url(repo_or_url):
            params = parse_repo(repo_or_url)
        else:
            params = parse_url(repo_or_url)
        self._user = params.get("user")
        self._name = params.get("repo")
        self._ref = params.get("branch")
        self.download_url = get_zip_url(repo_or_url)

    @property
    def user(self) -> str:
        """The GitHub user name of the repo owner"""
        return self._user

    @property
    def name(self) -> str:
        """The name of the repo"""
        return self._name

    @property
    def ref(self) -> Optional[str]:
        """The ref of the repo (e.g. branch, tag, commit hash)"""
        return self._ref

    @ref.setter
    def ref(self, ref: str):
        """Sets the ref of the repo (e.g. branch, tag, commit hash)"""
        self._ref = ref
