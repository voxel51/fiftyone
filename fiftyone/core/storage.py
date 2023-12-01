"""
File storage utilities.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from contextlib import contextmanager
from datetime import datetime
import io
import itertools
import enum
import json
import logging
import multiprocessing.dummy
import os
import posixpath
import re
import six
import shutil
import tempfile
import threading
import urllib.parse as urlparse

import bson
import jsonlines
from wcmatch import glob
import yaml

import eta.core.serial as etase
import eta.core.storage as etast
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.media as fom
import fiftyone.core.utils as fou
import fiftyone.internal as fi
from fiftyone.internal.credentials import CloudCredentialsManager
from fiftyone.internal.util import has_encryption_key

foc = fou.lazy_import("fiftyone.core.cache")


logger = logging.getLogger(__name__)

creds_manager = None
http_client = None
available_file_systems = None
bucket_regions = {}
region_clients = {}
client_lock = threading.Lock()
client_cache = {}
minio_prefixes = set()
azure_prefixes = set()


S3_PREFIX = "s3://"
GCS_PREFIX = "gs://"
HTTP_PREFIX = "http://"
HTTPS_PREFIX = "https://"


def init_storage():
    """Initializes storage client use.

    This method may be called at any time to reinitialize storage client usage.
    """
    global creds_manager
    global available_file_systems
    global bucket_regions
    global region_clients
    global client_cache
    global minio_prefixes
    global azure_prefixes

    if has_encryption_key():
        creds_manager = CloudCredentialsManager()
    else:
        creds_manager = None

    available_file_systems = None
    bucket_regions.clear()
    region_clients.clear()

    # client cache to prevent creating new clients
    # constantly when iterating over objects with
    # the same creds requirements (i.e. bucket prefixes)
    client_cache.clear()
    minio_prefixes = set()
    azure_prefixes = set()

    minio_creds_list = []
    azure_creds_list = []

    # set up a global list of prefixes for minio and azure aliases
    if creds_manager:
        # get the paths for all minio creds
        minio_creds_path_list = creds_manager.get_all_credentials_for_provider(
            FILESYSTEM_TO_PROVIDER[FileSystem.MINIO]
        )

        # add the actual creds to the list
        for creds_path in minio_creds_path_list:
            minio_credentials, _ = MinIOStorageClient.load_credentials(
                credentials_path=creds_path
            )

            if minio_credentials:
                minio_creds_list.append(minio_credentials)

        # get the paths for all azure creds
        azure_creds_path_list = creds_manager.get_all_credentials_for_provider(
            FILESYSTEM_TO_PROVIDER[FileSystem.AZURE]
        )

        # add the actual creds to the list
        for creds_path in azure_creds_path_list:
            azure_credentials, _ = AzureStorageClient.load_credentials(
                credentials_path=creds_path
            )

            if azure_credentials:
                azure_creds_list.append(azure_credentials)
    else:
        # no creds manager, check environment

        # MINIO
        minio_credentials_path = fo.media_cache_config.minio_config_file
        minio_profile = fo.media_cache_config.minio_profile

        minio_credentials, _ = MinIOStorageClient.load_credentials(
            credentials_path=minio_credentials_path, profile=minio_profile
        )
        if minio_credentials:
            minio_creds_list = [minio_credentials]

        # AZURE
        azure_credentials_path = fo.media_cache_config.azure_credentials_file
        azure_profile = fo.media_cache_config.azure_profile

        azure_credentials, _ = AzureStorageClient.load_credentials(
            credentials_path=azure_credentials_path, profile=azure_profile
        )
        if azure_credentials:
            azure_creds_list = [azure_credentials]

    # get the prefixes from any available minio/azure creds
    if minio_creds_list:
        for credentials in minio_creds_list:
            minio_alias_prefix = None
            minio_endpoint_prefix = None

            if credentials:
                if "alias" in credentials:
                    minio_alias_prefix = credentials["alias"] + "://"

                if "endpoint_url" in credentials:
                    minio_endpoint_prefix = (
                        credentials["endpoint_url"].rstrip("/") + "/"
                    )

                minio_prefixes.add((minio_alias_prefix, minio_endpoint_prefix))

    if azure_creds_list:
        for credentials in azure_creds_list:
            azure_alias_prefix = None
            azure_endpoint_prefix = None

            if credentials:
                if "alias" in credentials:
                    azure_alias_prefix = credentials["alias"] + "://"

                if "account_url" in credentials:
                    azure_endpoint_prefix = (
                        credentials["account_url"].rstrip("/") + "/"
                    )
                elif (
                    "conn_str" in credentials or "account_name" in credentials
                ):
                    account_url = AzureStorageClient._to_account_url(
                        conn_str=credentials.get("conn_str", None),
                        account_name=credentials.get("account_name", None),
                    )
                    azure_endpoint_prefix = account_url.rstrip("/") + "/"

                azure_prefixes.add((azure_alias_prefix, azure_endpoint_prefix))


class FileSystem(object):
    """Enumeration of the available file systems."""

    S3 = "s3"
    GCS = "gcs"
    AZURE = "azure"
    MINIO = "minio"
    HTTP = "http"
    LOCAL = "local"


FILESYSTEM_TO_PROVIDER = {
    FileSystem.S3: "AWS",
    FileSystem.GCS: "GCP",
    FileSystem.AZURE: "AZURE",
    FileSystem.MINIO: "MINIO",
}

_FILE_SYSTEMS_WITH_BUCKETS = [
    FileSystem.S3,
    FileSystem.GCS,
    FileSystem.AZURE,
    FileSystem.MINIO,
]
_FILE_SYSTEMS_WITH_REGIONAL_CLIENTS = {FileSystem.S3, FileSystem.MINIO}
_UNKNOWN_REGION = "unknown"


class S3StorageClient(etast.S3StorageClient):
    """.. autoclass:: eta.core.storage.S3StorageClient"""

    def get_local_path(self, remote_path):
        return self._strip_prefix(remote_path)


class GoogleCloudStorageClient(etast.GoogleCloudStorageClient):
    """.. autoclass:: eta.core.storage.GoogleCloudStorageClient"""

    def get_local_path(self, remote_path):
        return self._strip_prefix(remote_path)


class AzureStorageClient(etast.AzureStorageClient):
    """.. autoclass:: eta.core.storage.AzureStorageClient"""

    def get_local_path(self, remote_path):
        return self._strip_prefix(remote_path)


class MinIOStorageClient(etast.MinIOStorageClient):
    """.. autoclass:: eta.core.storage.MinIOStorageClient"""

    def get_local_path(self, remote_path):
        return self._strip_prefix(remote_path)


class HTTPStorageClient(etast.HTTPStorageClient):
    """.. autoclass:: eta.core.storage.HTTPStorageClient"""

    def get_local_path(self, remote_path):
        p = urlparse.urlparse(remote_path)

        if p.port is not None:
            host = "%s:%d" % (p.hostname, p.port)
        else:
            host = p.hostname

        return os.path.join(host, *p.path.lstrip("/").split("/"))


def get_file_system(path):
    """Returns the file system enum for the given path.

    Args:
        path: a path

    Returns:
        a :class:`FileSystem` value
    """
    if not path:
        return FileSystem.LOCAL

    # Check MinIO and Azure first in case alias/endpoint clashes with another
    # file system

    # if any of the returned aliases match and the path starts with it, then we found it!
    # prefix set is (minio_alias_prefix, minio_endpoint_prefix)
    for prefix_set in minio_prefixes:
        minio_alias_prefix = prefix_set[0]
        minio_endpoint_prefix = prefix_set[1]
        if (minio_alias_prefix is not None and minio_alias_prefix in path) or (
            minio_endpoint_prefix is not None and minio_endpoint_prefix in path
        ):
            return FileSystem.MINIO

    for prefix_set in azure_prefixes:
        azure_alias_prefix = prefix_set[0]
        azure_endpoint_prefix = prefix_set[1]
        if (azure_alias_prefix is not None and azure_alias_prefix in path) or (
            azure_endpoint_prefix is not None and azure_endpoint_prefix in path
        ):
            return FileSystem.AZURE

    if path.startswith(S3_PREFIX):
        return FileSystem.S3

    if path.startswith(GCS_PREFIX):
        return FileSystem.GCS

    if path.startswith((HTTP_PREFIX, HTTPS_PREFIX)):
        return FileSystem.HTTP

    return FileSystem.LOCAL


def list_available_file_systems():
    """Lists the file systems that are currently available for use with methods
    like :func:`list_files` and :func:`list_buckets`.

    Returns:
        a list of :class:`FileSystem` values
    """
    global available_file_systems

    if available_file_systems is None:
        available_file_systems = _get_available_file_systems()

    return available_file_systems


def _get_available_file_systems():
    file_systems = set()

    if not fi.is_internal_service():
        file_systems.add(FileSystem.LOCAL)

    for fs in _FILE_SYSTEMS_WITH_BUCKETS:
        clients = _get_all_clients_for_fs(fs)
        if clients:
            file_systems.add(fs)

    return list(file_systems)


def _get_all_clients_for_fs(fs):
    # check the cache first
    clients = []
    for client_key in client_cache:
        if client_key.startswith(FILESYSTEM_TO_PROVIDER[fs]):
            clients.append(client_cache[client_key])

    # check the available creds to see if we can make clients out of them
    if fs == FileSystem.S3:
        _local_client_list = []

        if creds_manager:
            creds_file_list = creds_manager.get_all_credentials_for_provider(
                FILESYSTEM_TO_PROVIDER[fs]
            )
            for creds_file in creds_file_list:

                credentials, _ = S3StorageClient.load_credentials(
                    credentials_path=creds_file, profile=None
                )

                _local_client_list.append(
                    S3StorageClient(credentials=credentials)
                )

            for client in _local_client_list:
                clients.append(client)

        # creds manager is not present, so we load from env
        else:
            credentials_path = fo.media_cache_config.aws_config_file
            profile = fo.media_cache_config.aws_profile
            credentials, _ = S3StorageClient.load_credentials(
                credentials_path=credentials_path, profile=profile
            )
            if credentials:
                client = S3StorageClient(credentials=credentials)
                clients.append(client)

        return clients

    elif fs == FileSystem.GCS:
        _local_client_list = []

        if creds_manager:
            creds_file_list = creds_manager.get_all_credentials_for_provider(
                FILESYSTEM_TO_PROVIDER[fs]
            )
            for creds_file in creds_file_list:
                credentials, _ = GoogleCloudStorageClient.load_credentials(
                    credentials_path=creds_file
                )

                _local_client_list.append(
                    GoogleCloudStorageClient(credentials=credentials)
                )

            for client in _local_client_list:
                clients.append(client)

        # creds manager is not present, so we load from env
        else:
            credentials_path = (
                fo.media_cache_config.google_application_credentials
            )
            credentials, _ = GoogleCloudStorageClient.load_credentials(
                credentials_path=credentials_path
            )
            if credentials:
                client = GoogleCloudStorageClient(credentials=credentials)
                clients.append(client)

        return clients

    elif fs == FileSystem.AZURE:
        _local_client_prefix_dict = {}

        if creds_manager:
            creds_file_list = creds_manager.get_all_credentials_for_provider(
                FILESYSTEM_TO_PROVIDER[fs]
            )
            for creds_file in creds_file_list:
                credentials, _ = AzureStorageClient.load_credentials(
                    credentials_path=creds_file, profile=None
                )

                azure_alias_prefix = None
                azure_endpoint_prefix = None

                if "alias" in credentials:
                    azure_alias_prefix = credentials["alias"] + "://"

                if "account_url" in credentials:
                    azure_endpoint_prefix = (
                        credentials["account_url"].rstrip("/") + "/"
                    )
                elif (
                    "conn_str" in credentials or "account_name" in credentials
                ):
                    account_url = AzureStorageClient._to_account_url(
                        conn_str=credentials.get("conn_str", None),
                        account_name=credentials.get("account_name", None),
                    )
                    azure_endpoint_prefix = account_url.rstrip("/") + "/"

                _local_client_prefix_dict[
                    AzureStorageClient(credentials=credentials)
                ] = (azure_alias_prefix, azure_endpoint_prefix)

            for client_set in _local_client_prefix_dict.items():
                client = client_set[0]
                clients.append(client)

        else:
            credentials_path = fo.media_cache_config.azure_credentials_file
            profile = fo.media_cache_config.azure_profile

            credentials, _ = AzureStorageClient.load_credentials(
                credentials_path=credentials_path, profile=profile
            )

            if credentials:
                azure_alias_prefix = None
                azure_endpoint_prefix = None

                if "alias" in credentials:
                    azure_alias_prefix = credentials["alias"] + "://"

                if "account_url" in credentials:
                    azure_endpoint_prefix = (
                        credentials["account_url"].rstrip("/") + "/"
                    )
                elif (
                    "conn_str" in credentials or "account_name" in credentials
                ):
                    account_url = AzureStorageClient._to_account_url(
                        conn_str=credentials.get("conn_str", None),
                        account_name=credentials.get("account_name", None),
                    )
                    azure_endpoint_prefix = account_url.rstrip("/") + "/"

                client = AzureStorageClient(credentials=credentials)
                clients.append(client)

        return clients

    elif fs == FileSystem.MINIO:
        _local_client_prefix_dict = {}

        if creds_manager:
            creds_file_list = creds_manager.get_all_credentials_for_provider(
                FILESYSTEM_TO_PROVIDER[fs]
            )
            for creds_file in creds_file_list:
                credentials, _ = MinIOStorageClient.load_credentials(
                    credentials_path=creds_file, profile=None
                )

                minio_alias_prefix = None
                minio_endpoint_prefix = None

                if "alias" in credentials:
                    minio_alias_prefix = credentials["alias"] + "://"

                if "endpoint_url" in credentials:
                    minio_endpoint_prefix = (
                        credentials["endpoint_url"].rstrip("/") + "/"
                    )

                _local_client_prefix_dict[
                    MinIOStorageClient(credentials=credentials)
                ] = (minio_alias_prefix, minio_endpoint_prefix)

            for client_set in _local_client_prefix_dict.items():
                client = client_set[0]
                clients.append(client)

        else:
            credentials_path = fo.media_cache_config.minio_config_file
            profile = fo.media_cache_config.minio_profile

            credentials, _ = MinIOStorageClient.load_credentials(
                credentials_path=credentials_path, profile=profile
            )

            if credentials:
                minio_alias_prefix = None
                minio_endpoint_prefix = None

                if "alias" in credentials:
                    minio_alias_prefix = credentials["alias"] + "://"

                if "endpoint_url" in credentials:
                    minio_endpoint_prefix = (
                        credentials["endpoint_url"].rstrip("/") + "/"
                    )

                client = MinIOStorageClient(credentials=credentials)
                clients.append(client)

        return clients

    else:
        # if we didn't match any of those, return whatever was in the cache
        return clients


def split_prefix(path):
    """Splits the file system prefix from the given path.

    The prefix for local paths is ``""``.

    Example usages::

        import fiftyone.core.storage as fos

        fos.split_prefix("s3://bucket/object")  # ('s3://', 'bucket/object')
        fos.split_prefix("gs://bucket/object")  # ('g3://', 'bucket/object')
        fos.split_prefix("/path/to/file")       # ('', '/path/to/file')
        fos.split_prefix("a/file")              # ('', 'a/file')

    Args:
        path: a path

    Returns:
        a ``(prefix, path)`` tuple
    """
    # Check MinIO and Azure first in case alias/endpoint clashes with another
    # file system

    for prefix_set in minio_prefixes:
        minio_alias_prefix = prefix_set[0]
        minio_endpoint_prefix = prefix_set[1]
        prefix = None
        if minio_alias_prefix is not None and minio_alias_prefix in path:
            prefix = minio_alias_prefix
        elif (
            minio_endpoint_prefix is not None and minio_endpoint_prefix in path
        ):
            prefix = minio_endpoint_prefix

        if prefix is not None:
            return prefix, path[len(prefix) :]

    for prefix_set in azure_prefixes:
        azure_alias_prefix = prefix_set[0]
        azure_endpoint_prefix = prefix_set[1]
        prefix = None
        if azure_alias_prefix is not None and azure_alias_prefix in path:
            prefix = azure_alias_prefix
        elif (
            azure_endpoint_prefix is not None and azure_endpoint_prefix in path
        ):
            prefix = azure_endpoint_prefix

        if prefix is not None:
            return prefix, path[len(prefix) :]

    if path.startswith(S3_PREFIX):
        prefix = S3_PREFIX
    elif path.startswith(GCS_PREFIX):
        prefix = GCS_PREFIX
    elif path.startswith(HTTP_PREFIX):
        prefix = HTTP_PREFIX
    elif path.startswith(HTTPS_PREFIX):
        prefix = HTTPS_PREFIX
    else:
        prefix = ""

    return prefix, path[len(prefix) :]


def get_bucket_name(path):
    """Gets the bucket name from the given path.

    The bucket name for local paths and http(s) paths is ``""``.

    Example usages::

        import fiftyone.core.storage as fos

        fos.get_bucket_name("s3://bucket/object")  # 'bucket'
        fos.get_bucket_name("gs://bucket/object")  # 'bucket'
        fos.get_bucket_name("/path/to/file")       # ''
        fos.get_bucket_name("a/file")              # ''

    Args:
        path: a path

    Returns:
        the bucket name string
    """
    fs = get_file_system(path)
    if fs not in _FILE_SYSTEMS_WITH_BUCKETS:
        return ""

    path = split_prefix(path)[1]
    return path.split("/")[0]


def is_local(path):
    """Determines whether the given path is local.

    Args:
        path: a path

    Returns:
        True/False
    """
    return get_file_system(path) == FileSystem.LOCAL


def ensure_local(path):
    """Ensures that the given path is local.

    Args:
        path: a path
    """
    if not is_local(path):
        raise ValueError(
            "The requested operation requires a local path, but found '%s'"
            % path
        )


def normalize_path(path):
    """Normalizes the given path.

    Local paths are sanitized via::

        os.path.abspath(os.path.expanduser(path))

    Remote paths are sanitized via::

        path.rstrip("/")

    Args:
        path: a path

    Returns:
        the normalized path
    """
    if is_local(path):
        return os.path.abspath(os.path.expanduser(path))

    return path.rstrip("/")


def get_client(fs=None, path=None):
    """Returns the storage client for the given file system or path.

    If a ``path`` is provided, a region-specific client is returned, if
    applicable. Otherwise, the client for the given file system is returned.

    Args:
        fs (None): a :class:`FileSystem` value
        path (None): a path

    Returns:
        a :class:`eta.core.storage.StorageClient`

    Raises:
        ValueError: if no suitable client could be constructed
    """
    # Client creation may not be thread-safe, so we lock for safety
    # https://stackoverflow.com/a/61943955/16823653
    with client_lock:
        return _get_client(fs=fs, path=path)


def get_url(path, **kwargs):
    """Returns a public URL for the given file.

    The provided path must either already be a URL or a path into a file system
    that supports signed URLs.

    Args:
        path: a path
        **kwargs: optional keyword arguments for the storage client's
            ``generate_signed_url(path, **kwargs)`` method

    Returns:
        a URL
    """
    fs = get_file_system(path)

    if fs == FileSystem.HTTP:
        return path

    client = get_client(path=path)

    if not hasattr(client, "generate_signed_url"):
        raise ValueError(
            "Cannot get URL for '%s'; file system '%s' does not support "
            "signed URLs" % (path, fs)
        )

    return client.generate_signed_url(path, **kwargs)


def to_readable(path, **kwargs):
    """Returns a publicly readable path for the given file.

    The provided path must either already be a URL or be a remote path into a
    file system that supports signed URLs.

    Args:
        path: a path
        **kwargs: optional keyword arguments for the storage client's
            ``generate_signed_url(path, **kwargs)`` method

    Returns:
        a public path
    """
    if is_local(path):
        return path

    return get_url(path, method="GET", **kwargs)


def to_writeable(path, **kwargs):
    """Returns a publicly writable path for the given file.

    The provided path must either already be a URL or be a remote path into a
    file system that supports signed URLs.

    Args:
        path: a path
        **kwargs: optional keyword arguments for the storage client's
            ``generate_signed_url(path, **kwargs)`` method

    Returns:
        a public path
    """
    if is_local(path):
        return path

    params = dict(method="PUT", content_type=etau.guess_mime_type(path))
    params.update(kwargs)

    return get_url(path, **params)


def make_temp_dir(basedir=None):
    """Makes a temporary directory.

    Args:
        basedir (None): an optional local or remote directory in which to
            create the new directory. The default is
            ``fiftyone.config.default_dataset_dir``

    Returns:
        the temporary directory path
    """
    if basedir is None:
        basedir = fo.config.default_dataset_dir

    if is_local(basedir):
        ensure_dir(basedir)
        return tempfile.mkdtemp(dir=basedir)

    return join(basedir, str(bson.ObjectId()))


class TempDir(object):
    """Context manager that creates and destroys a temporary directory.

    Args:
        basedir (None): an optional local or remote directory in which to
            create the new directory. The default is
            ``fiftyone.config.default_dataset_dir``
    """

    def __init__(self, basedir=None):
        self._basedir = basedir
        self._name = None

    def __enter__(self):
        self._name = make_temp_dir(basedir=self._basedir)
        return self._name

    def __exit__(self, *args):
        delete_dir(self._name)


class LocalDir(object):
    """Context manager that allows remote directory paths to be processed as
    local directory paths that can be passed to methods that don't natively
    support reading/writing remote locations.

    When a local directory is provided to this context manager, it is simply
    returned when the context is entered and no other operations are performed.

    When a remote directory is provided, a temporary local directory is
    returned when the context is entered, which is automatically deleted when
    the context exits. In addition:

    -   When ``mode == "r"``, the remote directory's contents is downloaded
        when the context is entered
    -   When ``mode == "w"``, the local directory's contents is uploaded to the
        remote directory when the context exits

    Example usage::

        import os

        import fiftyone.core.storage as fos

        with fos.LocalDir("s3://bucket/dir", "w") as local_dir:
            with open(os.path.join(local_dir, "file1.txt")) as f:
                f.write("Hello, world!")

            with open(os.path.join(local_dir, "file2.txt")) as f:
                f.write("Goodbye")

        with fos.LocalDir("s3://bucket/dir", "r") as local_dir:
            with open(os.path.join(local_dir, "file1.txt")) as f:
                print(f.read())

            with open(os.path.join(local_dir, "file2.txt")) as f:
                print(f.read())

    Args:
        path: a directory path
        mode ("r"): the mode. Supported values are ``("r", "w")``
        basedir (None): an optional directory in which to create temporary
            local directories
        skip_failures (False): whether to gracefully continue without raising
            an error if a remote upload/download fails
        type_str ("files"): the type of file being processed. Used only for
            log messages. If None/empty, nothing will be logged
        quiet (None): whether to display (False) or not display (True) a
            progress bar tracking the status of any uploads/downloads. By
            default, ``fiftyone.config.show_progress_bars`` is used to set this
    """

    def __init__(
        self,
        path,
        mode="r",
        basedir=None,
        skip_failures=False,
        type_str="files",
        quiet=None,
    ):
        if mode not in ("r", "w"):
            raise ValueError("Unsupported mode '%s'" % mode)

        if basedir is not None and not is_local(basedir):
            raise ValueError("basedir must be local; found '%s'" % basedir)

        self._path = path
        self._mode = mode
        self._basedir = basedir
        self._skip_failures = skip_failures
        self._type_str = type_str
        self._quiet = quiet
        self._tmpdir = None

    @property
    def quiet(self):
        """Whether this object will log the status of any uploads/downloads."""
        return _parse_quiet(self._quiet)

    def __enter__(self):
        if is_local(self._path):
            return self._path

        self._tmpdir = make_temp_dir(basedir=self._basedir)

        if self._mode == "r":
            progress = not self.quiet

            if progress and self._type_str:
                logger.info("Downloading %s...", self._type_str)

            copy_dir(
                self._path,
                self._tmpdir,
                overwrite=False,
                skip_failures=self._skip_failures,
                progress=progress,
            )

        return self._tmpdir

    def __exit__(self, *args):
        if self._tmpdir is None:
            return

        try:
            if self._mode == "w":
                progress = not self.quiet

                if progress and self._type_str:
                    logger.info("Uploading %s...", self._type_str)

                copy_dir(
                    self._tmpdir,
                    self._path,
                    overwrite=False,
                    skip_failures=self._skip_failures,
                    progress=progress,
                )
        finally:
            etau.delete_dir(self._tmpdir)


class LocalFile(object):
    """Context manager that allows remote filepaths to be processed as local
    filepaths that can be passed to methods that don't natively support
    reading/writing remote locations.

    When a local filepath is provided to this context manager, it is simply
    returned when the context is entered and no other operations are performed.

    When a remote filepath is provided, a temporary local filepath is returned
    when the context is entered, which is automatically deleted when the
    context exits. In addition:

    -   When ``mode == "r"``, the remote file is downloaded when the context is
        entered
    -   When ``mode == "w"``, the local file is uploaded to the remote filepath
        when the context exits

    Example usage::

        import fiftyone.core.storage as fos

        with fos.LocalFile("s3://bucket/file.txt", "w") as local_path:
            with open(local_path, "w") as f:
                f.write("Hello, world!")

        with fos.LocalFile("s3://bucket/file.txt", "r") as local_path:
            with open(local_path, "r") as f:
                print(r.read())

    Args:
        path: a filepath
        mode ("r"): the mode. Supported values are ``("r", "w")``
        basedir (None): an optional directory in which to create temporary
            local files
    """

    def __init__(self, path, mode="r", basedir=None):
        if mode not in ("r", "w"):
            raise ValueError("Unsupported mode '%s'" % mode)

        if basedir is not None and not is_local(basedir):
            raise ValueError("basedir must be local; found '%s'" % basedir)

        self._path = path
        self._mode = mode
        self._basedir = basedir
        self._local_path = None
        self._tmpdir = None

    def __enter__(self):
        if is_local(self._path):
            return self._path

        self._tmpdir = make_temp_dir(basedir=self._basedir)
        self._local_path = os.path.join(
            self._tmpdir, os.path.basename(self._path)
        )

        if self._mode == "r":
            copy_file(self._path, self._local_path)

        return self._local_path

    def __exit__(self, *args):
        if self._tmpdir is None:
            return

        try:
            if self._mode == "w":
                copy_file(self._local_path, self._path)
        finally:
            etau.delete_dir(self._tmpdir)


class LocalFiles(object):
    """Context manager that allows lists of remote filepaths to be processed as
    local filepaths that can be passed to methods that don't natively support
    reading/writing remote locations.

    When local filepaths are provided to this context manager, they are simply
    returned when the context is entered and no other operations are performed.

    When remote filepaths are provided, temporary local filepaths are returned
    when the context is entered, which are automatically deleted when the
    context exits. In addition:

    -   When ``mode == "r"``, remote files are downloaded when the context is
        entered
    -   When ``mode == "w"``, local files are uploaded to their corresponding
        remote filepaths when the context exits

    Example usage::

        import fiftyone.core.storage as fos

        remote_paths = [
            "s3://bucket/file1.txt",
            "s3://bucket/file2.txt",
        ]

        with fos.LocalFiles(remote_paths, "w") as local_paths:
            for local_path in local_paths:
                with open(local_path, "w") as f:
                    f.write("Hello, world!")

        with fos.LocalFiles(remote_paths, "r") as local_paths:
            for local_path in local_paths:
                with open(local_path, "r") as f:
                    print(r.read())

    Args:
        paths: a list of filepaths, or a dict mapping keys to filepaths
        mode ("r"): the mode. Supported values are ``("r", "w", "rw")``
        basedir (None): an optional directory in which to create temporary
            local files
        skip_failures (False): whether to gracefully continue without raising
            an error if a remote upload/download fails
        type_str ("files"): the type of file being processed. Used only for
            log messages. If None/empty, nothing will be logged
        quiet (None): whether to display (False) or not display (True) a
            progress bar tracking the status of any uploads/downloads. By
            default, ``fiftyone.config.show_progress_bars`` is used to set this
    """

    def __init__(
        self,
        paths,
        mode="r",
        basedir=None,
        skip_failures=False,
        type_str="files",
        quiet=None,
    ):
        if not set(mode).issubset("rw"):
            raise ValueError("Unsupported mode '%s'" % mode)

        if basedir is not None and not is_local(basedir):
            raise ValueError("basedir must be local; found '%s'" % basedir)

        self._paths = paths
        self._mode = mode
        self._basedir = basedir
        self._skip_failures = skip_failures
        self._type_str = type_str
        self._quiet = quiet
        self._tmpdir = None
        self._filename_maker = None
        self._local_paths = None
        self._remote_paths = None

    @property
    def quiet(self):
        """Whether this object will log the status of any uploads/downloads."""
        return _parse_quiet(self._quiet)

    def __enter__(self):
        local_paths = []
        remote_paths = []

        is_dict = isinstance(self._paths, dict)

        if is_dict:
            iter_paths = self._paths.items()
            _paths = {}
        else:
            iter_paths = self._paths
            _paths = []

        for path in iter_paths:
            if is_dict:
                key, path = path

            if not is_local(path):
                if self._tmpdir is None:
                    self._tmpdir = make_temp_dir(basedir=self._basedir)
                    self._filename_maker = fou.UniqueFilenameMaker()

                local_name = self._filename_maker.get_output_path(path)
                local_path = os.path.join(self._tmpdir, local_name)

                local_paths.append(local_path)
                remote_paths.append(path)
                path = local_path

            if is_dict:
                _paths[key] = path
            else:
                _paths.append(path)

        self._local_paths = local_paths
        self._remote_paths = remote_paths

        if "r" in self._mode and self._remote_paths:
            progress = not self.quiet

            if progress and self._type_str:
                logger.info("Downloading %s...", self._type_str)

            copy_files(
                self._remote_paths,
                self._local_paths,
                skip_failures=self._skip_failures,
                progress=progress,
            )

        return _paths

    def __exit__(self, *args):
        if self._tmpdir is None:
            return

        try:
            if "w" in self._mode and self._local_paths:
                progress = not self.quiet

                if progress and self._type_str:
                    logger.info("Uploading %s...", self._type_str)

                copy_files(
                    self._local_paths,
                    self._remote_paths,
                    skip_failures=self._skip_failures,
                    progress=progress,
                )
        finally:
            etau.delete_dir(self._tmpdir)


class DeleteFiles(object):
    """Context manager for efficiently deleting local or remote files.

    When local filepaths are provided to this context manager, they are
    immediately deleted.

    When remote filepaths are provided, they are efficiently deleted in a batch
    when the context exits.

    Example usage::

        import fiftyone.core.storage as fos

        remote_paths = [
            "s3://bucket/file1.txt",
            "s3://bucket/file2.txt",
        ]

        with fos.DeleteFiles() as df:
            for remote_path in remote_paths:
                df.delete(remote_path)

    Args:
        skip_failures (False): whether to gracefully continue without raising
            an error if a remote deletion fails
        type_str ("files"): the type of file being deleted. Used only for log
            messages. If None/empty, nothing will be logged
        quiet (None): whether to display (False) or not display (True) a
            progress bar tracking the status of any uploads. By default,
            ``fiftyone.config.show_progress_bars`` is used to set this
    """

    def __init__(self, skip_failures=False, type_str="files", quiet=None):
        self._skip_failures = skip_failures
        self._type_str = type_str
        self._quiet = quiet
        self._delpaths = None

    @property
    def quiet(self):
        """Whether this instance will log the status of any deletions."""
        return _parse_quiet(self._quiet)

    def delete(self, path):
        """Deletes the given file.

        Args:
            path: the filepath
        """
        if is_local(path):
            etau.delete_file(path)
        else:
            self._delpaths.append(path)

    def __enter__(self):
        self._delpaths = []
        return self

    def __exit__(self, *args):
        if self._delpaths:
            progress = not self.quiet

            if progress and self._type_str:
                logger.info("Uploading %s...", self._type_str)

            delete_files(
                self._delpaths,
                skip_failures=self._skip_failures,
                progress=progress,
            )


class FileWriter(object):
    """Context manager that allows writing remote files to disk locally first
    so that they can be efficiently uploaded to the remote destination in a
    batch.

    When local filepaths are provided to this context manager, they are simply
    returned verbatim.

    When remote filepaths are provided, temporary local filepaths are returned,
    which are then uploaded to their corresponding remote filepaths and then
    cleaned up when the context exits.

    Example usage::

        import fiftyone.core.storage as fos

        remote_paths = [
            "s3://bucket/file1.txt",
            "s3://bucket/file2.txt",
        ]

        with fos.FileWriter() as writer:
            for remote_path in remote_paths:
                local_path = writer.get_local_path(remote_path)
                with open(local_path, "w") as f:
                    f.write("Hello, world!")

    Args:
        basedir (None): an optional directory in which to create temporary
            local files
        skip_failures (False): whether to gracefully continue without raising
            an error if a remote upload fails
        type_str ("files"): the type of file being processed. Used only for
            log messages. If None/empty, nothing will be logged
        quiet (None): whether to display (False) or not display (True) a
            progress bar tracking the status of any uploads. By default,
            ``fiftyone.config.show_progress_bars`` is used to set this
    """

    def __init__(
        self, basedir=None, skip_failures=False, type_str="files", quiet=None
    ):
        if basedir is not None and not is_local(basedir):
            raise ValueError("basedir must be local; found '%s'" % basedir)

        self._basedir = basedir
        self._skip_failures = skip_failures
        self._type_str = type_str
        self._quiet = quiet
        self._tmpdir = None
        self._filename_maker = None
        self._inpaths = None
        self._outpaths = None

    @property
    def quiet(self):
        """Whether this writer will log the status of any uploads."""
        return _parse_quiet(self._quiet)

    def __enter__(self):
        self._tmpdir = None
        self._filename_maker = None
        self._inpaths = []
        self._outpaths = []
        return self

    def __exit__(self, *args):
        try:
            if self._inpaths:
                progress = not self.quiet

                if progress and self._type_str:
                    logger.info("Uploading %s...", self._type_str)

                copy_files(
                    self._inpaths,
                    self._outpaths,
                    skip_failures=self._skip_failures,
                    progress=progress,
                )
        finally:
            if self._tmpdir is not None:
                etau.delete_dir(self._tmpdir)

    def get_local_path(self, filepath):
        """Returns a local path on disk to write the given file.

        If the provided path is local, it is directly returned. If the path is
        remote, a temporary local path is returned.

        Args:
            filepath: a filepath

        Returns:
            the local filepath
        """
        if is_local(filepath):
            return filepath

        if self._tmpdir is None:
            self._tmpdir = make_temp_dir(basedir=self._basedir)
            self._filename_maker = fou.UniqueFilenameMaker()

        local_name = self._filename_maker.get_output_path(filepath)
        local_path = os.path.join(self._tmpdir, local_name)

        self._inpaths.append(local_path)
        self._outpaths.append(filepath)

        return local_path

    def get_local_paths(self, filepaths):
        """Returns local paths on disk for a list of filepaths.

        See :meth:`get_local_path` for details.

        Args:
            filepaths: a list of filepaths

        Returns:
            a list of local paths
        """
        return [self.get_local_path(p) for p in filepaths]

    def register_local_path(self, filepath, local_path):
        """Registers the local path for the given filepath.

        If the provided ``filepath`` is remote, it will be populated from the
        ``local_path`` you provide in the exit context's upload.

        If the provided ``filepath`` is local, this method has no effect.

        Args:
            filepath: a filepath
            local_path: a corresponding local path
        """
        if is_local(filepath):
            return

        self._inpaths.append(local_path)
        self._outpaths.append(filepath)

    def register_local_paths(self, filepaths, local_paths):
        """Registers the local paths for the given filepaths.

        Any remote paths in ``filepaths`` will be populated from the
        corresponding ``local_paths`` in the exit context's upload.

        Any local filepaths in ``filepaths`` are skipped.

        Args:
            filepaths: a list of filepaths
            local_paths: a list of corresponding local paths
        """
        for filepath, local_path in zip(filepaths, local_paths):
            self.register_local_path(filepath, local_path)


@contextmanager
def open_file(path, mode="r"):
    """Opens the given file for reading or writing.

    This function *must* be used as a context manager, and it assumes that any
    cloud files being read/written can fit into RAM.

    Example usage::

        import fiftyone.core.storage as fos

        with fos.open_file("/tmp/file.txt", "w") as f:
            f.write("Hello, world!")

        with fos.open_file("s3://tmp/file.txt", "w") as f:
            f.write("Hello, world!")

        with fos.open_file("/tmp/file.txt", "r") as f:
            print(f.read())

        with fos.open_file("s3://tmp/file.txt", "r") as f:
            print(f.read())

    Args:
        path: the path
        mode ("r"): the mode. Supported values are ``("r", "rb", "w", "wb")``
    """
    if is_local(path):
        f = open(path, mode)

        try:
            yield f
        finally:
            f.close()

        return

    client = get_client(path=path)
    is_writing = mode in ("w", "wb")

    if mode == "r":
        b = client.download_bytes(path)
        f = io.StringIO(b.decode())
    elif mode == "rb":
        f = io.BytesIO()
        client.download_stream(path, f)
    elif is_writing:
        f = _BytesIO()
    else:
        raise ValueError("Unsupported mode '%s'" % mode)

    f.seek(0)

    try:
        yield f
    finally:
        if not is_writing:
            f.close()

    if not is_writing:
        return

    f.seek(0)
    content_type = etau.guess_mime_type(path)

    try:
        client.upload_stream(f, path, content_type=content_type)
    finally:
        f.close()


def read_file(path, binary=False):
    """Reads the file.

    Args:
        path: the filepath
        binary (False): whether to read the file in binary mode

    Returns:
        the file contents
    """
    mode = "rb" if binary else "r"
    with open_file(path, mode) as f:
        return f.read()


def write_file(str_or_bytes, path):
    """Writes the given string/bytes to a file.

    If a string is provided, it is encoded via ``.encode()``.

    Args:
        str_or_bytes: the string or bytes
        path: the filepath
    """
    ensure_basedir(path)
    with open_file(path, "wb") as f:
        f.write(_to_bytes(str_or_bytes))


def sep(path):
    """Returns the path separator for the given path.

    For local paths, ``os.path.sep`` is returned.

    For remote paths, ``"/"`` is returned.

    Args:
        path: the filepath

    Returns:
        the path separator
    """
    if is_local(path):
        return os.path.sep

    return "/"


def join(a, *p):
    """Joins the given path components into a single path.

    Args:
        a: the root
        *p: additional path components

    Returns:
        the joined path
    """
    if is_local(a):
        return os.path.join(a, *p)

    return posixpath.join(a, *p)


def isabs(path):
    """Determines whether the given path is absolute.

    Remote paths are always considered absolute.

    Args:
        path: the filepath

    Returns:
        True/False
    """
    if is_local(path):
        return os.path.isabs(path)

    return True


def abspath(path):
    """Converts the given path to an absolute path.

    Remote paths are returned unchanged.

    Args:
        path: the filepath

    Returns:
        the absolute path
    """
    if is_local(path):
        return os.path.abspath(path)

    return path


def normpath(path):
    """Normalizes the given filepath.

    Args:
        path: the filepath

    Returns:
        the normalized path
    """
    if is_local(path):
        return os.path.normpath(path)

    prefix, path = split_prefix(path)

    return prefix + posixpath.normpath(path.replace("\\", "/"))


def exists(path):
    """Determines whether the given file or directory exists.

    Args:
        path: the file or directory path

    Returns:
        True/False
    """
    if is_local(path):
        return os.path.exists(path)

    client = get_client(path=path)

    if os.path.splitext(path)[1]:
        return client.is_file(path)

    return client.is_folder(path)


def isfile(path):
    """Determines whether the given file exists.

    Args:
        path: the filepath

    Returns:
        True/False
    """
    if is_local(path):
        return os.path.isfile(path)

    client = get_client(path=path)
    return client.is_file(path)


def isdir(dirpath):
    """Determines whether the given directory exists.

    Cloud "folders" are deemed to exist only if they are non-empty.

    Args:
        dirpath: the directory path

    Returns:
        True/False
    """
    if is_local(dirpath):
        return os.path.isdir(dirpath)

    client = get_client(path=dirpath)
    return client.is_folder(dirpath)


def make_archive(dirpath, archive_path, cleanup=False):
    """Makes an archive containing the given directory.

    Supported formats include ``.zip``, ``.tar``, ``.tar.gz``, ``.tgz``,
    ``.tar.bz`` and ``.tbz``.

    Args:
        dirpath: the directory to archive
        archive_path: the archive path to write
        cleanup (False): whether to delete the directory after archiving it
    """
    with LocalDir(dirpath, "r", type_str=None) as local_dir:
        with LocalFile(archive_path, "w") as local_path:
            logger.info("Making archive...")
            etau.make_archive(local_dir, local_path)

    if cleanup:
        delete_dir(dirpath)


def extract_archive(archive_path, outdir=None, cleanup=False):
    """Extracts the contents of an archive.

    The following formats are guaranteed to work:
    ``.zip``, ``.tar``, ``.tar.gz``, ``.tgz``, ``.tar.bz``, ``.tbz``.

    If an archive *not* in the above list is found, extraction will be
    attempted via the ``patool`` package, which supports many formats but may
    require that additional system packages be installed.

    Args:
        archive_path: the archive path
        outdir (None): the directory into which to extract the archive. By
            default, the directory containing the archive is used
        cleanup (False): whether to delete the archive after extraction
    """
    if outdir is None:
        outdir = os.path.dirname(archive_path) or "."

    with LocalFile(archive_path, "r") as local_path:
        with LocalDir(outdir, "w", type_str=None) as local_dir:
            logger.info("Extracting archive...")
            etau.extract_archive(local_path, outdir=local_dir)

    if cleanup:
        delete_file(archive_path)


def ensure_empty_dir(dirpath, cleanup=False):
    """Ensures that the given directory exists and is empty.

    Args:
        dirpath: the directory path
        cleanup (False): whether to delete any existing directory contents

    Raises:
        ValueError: if the directory is not empty and ``cleanup`` is False
    """
    if is_local(dirpath):
        etau.ensure_empty_dir(dirpath, cleanup=cleanup)
        return

    client = get_client(path=dirpath)

    if cleanup:
        client.delete_folder(dirpath)
    elif client.list_files_in_folder(dirpath):
        raise ValueError("'%s' is not empty" % dirpath)


def ensure_basedir(path):
    """Makes the base directory of the given path, if necessary.

    Args:
        path: the filepath
    """
    if is_local(path):
        etau.ensure_basedir(path)


def ensure_dir(dirpath):
    """Makes the given directory, if necessary.

    Args:
        dirpath: the directory path
    """
    if is_local(dirpath):
        etau.ensure_dir(dirpath)


def load_json(path_or_str):
    """Loads JSON from the input argument.

    Args:
        path_or_str: the filepath or JSON string

    Returns:
        the loaded JSON
    """
    try:
        return json.loads(path_or_str)
    except ValueError:
        pass

    if isfile(path_or_str):
        return read_json(path_or_str)

    raise ValueError("Unable to load JSON from '%s'" % path_or_str)


def read_json(path):
    """Reads a JSON file.

    Args:
        path: the filepath

    Returns:
        the JSON data
    """
    try:
        with open_file(path, "r") as f:
            return json.load(f)
    except ValueError:
        raise ValueError("Unable to parse JSON file '%s'" % path)


def write_json(d, path, pretty_print=False):
    """Writes JSON object to file.

    Args:
        d: JSON data
        path: the filepath
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """
    s = etase.json_to_str(d, pretty_print=pretty_print)
    write_file(s, path)


def load_ndjson(path_or_str):
    """Loads NDJSON from the input argument.

    Args:
        path_or_str: the filepath or NDJSON string

    Returns:
        a list of JSON dicts
    """
    try:
        return etase.load_ndjson(path_or_str)
    except ValueError:
        pass

    if isfile(path_or_str):
        return read_ndjson(path_or_str)

    raise ValueError("Unable to load NDJSON from '%s'" % path_or_str)


def read_ndjson(path):
    """Reads an NDJSON file.

    Args:
        path: the filepath

    Returns:
        a list of JSON dicts
    """
    with open_file(path, "r") as f:
        with jsonlines.Reader(f) as r:
            return list(r.iter(skip_empty=True))


def write_ndjson(obj, path):
    """Writes the list of JSON dicts in NDJSON format.

    Args:
        obj: a list of JSON dicts
        path: the filepath
    """
    with open_file(path, "w") as f:
        with jsonlines.Writer(f) as w:
            w.write_all(obj)


def read_yaml(path):
    """Reads a YAML file.

    Args:
        path: the filepath

    Returns:
        a list of JSON dicts
    """
    with open_file(path, "r") as f:
        return yaml.safe_load(f)


def write_yaml(obj, path, **kwargs):
    """Writes the object to a YAML file.

    Args:
        obj: a Python object
        path: the filepath
        **kwargs: optional arguments for ``yaml.dump(..., **kwargs)``
    """
    with open_file(path, "w") as f:
        return yaml.dump(obj, stream=f, **kwargs)


def list_files(
    dirpath,
    abs_paths=False,
    recursive=False,
    include_hidden_files=False,
    return_metadata=False,
    sort=True,
):
    """Lists the files in the given directory.

    If the directory does not exist, an empty list is returned.

    Args:
        dirpath: the path to the directory to list
        abs_paths (False): whether to return the absolute paths to the files
        recursive (False): whether to recursively traverse subdirectories
        include_hidden_files (False): whether to include dot files
        return_metadata (False): whether to return metadata dicts for each file
            instead of filepaths
        sort (True): whether to sort the list of files

    Returns:
        a list of filepaths or metadata dicts
    """
    if is_local(dirpath):
        if not os.path.isdir(dirpath):
            return []

        filepaths = etau.list_files(
            dirpath,
            abs_paths=abs_paths,
            recursive=recursive,
            include_hidden_files=include_hidden_files,
            sort=sort,
        )

        if not return_metadata:
            return filepaths

        metadata = []
        for filepath in filepaths:
            if abs_paths:
                fp = filepath
            else:
                fp = os.path.join(dirpath, filepath)

            m = _get_local_metadata(fp)
            m["filepath"] = filepath
            metadata.append(m)

        return metadata

    client = get_client(path=dirpath)

    filepaths = client.list_files_in_folder(
        dirpath,
        recursive=recursive,
        return_metadata=return_metadata,
    )

    if not return_metadata:
        if not abs_paths:
            filepaths = [os.path.relpath(f, dirpath) for f in filepaths]

        if not include_hidden_files:
            filepaths = [
                f for f in filepaths if not os.path.basename(f).startswith(".")
            ]

        if sort:
            filepaths = sorted(filepaths)

        return filepaths

    prefix = split_prefix(dirpath)[0]
    metadata = filepaths
    for m in metadata:
        filepath = prefix + m["bucket"] + "/" + m["object_name"]
        if not abs_paths:
            filepath = os.path.relpath(filepath, dirpath)

        m["filepath"] = filepath

    if not include_hidden_files:
        metadata = [
            m
            for m in metadata
            if not os.path.basename(m["filepath"]).startswith(".")
        ]

    if sort:
        metadata = sorted(metadata, key=lambda m: m["filepath"])

    return metadata


def _get_local_metadata(filepath):
    s = os.stat(filepath)
    return {
        "name": os.path.basename(filepath),
        "size": s.st_size,
        "last_modified": datetime.fromtimestamp(s.st_mtime),
    }


def list_subdirs(dirpath, abs_paths=False, recursive=False):
    """Lists the subdirectories in the given directory, sorted alphabetically
    and excluding hidden directories.

    Args:
        dirpath: the path to the directory to list
        abs_paths (False): whether to return absolute paths
        recursive (False): whether to recursively traverse subdirectories

    Returns:
        a list of subdirectories
    """
    if is_local(dirpath):
        return etau.list_subdirs(
            dirpath, abs_paths=abs_paths, recursive=recursive
        )

    if _is_root(dirpath):
        fs = get_file_system(dirpath)
        buckets = list_buckets(fs, abs_paths=True)
        buckets = sorted(buckets)

        if recursive:
            dirs = list(
                itertools.chain.from_iterable(
                    list_subdirs(b, abs_paths=True, recursive=True)
                    for b in buckets
                )
            )
        else:
            dirs = buckets

        if not abs_paths:
            n = len(dirpath)
            dirs = [d[n:] for d in dirs]

        return dirs

    if recursive:
        filepaths = list_files(dirpath, recursive=True)
        dirs = {os.path.dirname(p) for p in filepaths}
    else:
        client = get_client(path=dirpath)
        dirs = client.list_subfolders(dirpath)
        dirs = [os.path.relpath(d, dirpath) for d in dirs]

    dirs = sorted(d for d in dirs if d and not d.startswith("."))

    if abs_paths:
        dirs = [join(dirpath, d) for d in dirs]

    return dirs


def _is_root(path):
    fs = get_file_system(path)

    if fs == FileSystem.LOCAL:
        return path == os.path.abspath(os.sep)

    if fs == FileSystem.S3:
        return path == S3_PREFIX

    if fs == FileSystem.GCS:
        return path == GCS_PREFIX

    if fs == FileSystem.AZURE:
        for prefix_set in azure_prefixes:
            azure_alias_prefix = prefix_set[0]
            azure_endpoint_prefix = prefix_set[1]
            if path in (azure_alias_prefix, azure_endpoint_prefix):
                return path in (azure_alias_prefix, azure_endpoint_prefix)

    if fs == FileSystem.MINIO:
        for prefix_set in minio_prefixes:
            minio_alias_prefix = prefix_set[0]
            minio_endpoint_prefix = prefix_set[1]
            if path in (minio_alias_prefix, minio_endpoint_prefix):
                return path in (minio_alias_prefix, minio_endpoint_prefix)

    return False


def list_buckets(fs, abs_paths=False):
    """Lists the available buckets in the given file system.

    For local file systems, this method returns subdirectories of ``/``(or the
    current drive on Windows).

    Args:
        fs: a :class:`FileSystem` value
        abs_paths (False): whether to return absolute paths

    Returns:
        a list of buckets
    """
    if fs == FileSystem.LOCAL:
        root = os.path.abspath(os.sep)
        return etau.list_subdirs(root, abs_paths=abs_paths, recursive=False)

    # this methods needs to be updated to use ALL creds available to list buckets
    # also update the docstring

    if fs == FileSystem.S3:
        _local_client_list = []
        # hehe
        bucket_list = set()

        if creds_manager:
            creds_file_list = creds_manager.get_all_credentials_for_provider(
                FILESYSTEM_TO_PROVIDER[fs]
            )
            for creds_file in creds_file_list:

                credentials, _ = S3StorageClient.load_credentials(
                    credentials_path=creds_file, profile=None
                )

                _local_client_list.append(
                    S3StorageClient(credentials=credentials)
                )

            for client in _local_client_list:
                resp = client._client.list_buckets()
                buckets = [r["Name"] for r in resp.get("Buckets", [])]
                if abs_paths:
                    prefix = S3_PREFIX
                    buckets = [prefix + b for b in buckets]
                for name in buckets:
                    bucket_list.add(name)

            return list(bucket_list)

        # creds manager is not present, so we load from env
        else:
            credentials_path = fo.media_cache_config.aws_config_file
            profile = fo.media_cache_config.aws_profile
            credentials, _ = S3StorageClient.load_credentials(
                credentials_path=credentials_path, profile=profile
            )
            client = S3StorageClient(credentials=credentials)
            resp = client._client.list_buckets()
            buckets = [r["Name"] for r in resp.get("Buckets", [])]
            if abs_paths:
                prefix = S3_PREFIX
                buckets = [prefix + b for b in buckets]

            return buckets

    if fs == FileSystem.GCS:
        _local_client_list = []
        # teehee
        bucket_list = set()

        if creds_manager:
            creds_file_list = creds_manager.get_all_credentials_for_provider(
                FILESYSTEM_TO_PROVIDER[fs]
            )
            for creds_file in creds_file_list:
                credentials, _ = GoogleCloudStorageClient.load_credentials(
                    credentials_path=creds_file
                )

                _local_client_list.append(
                    GoogleCloudStorageClient(credentials=credentials)
                )

            for client in _local_client_list:
                buckets = [b.name for b in client._client.list_buckets()]
                if abs_paths:
                    prefix = GCS_PREFIX
                    buckets = [prefix + b for b in buckets]
                for name in buckets:
                    bucket_list.add(name)

            return list(bucket_list)

        # creds manager is not present, so we load from env
        else:
            credentials_path = (
                fo.media_cache_config.google_application_credentials
            )
            credentials, _ = GoogleCloudStorageClient.load_credentials(
                credentials_path=credentials_path
            )
            client = GoogleCloudStorageClient(credentials=credentials)
            buckets = [b.name for b in client._client.list_buckets()]
            if abs_paths:
                prefix = GCS_PREFIX
                buckets = [prefix + b for b in buckets]

            return buckets

    if fs == FileSystem.AZURE:
        _local_client_prefix_dict = {}
        # come on, it's kinda funny
        bucket_list = set()

        if creds_manager:
            creds_file_list = creds_manager.get_all_credentials_for_provider(
                FILESYSTEM_TO_PROVIDER[fs]
            )
            for creds_file in creds_file_list:
                credentials, _ = AzureStorageClient.load_credentials(
                    credentials_path=creds_file, profile=None
                )

                azure_alias_prefix = None
                azure_endpoint_prefix = None

                if "alias" in credentials:
                    azure_alias_prefix = credentials["alias"] + "://"

                if "account_url" in credentials:
                    azure_endpoint_prefix = (
                        credentials["account_url"].rstrip("/") + "/"
                    )
                elif (
                    "conn_str" in credentials or "account_name" in credentials
                ):
                    account_url = AzureStorageClient._to_account_url(
                        conn_str=credentials.get("conn_str", None),
                        account_name=credentials.get("account_name", None),
                    )
                    azure_endpoint_prefix = account_url.rstrip("/") + "/"

                _local_client_prefix_dict[
                    AzureStorageClient(credentials=credentials)
                ] = (azure_alias_prefix, azure_endpoint_prefix)

            for client_set in _local_client_prefix_dict.items():
                client = client_set[0]
                azure_alias_prefix = client_set[1][0]
                azure_endpoint_prefix = client_set[1][1]

                buckets = [c["name"] for c in client._client.list_containers()]
                if abs_paths:
                    prefix = azure_alias_prefix or azure_endpoint_prefix
                    buckets = [prefix + b for b in buckets]

                for name in buckets:
                    bucket_list.add(name)

            return list(bucket_list)

        else:
            credentials_path = fo.media_cache_config.azure_credentials_file
            profile = fo.media_cache_config.azure_profile

            credentials, _ = AzureStorageClient.load_credentials(
                credentials_path=credentials_path, profile=profile
            )
            azure_alias_prefix = None
            azure_endpoint_prefix = None

            if "alias" in credentials:
                azure_alias_prefix = credentials["alias"] + "://"

            if "account_url" in credentials:
                azure_endpoint_prefix = (
                    credentials["account_url"].rstrip("/") + "/"
                )
            elif "conn_str" in credentials or "account_name" in credentials:
                account_url = AzureStorageClient._to_account_url(
                    conn_str=credentials.get("conn_str", None),
                    account_name=credentials.get("account_name", None),
                )
                azure_endpoint_prefix = account_url.rstrip("/") + "/"

            client = AzureStorageClient(credentials=credentials)

            buckets = [c["name"] for c in client._client.list_containers()]
            if abs_paths:
                prefix = azure_alias_prefix or azure_endpoint_prefix
                buckets = [prefix + b for b in buckets]

            return buckets

    if fs == FileSystem.MINIO:
        _local_client_prefix_dict = {}
        # cause it's a bucket list!
        bucket_list = set()

        if creds_manager:
            creds_file_list = creds_manager.get_all_credentials_for_provider(
                FILESYSTEM_TO_PROVIDER[fs]
            )
            for creds_file in creds_file_list:
                credentials, _ = MinIOStorageClient.load_credentials(
                    credentials_path=creds_file, profile=None
                )

                minio_alias_prefix = None
                minio_endpoint_prefix = None

                if "alias" in credentials:
                    minio_alias_prefix = credentials["alias"] + "://"

                if "endpoint_url" in credentials:
                    minio_endpoint_prefix = (
                        credentials["endpoint_url"].rstrip("/") + "/"
                    )

                _local_client_prefix_dict[
                    MinIOStorageClient(credentials=credentials)
                ] = (minio_alias_prefix, minio_endpoint_prefix)

            for client_set in _local_client_prefix_dict.items():
                client = client_set[0]
                minio_alias_prefix = client_set[1][0]
                minio_endpoint_prefix = client_set[1][1]

                resp = client._client.list_buckets()
                buckets = [r["Name"] for r in resp.get("Buckets", [])]
                if abs_paths:
                    prefix = minio_alias_prefix or minio_endpoint_prefix
                    buckets = [prefix + b for b in buckets]
                for name in buckets:
                    bucket_list.add(name)

            return list(bucket_list)

        else:
            credentials_path = fo.media_cache_config.minio_config_file
            profile = fo.media_cache_config.minio_profile

            credentials, _ = MinIOStorageClient.load_credentials(
                credentials_path=credentials_path, profile=profile
            )

            minio_alias_prefix = None
            minio_endpoint_prefix = None

            if "alias" in credentials:
                minio_alias_prefix = credentials["alias"] + "://"

            if "endpoint_url" in credentials:
                minio_endpoint_prefix = (
                    credentials["endpoint_url"].rstrip("/") + "/"
                )

            client = MinIOStorageClient(credentials=credentials)

            resp = client._client.list_buckets()
            buckets = [r["Name"] for r in resp.get("Buckets", [])]
            if abs_paths:
                prefix = minio_alias_prefix or minio_endpoint_prefix
                buckets = [prefix + b for b in buckets]

            return buckets

    raise ValueError("Unsupported file system '%s'" % fs)


def get_glob_matches(glob_patt):
    """Returns a list of file paths matching the given glob pattern.

    The matches are returned in sorted order.

    Args:
        glob_patt: a glob pattern like ``/path/to/files-*.jpg`` or
            ``s3://path/to/files-*-*.jpg``

    Returns:
        a list of file paths
    """
    if is_local(glob_patt):
        return etau.get_glob_matches(glob_patt)

    root, found_special = get_glob_root(glob_patt)

    if not found_special:
        return [glob_patt]

    client = get_client(path=root)

    filepaths = client.list_files_in_folder(root, recursive=True)
    return sorted(
        glob.globfilter(
            filepaths, glob_patt, flags=glob.GLOBSTAR | glob.FORCEUNIX
        )
    )


def get_glob_root(glob_patt):
    """Finds the root directory of the given glob pattern, i.e., the deepest
    subdirectory that contains no glob characters.

    Args:
        glob_patt: a glob pattern like ``/path/to/files-*.jpg`` or
            ``s3://path/to/files-*-*.jpg``

    Returns:
        a tuple of:

        -   the root
        -   True/False whether the pattern contains any special characters
    """
    special_chars = "*?[]"

    # Remove escapes around special characters
    replacers = [("[%s]" % s, s) for s in special_chars]
    glob_patt = etau.replace_strings(glob_patt, replacers)

    # @todo optimization: don't split on specials that were previously escaped,
    # as this could cause much more recursive listing than necessary
    split_patt = "|".join(map(re.escape, special_chars))
    root = re.split(split_patt, glob_patt, 1)[0]

    found_special = root != glob_patt
    root = os.path.dirname(root)

    return root, found_special


def copy_file(inpath, outpath):
    """Copies the input file to the output location.

    Args:
        inpath: the input path
        outpath: the output path
    """
    _copy_file(inpath, outpath, cleanup=False)


def copy_files(inpaths, outpaths, skip_failures=False, progress=False):
    """Copies the files to the given locations.

    Args:
        inpaths: a list of input paths
        outpaths: a list of output paths
        skip_failures (False): whether to gracefully continue without raising
            an error if a remote operation fails
        progress (False): whether to render a progress bar tracking the status
            of the operation
    """
    _copy_files(inpaths, outpaths, skip_failures, False, progress)


def copy_dir(
    indir, outdir, overwrite=True, skip_failures=False, progress=False
):
    """Copies the input directory to the output directory.

    Args:
        indir: the input directory
        outdir: the output directory
        overwrite (True): whether to delete an existing output directory (True)
            or merge its contents (False)
        skip_failures (False): whether to gracefully continue without raising
            an error if a remote operation fails
        progress (False): whether to render a progress bar tracking the status
            of the operation
    """
    if overwrite and isdir(outdir):
        delete_dir(outdir)

    files = list_files(
        indir, include_hidden_files=True, recursive=True, sort=False
    )
    inpaths = [join(indir, f) for f in files]
    outpaths = [join(outdir, f) for f in files]
    copy_files(
        inpaths, outpaths, skip_failures=skip_failures, progress=progress
    )


def move_file(inpath, outpath):
    """Moves the given file to a new location.

    Args:
        inpath: the input path
        outpath: the output path
    """
    _copy_file(inpath, outpath, cleanup=True)


def move_files(inpaths, outpaths, skip_failures=False, progress=False):
    """Moves the files to the given locations.

    Args:
        inpaths: a list of input paths
        outpaths: a list of output paths
        skip_failures (False): whether to gracefully continue without raising
            an error if a remote operation fails
        progress (False): whether to render a progress bar tracking the status
            of the operation
    """
    tasks = [(i, o, skip_failures) for i, o in zip(inpaths, outpaths)]
    if tasks:
        _run(_do_move_file, tasks, progress=progress)


def move_dir(
    indir, outdir, overwrite=True, skip_failures=False, progress=False
):
    """Moves the contents of the given directory into the given output
    directory.

    Args:
        indir: the input directory
        outdir: the output directory
        overwrite (True): whether to delete an existing output directory (True)
            or merge its contents (False)
        skip_failures (False): whether to gracefully continue without raising
            an error if a remote operation fails
        progress (False): whether to render a progress bar tracking the status
            of the operation
    """
    if overwrite and isdir(outdir):
        delete_dir(outdir)

    if overwrite and is_local(indir) and is_local(outdir):
        etau.ensure_basedir(outdir)
        shutil.move(indir, outdir)
        return

    files = list_files(
        indir, include_hidden_files=True, recursive=True, sort=False
    )
    inpaths = [join(indir, f) for f in files]
    outpaths = [join(outdir, f) for f in files]
    move_files(
        inpaths, outpaths, skip_failures=skip_failures, progress=progress
    )


def delete_file(path):
    """Deletes the file at the given path.

    For local paths, any empty directories are also recursively deleted from
    the resulting directory tree.

    Args:
        path: the filepath
    """
    _delete_file(path)


def delete_files(paths, skip_failures=False, progress=False):
    """Deletes the files from the given locations.

    For local paths, any empty directories are also recursively deleted from
    the resulting directory tree.

    Args:
        paths: a list of paths
        skip_failures (False): whether to gracefully continue without raising
            an error if a remote operation fails
        progress (False): whether to render a progress bar tracking the status
            of the operation
    """
    tasks = [(p, skip_failures) for p in paths]
    if tasks:
        _run(_do_delete_file, tasks, progress=progress)


def delete_dir(dirpath):
    """Deletes the given directory and recursively deletes any empty
    directories from the resulting directory tree.

    Args:
        dirpath: the directory path
    """
    if is_local(dirpath):
        etau.delete_dir(dirpath)
        return

    client = get_client(path=dirpath)
    client.delete_folder(dirpath)


def upload_media(
    sample_collection,
    remote_dir,
    rel_dir=None,
    media_field="filepath",
    update_filepaths=False,
    cache=False,
    overwrite=False,
    skip_failures=False,
    progress=False,
):
    """Uploads the source media files for the given collection to the given
    remote directory.

    Providing a ``rel_dir`` enables writing nested subfolders within
    ``remote_dir`` matching the structure of the input collection's media. By
    default, the files are written directly to ``remote_dir`` using their
    basenames.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        remote_dir: a remote "folder" into which to upload
        rel_dir (None): an optional relative directory to strip from each
            filepath when constructing the corresponding remote path
        media_field ("filepath"): the field containing the media paths
        update_filepaths (False): whether to update the ``media_field`` of each
            sample in the collection to its remote path
        cache (False): whether to store the uploaded media in your local media
            cache. The supported values are:

            -   ``False`` (default): do not cache the media
            -   ``True`` or ``"copy"``: copy the media into your local cache
            -   ``"move"``: move the media into your local cache
        overwrite (False): whether to overwrite (True) or skip (False) existing
            remote files
        skip_failures (False): whether to gracefully continue without raising
            an error if a remote operation fails
        progress (False): whether to render a progress bar tracking the status
            of the upload

    Returns:
        the list of remote paths
    """
    if sample_collection.media_type == fom.GROUP:
        sample_collection = sample_collection.select_group_slices(
            _allow_mixed=True
        )

    filepaths = sample_collection.values(media_field)

    filename_maker = fou.UniqueFilenameMaker(
        output_dir=remote_dir,
        rel_dir=rel_dir,
        ignore_existing=True,
    )

    paths_map = {}
    for filepath in filepaths:
        if filepath not in paths_map:
            paths_map[filepath] = filename_maker.get_output_path(filepath)

    remote_paths = [paths_map[f] for f in filepaths]

    if not overwrite:
        client = get_client(path=remote_dir)
        existing = set(client.list_files_in_folder(remote_dir, recursive=True))
        paths_map = {f: r for f, r in paths_map.items() if r not in existing}

    if paths_map:
        inpaths, outpaths = zip(*paths_map.items())
        _copy_files(inpaths, outpaths, skip_failures, cache, progress)

    if update_filepaths:
        sample_collection.set_values(media_field, remote_paths)

    return remote_paths


def run(fcn, tasks, num_workers=None, progress=False):
    """Applies the given function to each element of the given tasks.

    Args:
        fcn: a function that accepts a single argument
        tasks: an iterable of function aguments
        num_workers (None): a suggested number of threads to use
        progress (False): whether to render a progress bar tracking the status
            of the operation

    Returns:
        the list of function outputs
    """
    num_workers = fou.recommend_thread_pool_workers(num_workers)

    try:
        num_tasks = len(tasks)
    except:
        num_tasks = None

    kwargs = dict(total=num_tasks, iters_str="files", quiet=not progress)

    if num_workers <= 1:
        with fou.ProgressBar(**kwargs) as pb:
            results = [fcn(task) for task in pb(tasks)]
    else:
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(**kwargs) as pb:
                results = list(pb(pool.imap(fcn, tasks)))

    return results


def _get_client(fs=None, path=None):
    _check_managed_credentials()

    if path is not None:
        fs = get_file_system(path)
    elif fs is None:
        raise ValueError("You must provide either a file system or a path")

    if path is not None:
        bucket = get_bucket_name(path)

    if fs in _FILE_SYSTEMS_WITH_REGIONAL_CLIENTS:
        return _get_regional_client(fs, bucket)

    return _get_default_client(fs, bucket)


def _get_regional_client(fs, bucket):
    global bucket_regions
    global region_clients

    if fs not in bucket_regions:
        bucket_regions[fs] = {}

    if fs not in region_clients:
        region_clients[fs] = {}

    region = bucket_regions[fs].get(bucket, None)
    if region is None:
        region = _get_region(fs, bucket)
        bucket_regions[fs][bucket] = region

    # try to get from the central client cache
    client = _get_client_from_cache(FILESYSTEM_TO_PROVIDER[fs], bucket)

    if client is None:
        if region == _UNKNOWN_REGION:
            client = _get_default_client(fs, bucket)
        else:
            client = _make_regional_client(fs, region, bucket)

    return client


def _get_client_from_cache(provider, bucket_name):
    global client_cache

    # Note that this cache does not care about "default" creds
    # as it is only aware of clients, not credentials.

    # if there is a valid client based on the bucket and provider combo
    # it will use it from the cache, regardless of if the credentials
    # used to make the client were default or specific.
    # The creds manager keeps track of those details

    # client_cache has shape
    # {"provider-bucket": client}

    for client_key in client_cache:
        if bucket_name in client_key and client_key.startswith(provider):
            return client_cache[client_key]

    return None


def _get_default_client(fs, bucket):
    global client_cache

    if fs == FileSystem.S3:
        s3_client = _get_client_from_cache(FILESYSTEM_TO_PROVIDER[fs], bucket)
        if s3_client is None:
            s3_client = _make_client(fs, bucket)
        return s3_client

    if fs == FileSystem.GCS:
        gcs_client = _get_client_from_cache(FILESYSTEM_TO_PROVIDER[fs], bucket)
        if gcs_client is None:
            gcs_client = _make_client(fs, bucket)

        return gcs_client

    if fs == FileSystem.AZURE:
        azure_client = _get_client_from_cache(
            FILESYSTEM_TO_PROVIDER[fs], bucket
        )
        if azure_client is None:
            azure_client = _make_client(fs, bucket)

        return azure_client

    if fs == FileSystem.MINIO:
        minio_client = _get_client_from_cache(
            FILESYSTEM_TO_PROVIDER[fs], bucket
        )
        if minio_client is None:
            minio_client = _make_client(fs, bucket)

        return minio_client

    if fs == FileSystem.HTTP:
        global http_client

        if http_client is None:
            http_client = _make_client(fs, bucket)

        return http_client

    raise ValueError("Unsupported file system '%s'" % fs)


def _get_region(fs, bucket):
    if fs == FileSystem.S3:
        client = _get_client_from_cache(FILESYSTEM_TO_PROVIDER[fs], bucket)
        if client is None:
            credentials = _load_s3_credentials(bucket)
            client = S3StorageClient(credentials=credentials)
    elif fs == FileSystem.MINIO:
        client = _get_client_from_cache(FILESYSTEM_TO_PROVIDER[fs], bucket)
        if client is None:
            credentials = _load_minio_credentials(bucket)
            client = MinIOStorageClient(credentials=credentials)

    try:
        # HeadBucket is the AWS recommended way to determine a bucket's region
        # It requires `s3:ListBucket` permsision
        resp = client._client.head_bucket(Bucket=bucket)
        headers = resp["ResponseMetadata"]["HTTPHeaders"]
        return headers.get("x-amz-bucket-region", "us-east-1")
    except Exception as e1:
        try:
            # Fallback to GetBucketLocation, which requires
            # `s3:GetBucketLocation` permission but does not support
            # multi-account credentials
            resp = client._client.get_bucket_location(Bucket=bucket)
            return resp["LocationConstraint"] or "us-east-1"
        except Exception as e2:
            logger.warning(
                "Failed to determine file system '%s' bucket '%s' location. "
                "HeadBucket: %s. GetBucketLocation: %s",
                fs,
                bucket,
                e1,
                e2,
            )

            return _UNKNOWN_REGION


def _make_client(fs, bucket, num_workers=None):
    global client_cache
    if num_workers is None:
        num_workers = fo.media_cache_config.num_workers

    kwargs = {}

    if num_workers is not None and num_workers > 10:
        kwargs["max_pool_connections"] = num_workers

    if fs == FileSystem.S3:
        credentials = _load_s3_credentials(bucket)
        client = S3StorageClient(credentials=credentials, **kwargs)
        client_cache[f"{FILESYSTEM_TO_PROVIDER[fs]}-{bucket}"] = client
        return client

    if fs == FileSystem.GCS:
        credentials = _load_gcs_credentials(bucket)
        client = GoogleCloudStorageClient(credentials=credentials, **kwargs)
        client_cache[f"{FILESYSTEM_TO_PROVIDER[fs]}-{bucket}"] = client
        return client

    if fs == FileSystem.AZURE:
        credentials = _load_azure_credentials(bucket)
        client = AzureStorageClient(credentials=credentials, **kwargs)
        client_cache[f"{FILESYSTEM_TO_PROVIDER[fs]}-{bucket}"] = client
        return client

    if fs == FileSystem.MINIO:
        credentials = _load_minio_credentials(bucket)
        client = MinIOStorageClient(credentials=credentials, **kwargs)
        client_cache[f"{FILESYSTEM_TO_PROVIDER[fs]}-{bucket}"] = client
        return client

    if fs == FileSystem.HTTP:
        return HTTPStorageClient(**kwargs)

    raise ValueError("Unsupported file system '%s'" % fs)


def _make_regional_client(fs, region, bucket, num_workers=None):
    if num_workers is None:
        num_workers = fo.media_cache_config.num_workers

    kwargs = {}

    if num_workers is not None and num_workers > 10:
        kwargs["max_pool_connections"] = num_workers

    if fs == FileSystem.S3:
        credentials = _load_s3_credentials(bucket) or {}
        credentials["region"] = region
        client = S3StorageClient(credentials=credentials, **kwargs)
        client_cache[f"{FILESYSTEM_TO_PROVIDER[fs]}-{bucket}"] = client
        return client

    if fs == FileSystem.MINIO:
        credentials = _load_minio_credentials(bucket) or {}
        credentials["region"] = region
        client = MinIOStorageClient(credentials=credentials, **kwargs)
        client_cache[f"{FILESYSTEM_TO_PROVIDER[fs]}-{bucket}"] = client
        return client

    raise ValueError("Unsupported file system '%s'" % fs)


def _check_managed_credentials():
    if creds_manager is None:
        return

    if creds_manager.is_expired:
        init_storage()


def _get_managed_credentials(provider, bucket):
    if creds_manager is None:
        return None

    return creds_manager.get_stored_credentials_per_bucket(provider, bucket)


def _load_s3_credentials(bucket):
    credentials_path = _get_managed_credentials(
        FILESYSTEM_TO_PROVIDER[FileSystem.S3], bucket
    )
    profile = None

    if credentials_path:
        logger.debug("Loaded S3 creds from Teams DB")
    else:
        credentials_path = fo.media_cache_config.aws_config_file
        profile = fo.media_cache_config.aws_profile
        logger.debug("Loaded S3 creds from ENV")

    credentials, _ = S3StorageClient.load_credentials(
        credentials_path=credentials_path, profile=profile
    )

    return credentials


def _load_gcs_credentials(bucket):
    credentials_path = _get_managed_credentials(
        FILESYSTEM_TO_PROVIDER[FileSystem.GCS], bucket
    )
    if credentials_path:
        logger.debug("Loaded GCP creds from Teams DB")
    else:
        credentials_path = fo.media_cache_config.google_application_credentials
        logger.debug("Loaded GCP creds from ENV")

    credentials, _ = GoogleCloudStorageClient.load_credentials(
        credentials_path=credentials_path
    )

    return credentials


def _load_azure_credentials(bucket):
    credentials_path = _get_managed_credentials(
        FILESYSTEM_TO_PROVIDER[FileSystem.AZURE], bucket
    )
    profile = None

    if credentials_path:
        logger.debug("Loaded AZURE creds from Teams DB")
    else:
        credentials_path = fo.media_cache_config.azure_credentials_file
        profile = fo.media_cache_config.azure_profile
        logger.debug("Loaded AZURE creds from ENV")

    credentials, _ = AzureStorageClient.load_credentials(
        credentials_path=credentials_path, profile=profile
    )

    return credentials


def _load_minio_credentials(bucket):
    credentials_path = _get_managed_credentials(
        FILESYSTEM_TO_PROVIDER[FileSystem.MINIO], bucket
    )
    profile = None

    if credentials_path:
        logger.debug("Loaded MINIO creds from Teams DB")
    else:
        credentials_path = fo.media_cache_config.minio_config_file
        profile = fo.media_cache_config.minio_profile
        logger.debug("Loaded MINIO creds from ENV")

    credentials, _ = MinIOStorageClient.load_credentials(
        credentials_path=credentials_path, profile=profile
    )

    return credentials


def _copy_files(inpaths, outpaths, skip_failures, cache, progress):
    supported_cache_values = ("copy", "move", True, False)
    if cache not in supported_cache_values:
        raise ValueError(
            "Unsupported cache parameter '%s'. The supported values are %s"
            % (cache, supported_cache_values)
        )

    if cache is True:
        cache = "copy"

    tasks = [(i, o, skip_failures, cache) for i, o in zip(inpaths, outpaths)]
    if tasks:
        _run(_do_copy_file, tasks, progress=progress)


def _run(fcn, tasks, num_workers=None, progress=False):
    num_workers = fou.recommend_thread_pool_workers(num_workers)

    try:
        num_tasks = len(tasks)
    except:
        num_tasks = None

    kwargs = dict(total=num_tasks, iters_str="files", quiet=not progress)

    if num_workers <= 1:
        with fou.ProgressBar(**kwargs) as pb:
            for task in pb(tasks):
                fcn(task)
    else:
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(**kwargs) as pb:
                for _ in pb(pool.imap_unordered(fcn, tasks)):
                    pass


def _do_copy_file(arg):
    inpath, outpath, skip_failures, cache = arg

    try:
        _copy_file(inpath, outpath, cleanup=False)
        if cache:
            # Implicitly assumes outpath is the remote path
            foc.media_cache.add(
                [inpath], [outpath], method=cache, overwrite=True
            )
    except Exception as e:
        if not skip_failures:
            raise

        if skip_failures != "ignore":
            logger.warning(e)


def _do_move_file(arg):
    inpath, outpath, skip_failures = arg

    try:
        _copy_file(inpath, outpath, cleanup=True)
    except Exception as e:
        if not skip_failures:
            raise

        if skip_failures != "ignore":
            logger.warning(e)


def _do_delete_file(arg):
    filepath, skip_failures = arg

    try:
        _delete_file(filepath)
    except Exception as e:
        if not skip_failures:
            raise

        if skip_failures != "ignore":
            logger.warning(e)


def _copy_file(inpath, outpath, cleanup=False):
    fsi = get_file_system(inpath)
    fso = get_file_system(outpath)

    if fsi == FileSystem.LOCAL:
        if fso == FileSystem.LOCAL:
            # Local -> local
            etau.ensure_basedir(outpath)
            if cleanup:
                shutil.move(inpath, outpath)
            else:
                shutil.copy(inpath, outpath)
        else:
            # Local -> remote
            client = get_client(path=outpath)
            client.upload(inpath, outpath)
            if cleanup:
                os.remove(inpath)
    elif fso == FileSystem.LOCAL:
        # Remote -> local
        client = get_client(path=inpath)
        client.download(inpath, outpath)
        if cleanup:
            client.delete(inpath)
    else:
        # Remote -> remote
        clienti = get_client(path=inpath)
        b = clienti.download_bytes(inpath)
        cliento = get_client(path=outpath)
        cliento.upload_bytes(b, outpath)
        if cleanup:
            clienti.delete(inpath)


def _delete_file(filepath):
    if is_local(filepath):
        etau.delete_file(filepath)
        return

    client = get_client(path=filepath)
    client.delete(filepath)


class _BytesIO(io.BytesIO):
    def write(self, str_or_bytes):
        super().write(_to_bytes(str_or_bytes))


def _to_bytes(val, encoding="utf-8"):
    b = val.encode(encoding) if isinstance(val, six.text_type) else val
    if not isinstance(b, six.binary_type):
        raise TypeError("Failed to convert %s to bytes" % type(b))

    return b


def _parse_quiet(quiet):
    if quiet is None:
        return not fo.config.show_progress_bars

    return quiet
