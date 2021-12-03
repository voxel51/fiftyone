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
import multiprocessing
import multiprocessing.dummy
import os
import posixpath
import re
import six
import urllib.parse as urlparse

import ndjson
from wcmatch import glob

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


def is_local(path):
    """Determines whether the given path is local.

    Args:
        path: a path

    Returns:
        True/False
    """
    return get_file_system(path) == FileSystem.LOCAL


def get_client(fs):
    """Returns the storage client for the given file system.

    Args:
        fs: a :class:`FileSystem` enum

    Returns:
        a :class:`eta.core.storage.StorageClient`
    """
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


@contextmanager
def open_file(path, mode="r"):
    """Opens the given file for reading or writing.

    This function *must* be used as a context manager.

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


def delete_file(path):
    """Deletes the file at the given path and recursively deletes any empty
    directories from the resulting directory tree.

    Args:
        path: the filepath
    """
    fs = get_file_system(path)

    if fs == FileSystem.LOCAL:
        etau.delete_file(path)
        return

    client = get_client(fs)
    client.delete(path)


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
    fs = get_file_system(path)

    if fs == FileSystem.LOCAL:
        etau.ensure_basedir(path)


def ensure_dir(dirpath):
    """Makes the given directory, if necessary.

    Args:
        dirpath: the directory path
    """
    fs = get_file_system(dirpath)

    if fs == FileSystem.LOCAL:
        etau.ensure_dir(dirpath)


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


def join(a, *p):
    """Generalization of ``os.path.join`` that correctly handles cloud paths on
    Windows.

    Args:
        a: the root
        *p: additional path components

    Returns:
        the joined path
    """
    fs = get_file_system(a)

    if fs == FileSystem.LOCAL:
        return os.path.join(a, *p)

    return posixpath.join(a, *p)


def list_files(
    dir_path,
    abs_paths=False,
    recursive=False,
    include_hidden_files=False,
    sort=True,
):
    """Lists the files in the given local or remote directory.

    If the directory does not exist, an empty list is returned.

    Args:
        dir_path: the path to the directory to list
        abs_paths (False): whether to return the absolute paths to the files
        recursive (False): whether to recursively traverse subdirectories
        include_hidden_files (False): whether to include dot files
        sort (True): whether to sort the list of files

    Returns:
        a list of filepaths
    """
    fs = get_file_system(dir_path)

    if fs == FileSystem.LOCAL:
        if not os.path.isdir(dir_path):
            return []

        return etau.list_files(
            dir_path,
            abs_paths=abs_paths,
            recursive=recursive,
            include_hidden_files=include_hidden_files,
            sort=sort,
        )

    client = get_client(fs)

    filepaths = client.list_files_in_folder(dir_path, recursive=recursive)

    if not abs_paths:
        filepaths = [os.path.relpath(f, dir_path) for f in filepaths]

    if not include_hidden_files:
        filepaths = [
            f for f in filepaths if not os.path.basename(f).startswith(".")
        ]

    if sort:
        filepaths = sorted(filepaths)

    return filepaths


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


def download_files(remote_paths, local_paths, skip_failures=True):
    """Downloads the given remote files.

    Args:
        remote_paths: a list of remote paths
        local_paths: a list of local paths
        skip_failures (True): whether to gracefully continue without raising an
            error if a download fails
    """
    tasks = []
    for remote_path, local_path in zip(remote_paths, local_paths):
        fs = get_file_system(remote_path)
        client = get_client(fs)
        tasks.append((client, remote_path, local_path, skip_failures))

    if tasks:
        _run_tasks(_do_download_media, tasks)


def upload_files(local_paths, remote_paths, skip_failures=True):
    """Uploads the given files to the remote locations.

    Args:
        local_paths: a list of local paths
        remote_paths: a list of remote paths
        skip_failures (True): whether to gracefully continue without raising an
            error if an upload fails
    """
    tasks = []
    for local_path, remote_path in zip(local_paths, remote_paths):
        fs = get_file_system(remote_path)
        client = get_client(fs)
        tasks.append((client, local_path, remote_path, skip_failures))

    if tasks:
        _run_tasks(_do_upload_media, tasks)


def upload_media(
    sample_collection,
    remote_dir,
    rel_dir=None,
    update_filepaths=False,
    overwrite=True,
    skip_failures=True,
):
    """Uploads the source media files for the given collection to the given
    remote "folder".

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        remote_dir: a remote "folder" into which to upload
        rel_dir (None): an optional relative directory to strip from each
            filepath when constructing the corresponding remote path. Providing
            a ``rel_dir`` enables writing nested subfolders within
            ``remote_dir`` matching the structure of the input collection's
            media. By default, the files are written directly to ``remote_dir``
            using their basenames
        update_filepaths (False): whether to update the ``filepath`` of each
            sample in the collection to its remote path
        overwrite (True): whether to overwrite (True) or skip (False) existing
            remote files
        skip_failures (True): whether to gracefully continue without raising an
            error if an upload fails

    Returns:
        the list of remote paths
    """
    fs = get_file_system(remote_dir)

    if fs not in (FileSystem.S3, FileSystem.GCS, FileSystem.MINIO):
        raise ValueError(
            "Cannot upload media to '%s'; unsupported file system '%s'"
            % (remote_dir, fs)
        )

    client = get_client(fs)

    filepaths = sample_collection.values("filepath")

    remote_paths = []
    for filepath in filepaths:
        if rel_dir is not None:
            rel_path = os.path.relpath(filepath, rel_dir)
        else:
            rel_path = os.path.basename(filepath)

        remote_paths.append(os.path.join(remote_dir, rel_path))

    if overwrite:
        existing_files = set()
    else:
        existing_files = set(
            client.list_files_in_folder(remote_dir, recursive=True)
        )

    tasks = []
    for filepath, remote_path in zip(filepaths, remote_paths):
        if remote_path not in existing_files:
            tasks.append((client, filepath, remote_path, skip_failures))

    if tasks:
        _run_tasks(_do_upload_media, tasks)

    if update_filepaths:
        sample_collection.set_values("filepath", remote_paths)

    return remote_paths


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


def _run_tasks(fcn, tasks, num_workers=None):
    if num_workers is None:
        num_workers = fo.media_cache_config.num_workers

    if not num_workers or num_workers <= 1:
        with fou.ProgressBar() as pb:
            for task in pb(tasks):
                fcn(task)
    else:
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(total=len(tasks)) as pb:
                for _ in pb(pool.imap_unordered(fcn, tasks)):
                    pass


def _do_download_media(arg):
    client, remote_path, local_path, skip_failures = arg

    try:
        client.download(remote_path, local_path)
    except Exception as e:
        if not skip_failures:
            raise

        logger.warning(e)


def _do_upload_media(arg):
    client, local_path, remote_path, skip_failures = arg

    try:
        client.upload(local_path, remote_path)
    except Exception as e:
        if not skip_failures:
            raise

        logger.warning(e)


class _BytesIO(io.BytesIO):
    def write(self, str_or_bytes):
        super().write(_to_bytes(str_or_bytes))


def _to_bytes(val, encoding="utf-8"):
    b = val.encode(encoding) if isinstance(val, six.text_type) else val
    if not isinstance(b, six.binary_type):
        raise TypeError("Failed to convert %s to bytes" % type(b))

    return b
