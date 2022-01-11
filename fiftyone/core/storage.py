"""
File storage utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from contextlib import contextmanager
import io
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
import ndjson
from wcmatch import glob
import yaml

import eta.core.serial as etase
import eta.core.storage as etast
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)

s3_client = None
gcs_client = None
minio_client = None
http_client = None
client_lock = threading.Lock()

minio_alias_prefix = None
minio_endpoint_prefix = None


def init_storage():
    """Initializes storage client use."""
    global minio_alias_prefix
    global minio_endpoint_prefix

    try:
        credentials = _load_minio_credentials()

        if "alias" in credentials:
            minio_alias_prefix = credentials["alias"] + "://"
        else:
            minio_alias_prefix = None

        if "endpoint_url" in credentials:
            minio_endpoint_prefix = credentials["endpoint_url"] + "/"
        else:
            minio_endpoint_prefix = None
    except:
        pass


class FileSystem(object):
    """Enumeration of the available file systems."""

    S3 = "s3"
    GCS = "gcs"
    MINIO = "minio"
    HTTP = "http"
    LOCAL = "local"


class S3StorageClient(etast.S3StorageClient):
    """.. autoclass:: eta.core.storage.S3StorageClient"""

    def get_local_path(self, remote_path):
        return self._strip_prefix(remote_path)


class GoogleCloudStorageClient(etast.GoogleCloudStorageClient):
    """.. autoclass:: eta.core.storage.GoogleCloudStorageClient"""

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
        a :class:`FileSystem` enum
    """
    # Check MinIO first in case alias/endpoint clashes with another file system
    if (
        minio_alias_prefix is not None and path.startswith(minio_alias_prefix)
    ) or (
        minio_endpoint_prefix is not None
        and path.startswith(minio_endpoint_prefix)
    ):
        return FileSystem.MINIO

    if path.startswith("s3://"):
        return FileSystem.S3

    if path.startswith("gs://"):
        return FileSystem.GCS

    if path.startswith(("http://", "https://")):
        return FileSystem.HTTP

    return FileSystem.LOCAL


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
    # Check MinIO first in case alias/endpoint clashes with another file system
    if minio_alias_prefix is not None and path.startswith(minio_alias_prefix):
        prefix = minio_alias_prefix
    elif minio_endpoint_prefix is not None and path.startswith(
        minio_endpoint_prefix
    ):
        prefix = minio_endpoint_prefix
    elif path.startswith("s3://"):
        prefix = "s3://"
    elif path.startswith("gs://"):
        prefix = "gs://"
    elif path.startswith("http://"):
        prefix = "http://"
    elif path.startswith("https://"):
        prefix = "https://"
    else:
        prefix = ""

    return prefix, path[len(prefix) :]


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


def get_client(fs):
    """Returns the storage client for the given file system.

    Args:
        fs: a :class:`FileSystem` enum

    Returns:
        a :class:`eta.core.storage.StorageClient`
    """
    # Client creation may not be thread-safe, so we lock for safety
    # https://stackoverflow.com/a/61943955/16823653
    with client_lock:
        return _get_client(fs)


def _get_client(fs):
    if fs == FileSystem.S3:
        global s3_client

        if s3_client is None:
            s3_client = _make_client(fs)

        return s3_client

    if fs == FileSystem.GCS:
        global gcs_client

        if gcs_client is None:
            gcs_client = _make_client(fs)

        return gcs_client

    if fs == FileSystem.MINIO:
        global minio_client

        if minio_client is None:
            minio_client = _make_client(fs)

        return minio_client

    if fs == FileSystem.HTTP:
        global http_client

        if http_client is None:
            http_client = _make_client(fs)

        return http_client

    raise ValueError("Unsupported file system '%s'" % fs)


def get_url(path, **kwargs):
    """Returns a public URL for the given file.

    The provided path must either already be a URL or a path into a filesystem
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

    client = get_client(fs)

    if not hasattr(client, "generate_signed_url"):
        raise ValueError(
            "Cannot get URL for '%s'; file system '%s' does not support "
            "signed URLs" % (path, fs)
        )

    return client.generate_signed_url(path, **kwargs)


def to_readable(path, **kwargs):
    """Returns a publicly readable path for the given file.

    The provided path must either already be a URL or be a remote path into a
    filesystem that supports signed URLs.

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
    filesystem that supports signed URLs.

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

    fs = get_file_system(basedir)

    if fs == FileSystem.LOCAL:
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
        self._dirpath = None
        self._tmpdir = None

    @property
    def quiet(self):
        """Whether this object will log the status of any uploads/downloads."""
        return _parse_quiet(self._quiet)

    def __enter__(self):
        if is_local(self._path):
            return self._path

        tmpdir = make_temp_dir(basedir=self._basedir)

        if os.path.splitext(self._path)[1]:
            dirpath = os.path.dirname(self._path)
            local_path = os.path.join(tmpdir, os.path.basename(self._path))
        else:
            dirpath = self._path
            local_path = tmpdir

        self._dirpath = dirpath
        self._tmpdir = tmpdir

        if self._mode == "r":
            progress = not self.quiet

            if progress and self._type_str:
                logger.info("Downloading %s...", self._type_str)

            copy_dir(
                self._dirpath,
                self._tmpdir,
                skip_failures=self._skip_failures,
                progress=progress,
            )

        return local_path

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
                    self._dirpath,
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

        with fos.LocalFile(remote_paths, "r") as local_path:
            for local_path in local_paths:
                with open(local_path, "r") as f:
                    print(r.read())

    Args:
        paths: a list of filepaths, or a dict mapping keys to filepaths
        mode ("r"): the mode. Supported values are ``("r", "w")``
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
        if mode not in ("r", "w"):
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

        if self._mode == "r" and self._remote_paths:
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
            if self._mode == "w" and self._local_paths:
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


@contextmanager
def open_file(path, mode="r"):
    """Opens the given file for reading or writing.

    This function *must* be used as a context manager, and it assumes that any
    cloud files being read/written can fit into RAM.

    Example usage::

        with open_file("/tmp/file.txt", "w") as f:
            f.write("Hello, world!")

        with open_file("s3://tmp/file.txt", "w") as f:
            f.write("Hello, world!")

        with open_file("/tmp/file.txt", "r") as f:
            print(f.read())

        with open_file("s3://tmp/file.txt", "r") as f:
            print(f.read())

    Args:
        path: the path
        mode ("r"): the mode. Supported values are ``("r", "rb", "w", "wb")``
    """
    fs = get_file_system(path)

    if fs == FileSystem.LOCAL:
        f = open(path, mode)

        try:
            yield f
        finally:
            f.close()

        return

    client = get_client(fs)
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
    fs = get_file_system(path)

    if fs == FileSystem.LOCAL:
        return os.path.exists(path)

    client = get_client(fs)

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
    fs = get_file_system(path)

    if fs == FileSystem.LOCAL:
        return os.path.isfile(path)

    client = get_client(fs)
    return client.is_file(path)


def isdir(dirpath):
    """Determines whether the given directory exists.

    Cloud "folders" are deemed to exist only if they are non-empty.

    Args:
        dirpath: the directory path

    Returns:
        True/False
    """
    fs = get_file_system(dirpath)

    if fs == FileSystem.LOCAL:
        return os.path.isdir(dirpath)

    client = get_client(fs)
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
    fs = get_file_system(dirpath)

    if fs == FileSystem.LOCAL:
        etau.ensure_empty_dir(dirpath, cleanup=cleanup)
        return

    client = get_client(fs)

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
        path_or_str: the JSON path or string any of the above supported formats

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


def read_ndjson(path):
    """Reads an NDJSON file.

    Args:
        path: the filepath

    Returns:
        a list of JSON dicts
    """
    with open_file(path, "r") as f:
        return ndjson.load(f)


def write_ndjson(obj, path):
    """Writes the list of JSON dicts in NDJSON format.

    Args:
        obj: a list of JSON dicts
        path: the filepath
    """
    s = ndjson.dumps(obj)
    write_file(s, path)


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
    sort=True,
):
    """Lists the files in the given directory.

    If the directory does not exist, an empty list is returned.

    Args:
        dirpath: the path to the directory to list
        abs_paths (False): whether to return the absolute paths to the files
        recursive (False): whether to recursively traverse subdirectories
        include_hidden_files (False): whether to include dot files
        sort (True): whether to sort the list of files

    Returns:
        a list of filepaths
    """
    fs = get_file_system(dirpath)

    if fs == FileSystem.LOCAL:
        if not os.path.isdir(dirpath):
            return []

        return etau.list_files(
            dirpath,
            abs_paths=abs_paths,
            recursive=recursive,
            include_hidden_files=include_hidden_files,
            sort=sort,
        )

    client = get_client(fs)

    filepaths = client.list_files_in_folder(dirpath, recursive=recursive)

    if not abs_paths:
        filepaths = [os.path.relpath(f, dirpath) for f in filepaths]

    if not include_hidden_files:
        filepaths = [
            f for f in filepaths if not os.path.basename(f).startswith(".")
        ]

    if sort:
        filepaths = sorted(filepaths)

    return filepaths


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

    dirs = {os.path.dirname(p) for p in list_files(dirpath, recursive=True)}

    if not recursive:
        dirs = {d.split("/", 1)[0] for d in dirs}

    dirs = sorted(d for d in dirs if d and not d.startswith("."))

    if abs_paths:
        dirs = [join(dirpath, d) for d in dirs]

    return dirs


def get_glob_matches(glob_patt):
    """Returns a list of file paths matching the given glob pattern.

    The matches are returned in sorted order.

    Args:
        glob_patt: a glob pattern like ``/path/to/files-*.jpg`` or
            ``/path/to/files-*-*.jpg``

    Returns:
        a list of file paths
    """
    fs = get_file_system(glob_patt)

    if fs == FileSystem.LOCAL:
        return etau.get_glob_matches(glob_patt)

    client = get_client(fs)

    root, found_special_chars = _parse_cloud_glob_patt(glob_patt)

    if not found_special_chars:
        return [root]

    filepaths = client.list_files_in_folder(root, recursive=True)
    return sorted(
        glob.globfilter(
            filepaths, glob_patt, flags=glob.GLOBSTAR | glob.FORCEUNIX
        )
    )


def _parse_cloud_glob_patt(glob_patt):
    special_chars = "*?[]"

    # Remove escapes around special characters
    replacers = [("[%s]" % s, s) for s in special_chars]
    glob_patt = etau.replace_strings(glob_patt, replacers)

    # @todo optimization: don't split on specials that were previously escaped,
    # as this could cause much more recursive listing than necessary
    split_patt = "|".join(map(re.escape, special_chars))
    root = re.split(split_patt, glob_patt, 1)[0]

    if root == glob_patt:
        return glob_patt, False

    return os.path.dirname(root), True


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
    tasks = [(i, o, skip_failures) for i, o in zip(inpaths, outpaths)]
    if tasks:
        _run(_do_copy_file, tasks, progress=progress)


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
    fs = get_file_system(dirpath)

    if fs == FileSystem.LOCAL:
        etau.delete_dir(dirpath)
        return

    client = get_client(fs)
    client.delete_folder(dirpath)


def upload_media(
    sample_collection,
    remote_dir,
    rel_dir=None,
    update_filepaths=False,
    overwrite=True,
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
        update_filepaths (False): whether to update the ``filepath`` of each
            sample in the collection to its remote path
        overwrite (True): whether to overwrite (True) or skip (False) existing
            remote files
        skip_failures (False): whether to gracefully continue without raising
            an error if a remote operation fails
        progress (False): whether to render a progress bar tracking the status
            of the upload

    Returns:
        the list of remote paths
    """
    filepaths = sample_collection.values("filepath")

    filename_maker = fou.UniqueFilenameMaker(
        output_dir=remote_dir, rel_dir=rel_dir
    )

    paths_map = {}
    for filepath in filepaths:
        if filepath not in paths_map:
            paths_map[filepath] = filename_maker.get_output_path(filepath)

    remote_paths = [paths_map[f] for f in filepaths]

    if not overwrite:
        fs = get_file_system(remote_dir)
        client = get_client(fs)
        existing = set(client.list_files_in_folder(remote_dir, recursive=True))
        paths_map = {f: r for f, r in paths_map.items() if r not in existing}

    inpaths, outpaths = zip(*paths_map.items())
    copy_files(
        inpaths, outpaths, skip_failures=skip_failures, progress=progress
    )

    if update_filepaths:
        sample_collection.set_values("filepath", remote_paths)

    return remote_paths


def run(fcn, tasks, num_workers=None, progress=False):
    """Applies the given function to each element of the given tasks.

    Args:
        fcn: a function that accepts a single argument
        tasks: an iterable of function aguments
        num_workers (None): the number of threads to use. By default,
            ``fiftyone.media_cache_config.num_workers`` is used
        progress (False): whether to render a progress bar tracking the status
            of the operation

    Returns:
        the list of function outputs
    """
    if num_workers is None:
        num_workers = fo.media_cache_config.num_workers

    try:
        num_tasks = len(tasks)
    except:
        num_tasks = None

    kwargs = dict(total=num_tasks, iters_str="files", quiet=not progress)

    if not num_workers or num_workers <= 1:
        with fou.ProgressBar(**kwargs) as pb:
            results = [fcn(task) for task in pb(tasks)]
    else:
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(**kwargs) as pb:
                results = list(pb(pool.imap(fcn, tasks)))

    return results


def _make_client(fs, num_workers=None):
    if num_workers is None:
        num_workers = fo.media_cache_config.num_workers

    kwargs = {}

    if num_workers is not None and num_workers > 10:
        kwargs["max_pool_connections"] = num_workers

    if fs == FileSystem.S3:
        credentials = _load_s3_credentials()
        return S3StorageClient(credentials=credentials, **kwargs)

    if fs == FileSystem.GCS:
        credentials = _load_gcs_credentials()
        return GoogleCloudStorageClient(credentials=credentials, **kwargs)

    if fs == FileSystem.MINIO:
        credentials = _load_minio_credentials()
        return MinIOStorageClient(credentials=credentials, **kwargs)

    if fs == FileSystem.HTTP:
        return HTTPStorageClient(**kwargs)

    raise ValueError("Unsupported file system '%s'" % fs)


def _load_s3_credentials():
    credentials, _ = S3StorageClient.load_credentials(
        credentials_path=fo.media_cache_config.aws_config_file,
        profile=fo.media_cache_config.aws_profile,
    )
    return credentials


def _load_gcs_credentials():
    credentials, _ = GoogleCloudStorageClient.load_credentials(
        credentials_path=fo.media_cache_config.google_application_credentials
    )
    return credentials


def _load_minio_credentials():
    credentials, _ = MinIOStorageClient.load_credentials(
        credentials_path=fo.media_cache_config.minio_config_file,
        profile=fo.media_cache_config.minio_profile,
    )
    return credentials


def _run(fcn, tasks, num_workers=None, progress=False):
    if num_workers is None:
        num_workers = fo.media_cache_config.num_workers

    try:
        num_tasks = len(tasks)
    except:
        num_tasks = None

    kwargs = dict(total=num_tasks, iters_str="files", quiet=not progress)

    if not num_workers or num_workers <= 1:
        with fou.ProgressBar(**kwargs) as pb:
            for task in pb(tasks):
                fcn(task)
    else:
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(**kwargs) as pb:
                for _ in pb(pool.imap_unordered(fcn, tasks)):
                    pass


def _do_copy_file(arg):
    inpath, outpath, skip_failures = arg

    try:
        _copy_file(inpath, outpath, cleanup=False)
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
            client = get_client(fso)
            client.upload(inpath, outpath)
            if cleanup:
                os.remove(inpath)
    elif fso == FileSystem.LOCAL:
        # Remote -> local
        client = get_client(fsi)
        client.download(inpath, outpath)
        if cleanup:
            client.delete(inpath)
    else:
        # Remote -> remote
        clienti = get_client(fsi)
        b = clienti.download_bytes(inpath)
        cliento = get_client(fso)
        cliento.upload_bytes(b, outpath)
        if cleanup:
            clienti.delete(inpath)


def _delete_file(filepath):
    fs = get_file_system(filepath)

    if fs == FileSystem.LOCAL:
        etau.delete_file(filepath)
        return

    client = get_client(fs)
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
