"""
GitHub utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
import re
import requests

import eta.core.utils as etau
import eta.core.web as etaw


logger = logging.getLogger(__name__)


class GitHubRepository(object):
    """Utility class for interacting with a GitHub repository.

    Args:
        repo: the GitHub repository or identifier, which can be:

            -   a GitHub repo URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
    """

    def __init__(self, repo):
        if etaw.is_url(repo):
            params = self.from_url(repo)
        else:
            params = self.from_str(repo)

        self._user = params.get("user")
        self._name = params.get("repo")
        self._ref = params.get("ref")

    @property
    def user(self):
        """The username of the repo."""
        return self._user

    @property
    def name(self):
        """The name of the repo."""
        return self._name

    @property
    def ref(self):
        """The ref of the repo (e.g. branch, tag, commit hash)."""
        return self._ref

    @ref.setter
    def ref(self, ref):
        self._ref = ref

    @property
    def download_url(self):
        """The URL to download the repo as a zip archive."""
        zip_url = (
            f"https://api.github.com/repos/{self.user}/{self.name}/zipball"
        )
        if self.ref:
            zip_url = os.path.join(zip_url, self.ref)

        return zip_url

    @classmethod
    def from_url(cls, url):
        """Parses a GitHub URL into its components."""
        params = re.search(
            "github.com/(?P<user>[A-Za-z0-9_-]+)/((?P<repo>["
            "A-Za-z0-9_-]+)((/.+?)?/(?P<ref>[A-Za-z0-9_-]+)?(?P<path>.*)?)?)",
            str(url),
        ).groupdict()
        params["is_gist"] = False
        params["ref"] = params["ref"] or "main"
        params["path"] = params["path"] or ""
        return params

    @classmethod
    def from_str(cls, repo):
        """Parses a GitHub repo string into its components."""
        params = repo.split("/")
        if len(params) < 2:
            raise ValueError(
                "Invalid repo format. Must be in the form of user/repo/<ref>"
            )

        return {
            "user": params[0],
            "repo": params[1],
            "ref": params[2] if len(params) > 2 else "main",
            "is_gist": False,
            "path": "",
        }

    def download(self, outdir):
        """Downloads the repository to the specified root directory.

        .. note::

            To download from a private GitHub repository that you have access
            to, provide your GitHub personal access token by setting the
            ``GITHUB_TOKEN`` environment variable.

        Args:
            outdir: the output directory
        """
        zip_path = os.path.join(outdir, "download.zip")
        url = self.download_url

        session = etaw.WebSession()
        token = os.environ.get("GITHUB_TOKEN", None)
        if token:
            logger.debug("Using GitHub token as authorization for download")
            session.sess.headers.update({"Authorization": "token " + token})

        session.write(zip_path, url)
        etau.extract_zip(zip_path, delete_zip=True)

    def list_path_contents(self, path=None):
        """Returns the contents of the repo at the given path."""
        content_url = (
            f"https://api.github.com/repos/{self.user}/{self.name}/contents"
        )
        if path:
            content_url = os.path.join(content_url, path)

        if self.ref:
            content_url = f"{content_url}?ref={self.ref}"

        return requests.get(content_url).json()

    def list_repo_contents(self, recursive=True):
        """Returns a flat list of the contents of the repo."""
        content_url = f"https://api.github.com/repos/{self.user}/{self.name}/git/trees/{self.ref}?recursive={int(recursive)}"
        resp = requests.get(content_url).json()
        if "message" in resp:
            raise ValueError(resp["message"])

        return requests.get(content_url).json().get("tree", None)
