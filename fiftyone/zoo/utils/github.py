import io
import json
import logging
import os
import re
import sys
import tarfile
import types
from typing import Optional
import zipfile
from contextlib import contextmanager
import eta.core.web as etaw

import requests

__GH_CONTENT_URL = {
    "url": "https://{domain}/{user}/{repo}/{branch}{path}",
    "domain": "raw.githubusercontent.com",
}
# https://gist.githubusercontent.com/kaixi-wang/ed4eb4f4dd29e944a1a5de762a9511a0/raw/fd04658f92b124798dabaa99d03ea434a5849113/coco-2017.py
__GIST_CONTENT_URL = {
    "url": "https://{domain}/{user}/{gist_id}/raw/{file}/",
    "domain": "gist.githubusercontent.com",
}
# ====================== Configuration ======================

__LOCAL_HOME_DIR = os.path.expanduser("~")
# ====================== Logging ======================

log_level = (
    logging.DEBUG
    if os.environ.get("FIFTYONE_ENABLE_DEBUG_LOGGING", False)
    else logging.INFO
)
log_format = "%(message)s"
logger = logging.getLogger(__name__)
logger.setLevel(log_level)
log_handler = logging.StreamHandler()
log_handler.setLevel(log_level)
log_formatter = logging.Formatter(log_format)
log_handler.setFormatter(log_formatter)
logger.addHandler(log_handler)


def http(url: str, headers=None, method="get") -> Optional[dict]:
    """Makes a request to the given url
    Args:
        url (str):
        headers (dict):
        method (str):
    Returns:
        dict: A dict containing 'code', 'headers', 'body' of HTTP response.
    """
    if not headers:
        headers = {"User-Agent": "fiftyone"}
    try:
        req = getattr(requests, method.lower())
        resp = req(url, headers=headers)
        resp.raise_for_status()
        if resp.status_code == 200:
            return {
                "code": resp.status_code,
                "headers": resp.headers,
                "body": resp.text,
            }
    except requests.exceptions.HTTPError as he:
        return {
            "error": he,
            "code": resp.status_code,
            "headers": {},
            "body": None,
        }
    except Exception as e:
        # Should not get here...
        raise ValueError(f"Uncaught Error: {e}")


def _create_paths(module_name, file_types=["py"]):
    """Returns possible paths where a module/package could be located
    TODO: Was written for python... Fix this to work with other possible file types?
    """
    module_name = module_name.replace(".", "/")
    ret = []
    for ft in file_types:
        ret.extend(
            [
                f"{module_name}.{ft}",
                f"{module_name}/__init__.py",
            ]
        )
    return ret


def _parse_url(url):
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


def _parse_repo(repo):
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


def _parse_gist_url(url):
    logging.debug(f"Parsing gist url: {url}")
    params = re.search(
        r"gist.github.com/(?P<user>[A-Za-z0-9_-]+)/(?P<gist_id>[A-Za-z0-9_-]+)(#file-(?P<file>[A-Za-z0-9_.-]+))?",
        url,
    ).groupdict()
    params["is_gist"] = True
    logging.debug(f"params = {params}")
    return params


def _retrieve_archive(content):
    """Returns a zip or tar archive object if available"""
    content_io = io.BytesIO(content)
    try:
        tar = tarfile.open(fileobj=content_io, mode="r:*")
        return tar
    except tarfile.ReadError:
        pass
    try:
        zip_ = zipfile.ZipFile(content_io)
        return zip_
    except zipfile.BadZipfile:
        pass
    return None


def _open_archive_file(archive_obj, filepath, zip_pwd=None):
    """Opens a file located under `filepath` from an archive
    Args:
        archive_obj (object): zipfile.ZipFile or tarfile.TarFile
        filepath (str): The path in the archive to be extracted and returned
        zip_pwd (bytes): The password of the ZipFile (if needed)
    Returns:
        bytes: The content of the extracted file
    """
    logging.debug(f"Opening archive file: {filepath}")
    if isinstance(archive_obj, tarfile.TarFile):
        return archive_obj.extractfile(filepath).read()
    if isinstance(archive_obj, zipfile.ZipFile):
        return archive_obj.open(filepath, "r", pwd=zip_pwd).read()

    raise ValueError("Only ZIP and TAR archives supported")


class GitHubImporter(object):
    """Dynamically imports remote modules from GitHub.
    Args:
        repo_or_url (str): Path to a GitHub resource
            For repos, the path should be in the form
            ``<user>/<repo>`` or ``<user>/<repo>/<branch>``.
            For gist, the url should be in the form
            ``https://gist.github.com/<user>/<gist_id>[#file-<slug>]``.
        headers (dict): The HTTP Headers to be used in all HTTP requests issued by this Importer.
            Can be used for authentication, logging, etc.
    """

    def __init__(self, repo_or_url: str, headers: Optional = None, **kwargs):
        # remove trailing '/'
        self.remote_src = (
            repo_or_url if not repo_or_url.endswith("/") else repo_or_url[:-1]
        )
        self.headers = headers
        # TODO: move to helper method
        try:
            if not etaw.is_url(repo_or_url):
                params = _parse_repo(repo_or_url)
            elif "gist.github.com" in repo_or_url:
                params = _parse_gist_url(repo_or_url)
            else:
                params = _parse_url(repo_or_url)
            self.repo_params = params
            self.url = _create_content_url(params)
        except Exception as e:
            logger.error("Error parsing repo_or_url string: %s" % e)
            raise e
        self.modules = {}
        self.archive = None

    def list_repo_packages(self, user: str, repo: str, branch="main"):
        """Returns a list of packages that can be imported from a GitHub repo"""
        packages = []
        # https://api.github.com/repos/voxel51/fiftyone-plugins/git/trees/operators?recursive=1
        url = f"https://api.github.com/repos/{user}/{repo}/git/trees/operators?recursive=1"
        resp = http(url, headers=self.headers)
        if not resp.get("error", None):
            # python packages
            packages += list(
                map(
                    lambda x: x["path"][:-12].replace("/", "."),
                    filter(
                        lambda x: x["path"].endswith("__init__.py"),
                        json.loads(resp["body"])["tree"],
                    ),
                )
            )

        return packages

    def show_package_details(self, package_name: str):
        pass

    def list_modules(self, package_name):
        pass

    def list_installed_zoo_packages(self):
        # TODO:
        pass

    def find_module(self, fullname, path=None):
        """Method to find importable python modules
        Returns:
          (object): This Importer object (`self`) if the module can be importer
            or `None` if the module is not available.
        """

        paths = _create_paths(fullname)
        for path in paths:
            if self.archive is None:
                url = self.url + "/" + path
                resp = http(url, headers=self.headers)
                if not resp.get("error", None):
                    # Set the archive object if url points to a zip or tar file
                    self.archive = _retrieve_archive(resp["body"])
                    self.modules[fullname] = {}
                    self.modules[fullname]["content"] = resp["body"]
                    self.modules[fullname]["filepath"] = url
                    self.modules[fullname]["package"] = path.endswith(
                        "__init__.py"
                    )
                    return self
                else:
                    logging.debug(
                        f"Error making request to {url}: {resp['error']}"
                    )
                    continue
            else:
                try:
                    content = _open_archive_file(self.archive, path)
                    self.modules[fullname] = {}
                    self.modules[fullname]["content"] = content
                    self.modules[fullname]["filepath"] = self.url + "#" + path
                    self.modules[fullname]["package"] = path.endswith(
                        "__init__.py"
                    )
                    return self
                except KeyError:
                    print(
                        f"Extraction of {path} from archive failed. Skipping..."
                    )
                    continue
            print(
                f"[-] Module {fullname} cannot be loaded from {self.url}. Skipping..."
            )
        # Instruct 'import' to move on to next Importer
        return None

    def _create_python_module(self, fullname, sys_modules=True):
        """Method that loads module/package code into sys.modules"""

        # If the module has not been found as loadable through 'find_module'
        # method (yet)
        if fullname not in self.modules:
            logging.debug(f"Attempting to load '{fullname}' from '{self.url}'")
            # Run 'find_module' and see if it is loadable through this Importer
            # object
            if self.find_module(fullname) is not self:
                logging.debug(
                    f"'{fullname}' has not been found as loadable. Failing..."
                )
                # Not loadable if 'find_module' returns None
                raise ImportError(
                    f"'{fullname}' cannot be loaded from '{self.url}'"
                )

        logging.debug(f"Creating Python Module object for '{fullname}'")
        mod = types.ModuleType(fullname)
        mod.__loader__ = self
        mod.__file__ = self.modules[fullname]["filepath"]
        # Set module path - get filepath and keep only the path until filename
        mod.__path__ = ["/".join(mod.__file__.split("/")[:-1]) + "/"]
        mod.__url__ = self.modules[fullname]["filepath"]
        mod.__code__ = self.modules[fullname]["content"]

        mod.__package__ = fullname

        # Populate subpackage '__package__' metadata with parent package names
        if len(fullname.split(".")[:-1]) > 1:
            # recursively find the parent package
            pkg_name = ".".join(fullname.split(".")[:-1])
            while sys.modules[pkg_name].__package__ != pkg_name:
                pkg_name = ".".join(pkg_name.split(".")[:-1])
            mod.__package__ = pkg_name

        logging.debug(
            f"Metadata (__package__) set to {mod.__package__} for %s '%s'"
            % (
                mod.__package__,
                "package" if self.modules[fullname]["package"] else "module",
                fullname,
            )
        )

        if sys_modules:
            sys.modules[fullname] = mod
            logging.debug(f"Module '{mod.__package__}' added to sys.modules")

        # Add the module/package code into the module obj
        try:
            exec(self.modules[fullname]["content"], mod.__dict__)
            logging.debug(
                f"Module '{mod.__package__}' contents added to module"
            )
        except BaseException:
            if not sys_modules:
                print(
                    f"'{fullname}' cannot be imported without adding it to sys.modules. Might contain relative imports."
                )
        return mod

    def load_module(self, fullname):
        """Method that loads the module into current Python Namespace. Part of Importer API
        Args:
            fullname (str): The name of the module/package to be loaded
        Returns:
            (object): Module object containing the executed code of the specified module/package
        """
        _ = self._create_python_module(fullname)
        return sys.modules[fullname]


def _create_content_url(url_params: dict = None):
    """Function that creates a URL to the raw code on GitHub."""

    templeter = (
        __GIST_CONTENT_URL
        if url_params.get("is_gist", False)
        else __GH_CONTENT_URL
    )
    url_params["domain"] = templeter["domain"]
    url_template = templeter["url"]
    return url_template.format(**url_params)


def create_importer(url=None, importer_class=GitHubImporter):
    """Creates an GitHubImporter object and adds it to the `sys.meta_path`.
    Returns:
      GitHubImporter: The `GitHubImporter` object added to the `sys.meta_path`
    """

    importer = importer_class(url)
    sys.meta_path.append(importer)
    return importer


def remove_importer(url):
    """Removes from the 'sys.meta_path' an GitHubImporter object given its HTTP/S URL.
    Args:
      url (str): The URL of the `GitHubImporter` object to remove
    """
    # Remove trailing '/' in case it is there
    url = url if not url.endswith("/") else url[:-1]
    for importer in sys.meta_path:
        try:
            if importer.url.startswith(url):
                sys.meta_path.remove(importer)
                return True
        except AttributeError as e:
            pass
    return False


@contextmanager
def checkout(url: str) -> None:
    """Import module/package from a repo or gist using the Context Manager to ensure that the importer is removed from sys.meta_path when done.
    Usage:
    ```
    with GithubImporter.checkout('https://github.com/username/repo'):
        import module

    # module is now available in the current namespace
    # and the importer has been removed from sys.meta_path
    ```
    """
    importer = create_importer(url=url, importer_class=GitHubImporter)
    url = importer.url
    try:
        yield
    except ImportError as e:
        raise e
    finally:
        remove_importer(url)


def load(
    module_name,
    url_or_repo=None,
) -> types.ModuleType:
    """Load a python module/package from a GitHub repository by its name and URL directly into a variable.
    Example:
    ```
    module = GithubImporter.load('module', 'https://github.com/username/repo')
    ```

    """
    importer = GitHubImporter(url_or_repo)
    try:  # Try to load the module
        return importer._create_python_module(module_name, sys_modules=False)
    except:
        raise ImportError(
            f"{module_name} cannot be imported from URL/repo: '{url_or_repo}'"
        )


def install(module_name, url_or_repo=None, force=False):
    """Install a module/package from a GitHub repository by its name and URL ."""
    if not force:
        if module_name in sys.modules:
            raise ImportError(
                f"Module {module_name} is already installed in sys.modules. Use 'force=True' to overwrite."
            )
    importer = GitHubImporter(url_or_repo)
    return importer._create_python_module(module_name, sys_modules=True)
    raise ImportError(
        f"Module {module_name} cannot be imported from URL/repo: '{url_or_repo}'"
    )


if __name__ == "__main__":
    print("This module should not be called directly!")
