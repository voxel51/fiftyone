import json
import logging
import os
import re
from typing import Optional

import eta.core.web as etaw
import requests


def parse_url(url):
    """Parses a GitHub URL into its components."""
    logging.debug(f"Parsing url: {url}")
    params = re.search(
        "github.com/(?P<user>[A-Za-z0-9_-]+)/((?P<repo>["
        "A-Za-z0-9_-]+)((/.+?)?/(?P<ref>[A-Za-z0-9_-]+)?(?P<path>.*)?)?)",
        str(url),
    ).groupdict()
    params["is_gist"] = False
    params["ref"] = params["ref"] or "main"
    params["path"] = params["path"] or ""
    logging.debug(f"params = {params}")
    return params


def parse_repo(repo):
    """Parses a GitHub repo string into its components."""
    logging.debug(f"Parsing repo: {repo}")
    params = repo.split("/")
    if len(params) < 2:
        raise ValueError(
            "Invalid repo format. Must be in the form of user/repo/<ref>"
        )
    logging.debug(f"params = {params}")
    return {
        "user": params[0],
        "repo": params[1],
        "ref": params[2] if len(params) > 2 else "main",
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


def repo_download_link(user, repo, ref: str = None):
    """
    Returns the URL to download a GitHub repo as a zip archive
    Args:
        github_repo: URL or '<username>/<repo>' of the GitHub repo containing the plugin
    """
    zip_url = f"https://api.github.com/repos/{user}/{repo}/zipball"
    if ref:
        zip_url = os.path.join(zip_url, ref)

    return zip_url


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
        self._ref = params.get("ref")

    @property
    def user(self) -> str:
        """The GitHub username of the repo owner"""
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

    @property
    def download_url(self) -> str:
        """The URL to download the repo as a zip archive"""
        return repo_download_link(self.user, self.name, self.ref)

    def list_path_contents(self, path: Optional[str] = None) -> Optional[list]:
        """Returns the contents of the repo at the given path"""

        content_url = (
            f"https://api.github.com/repos/{self.user}/{self.name}/contents"
        )
        if path:
            content_url = os.path.join(content_url, path)
        if self.ref:
            content_url = f"{content_url}?ref={self.ref}"
        return requests.get(content_url).json()

    def list_repo_contents(self, recursive: bool = True) -> Optional[list]:
        """Returns a flatlist of the contents of the repo."""
        content_url = f"https://api.github.com/repos/{self.user}/{self.name}/git/trees/{self.ref}?recursive={int(recursive)}"
        resp = requests.get(content_url).json()
        if "message" in resp:
            raise ValueError(resp["message"])

        return requests.get(content_url).json().get("tree", None)
