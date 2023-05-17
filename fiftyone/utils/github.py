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
    """Class for interacting with a GitHub repository.

    .. note::

        To interact with private GitHub repositories that you have access to,
        provide your GitHub personal access token by setting the
        ``GITHUB_TOKEN`` environment variable.

    Args:
        repo: the GitHub repository or identifier, which can be:

            -   a GitHub URL like ``https://github.com/<user>/<repo>``
            -   a GitHub ref like
                ``https://github.com/<user>/<repo>/tree/<branch>`` or
                ``https://github.com/<user>/<repo>/commit/<commit>``
            -   a GitHub ref string like ``<user>/<repo>[/<ref>]``
    """

    def __init__(self, repo):
        if etaw.is_url(repo):
            params = self._parse_url(repo)
        else:
            params = self._parse_identifier(repo)

        self._user = params.get("user")
        self._repo = params.get("repo")
        self._ref = params.get("ref", None)
        self._session = None

    @property
    def user(self):
        """The username of the repo."""
        return self._user

    @property
    def repo(self):
        """The name of the repo."""
        return self._repo

    @property
    def ref(self):
        """The ref (e.g. branch, tag, commit hash), if any."""
        return self._ref

    @ref.setter
    def ref(self, ref):
        self._ref = ref

    @property
    def identifier(self):
        """The repository identifier string."""
        repo = f"{self.user}/{self.repo}"
        if self.ref:
            repo += "/" + self.ref

        return repo

    def get_repo_info(self):
        """Returns a dict of info about the repository.

        Returns:
            an info dict
        """
        url = f"https://api.github.com/repos/{self.user}/{self.repo}"
        return self._get(url)

    def list_path_contents(self, path=None):
        """Returns the contents of the repo rooted at the given path.

        Args:
            path (None): an optional root path to start the search from

        Returns:
            a list of file info dicts
        """
        url = f"https://api.github.com/repos/{self.user}/{self.repo}/contents"
        if path:
            url += "/" + path

        if self.ref:
            url += "?ref=" + self.ref

        return self._get(url)

    def list_repo_contents(self, recursive=True):
        """Returns a flat list of the repository's contents.

        Args:
            recursive (True): whether to recursively traverse subdirectories

        Returns:
            a list of file info dicts
        """
        if self.ref:
            ref = self.ref
        else:
            ref = self.get_repo_info()["default_branch"]

        url = f"https://api.github.com/repos/{self.user}/{self.repo}/git/trees/{ref}?recursive={int(recursive)}"
        return self._get(url)["tree"]

    def download(self, outdir):
        """Downloads the repository to the specified root directory.

        Args:
            outdir: the output directory
        """
        zip_path = os.path.join(outdir, "download.zip")
        zip_url = (
            f"https://api.github.com/repos/{self.user}/{self.repo}/zipball"
        )
        if self.ref:
            zip_url += "/" + self.ref

        web_session = etaw.WebSession()
        web_session.sess = self._get_session()
        web_session.write(zip_path, zip_url)

        etau.extract_zip(zip_path, delete_zip=True)

    def _get_session(self):
        if self._session is None:
            self._session = self._make_session()

        return self._session

    def _make_session(self):
        session = requests.Session()
        token = os.environ.get("GITHUB_TOKEN", None)
        if token:
            logger.debug("Using GitHub token as authorization")
            session.headers.update({"Authorization": "token " + token})

        return session

    def _get(self, url):
        session = self._get_session()
        resp = session.get(url).json()
        if isinstance(resp, dict) and "message" in resp:
            error = resp["message"]
            raise ValueError(f"{error}: {self.identifier}")

        return resp

    def _parse_url(self, url):
        return re.search(
            "github.com/(?P<user>[A-Za-z0-9_-]+)/((?P<repo>["
            "A-Za-z0-9_-]+)((/.+?)?/(?P<ref>[A-Za-z0-9_-]+)?(?P<path>.*)?)?)",
            url,
        ).groupdict()

    def _parse_identifier(self, repo):
        params = repo.split("/")
        if len(params) < 2:
            raise ValueError(
                f"Invalid identifier '{repo}'. Expected <user>/<repo>[/<ref>]"
            )

        return dict(
            user=params[0],
            repo=params[1],
            ref=params[2] if len(params) > 2 else None,
        )
