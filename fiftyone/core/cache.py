"""
Remote media caching.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
from enum import Enum
import logging
from multiprocessing.pool import ThreadPool
import os
import urllib.parse as urlparse

import eta.core.storage as etas
import eta.core.utils as etau

import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)

media_cache = None


def is_local_path(filepath):
    """Determines whether the given filepath is a local path.

    Args:
        filepath: a filepath

    Returns:
        True/False
    """
    fs = _get_file_system(filepath)
    return fs == FileSystem.LOCAL


def init_media_cache(config):
    """Initializes the media cache.

    Args:
        config: a :class:`fiftyone.core.config.MediaCacheConfig`
    """
    global media_cache

    media_cache = MediaCache(config)


def download_media(sample_collection, skip_failures=True):
    """Downloads the source media files for all samples in the collection.

    This method is only applicable to datasets whose source media files are
    stored in remote (e.g., cloud) storage.

    Any existing files are not re-downloaded.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        skip_failures (True): whether to gracefully continue without
            raising an error if a remote file cannot be downloaded
    """
    filepaths = sample_collection.values("filepath")
    media_cache.get_local_paths(filepaths, skip_failures=skip_failures)


class FileSystem(Enum):
    """Enumeration of the available file systems."""

    HTTP = "http"
    S3 = "s3"
    GCS = "gcs"
    LOCAL = "local"


class HTTPStorageClient(etas.HTTPStorageClient):
    """.. autoclass:: eta.core.storage.HTTPStorageClient"""

    @staticmethod
    def get_local_path(remote_path):
        return os.path.basename(urlparse.urlparse(remote_path).path)


class S3StorageClient(etas.S3StorageClient):
    """.. autoclass:: eta.core.storage.S3StorageClient"""

    @staticmethod
    def get_local_path(remote_path):
        prefix, path = remote_path[:5], remote_path[5:]
        if prefix != "s3://":
            raise ValueError("Invalid S3 path '%s'" % remote_path)

        return path


class GoogleCloudStorageClient(etas.GoogleCloudStorageClient):
    """.. autoclass:: eta.core.storage.GoogleCloudStorageClient"""

    @staticmethod
    def get_local_path(remote_path):
        prefix, path = remote_path[:5], remote_path[5:]
        if prefix != "gs://":
            raise ValueError("Invalid GCS path '%s'" % remote_path)

        return path


class MediaCache(object):
    """Media cache that automatically manages the downloading of remote media
    files stored in S3, GCS, or web URLs.

    Args:
        config: a :class:`fiftyone.core.config.MediaCacheConfig`
    """

    def __init__(self, config):
        self.config = config

        self._cache = None
        self._current_size = None

        self._s3_client = None
        self._gcs_client = None
        self._http_client = None
        self._gdrive_client = None

        self._init()

    @property
    def cache_dir(self):
        return self.config.cache_dir

    @property
    def cache_manifest_path(self):
        return os.path.join(self.cache_dir, "manifest.txt")

    @property
    def cache_size(self):
        return self.config.cache_size_bytes

    @property
    def cache_size_str(self):
        return etau.to_human_bytes_str(self.cache_size)

    @property
    def current_size(self):
        return self._current_size

    @property
    def current_size_str(self):
        return etau.to_human_bytes_str(self.current_size)

    @property
    def current_count(self):
        return len(self._cache)

    @property
    def load_factor(self):
        return self.current_size / self.cache_size

    @property
    def num_workers(self):
        return self.config.num_workers

    def stats(self):
        """Returns stats about the media cache.

        Returns:
            a stats dict
        """
        return {
            "cache_dir": self.cache_dir,
            "cache_size": self.cache_size,
            "current_size": self.current_size,
            "cache_size_str": self.cache_size_str,
            "current_size_str": self.current_size_str,
            "current_count": self.current_count,
            "load_factor": self.load_factor,
        }

    def get_local_path(self, filepath, skip_failures=True):
        """Retrieves the local path for the given media file.

        Remote files are downloaded to the local media cache, if necessary.

        Args:
            filepath: a filepath
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file cannot be downloaded

        Returns:
            the local filepath
        """
        local_path, exists, client = self._get_local_path(filepath)

        if exists:
            return local_path

        task = (client, filepath, local_path, skip_failures)
        _, checksum = _do_download_media(task)

        self._update_cache(filepath, local_path, checksum)

        return local_path

    def get_local_paths(self, filepaths, skip_failures=True):
        """Retrieves the local paths for the given media files.

        Remote files are downloaded to the local media cache, if necessary.

        Args:
            filepaths: a list of filepaths
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file cannot be downloaded

        Returns:
            the list of local filepaths
        """
        local_paths = []
        tasks = []
        for filepath in filepaths:
            local_path, exists, client = self._get_local_path(filepath)
            local_paths.append(local_path)
            if not exists:
                tasks.append((client, filepath, local_path, skip_failures))

        if tasks:
            checksums = _download_media(tasks, self.num_workers)

            for _, filepath, local_path, _ in tasks:
                checksum = checksums[filepath]
                self._update_cache(filepath, local_path, checksum)

        return local_paths

    def update(self, filepaths=None, skip_failures=True):
        """Re-downloads any cached files whose checksum no longer matches their
        remote source.

        The cached versions of any remote files that have been deleted are
        deleted from the cache.

        Args:
            filepaths (None): an optional list of remote files to check for
                updates. By default, the entire cache is updated
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file cannot be downloaded
        """
        if filepaths is None:
            filepaths = self._cache.keys()
        else:
            filepaths = [f for f in filepaths if f in self._cache]

        tasks = []
        for filepath in filepaths:
            fs = _get_file_system(filepath)
            if fs != FileSystem.LOCAL:
                client = self._get_client(fs)
                tasks.append((client, filepath))

        if not tasks:
            return

        checksums = _get_checksums(tasks, self.num_workers)

        tasks = []
        for filepath, checksum in checksums.items():
            local_path, cached_checksum, _ = self._cache[filepath][1]
            if not checksum:
                # Assume file was deleted from remote
                os.remove(local_path)
            elif cached_checksum != checksum:
                # Must re-download
                client = self._get_client(_get_file_system(filepath))
                tasks.append((client, filepath, local_path, skip_failures))

        if tasks:
            checksums = _download_media(tasks, self.num_workers)

            for _, filepath, local_path, _ in tasks:
                checksum = checksums[filepath]
                self._update_cache(filepath, local_path, checksum)

    def clear(self):
        """Clears the media cache."""
        etau.delete_dir(self.cache_dir)
        self._cache = OrderedDict()
        self._current_size = 0

    def save(self):
        """Writes a manifest for the current cache to disk."""
        if self._cache:
            _write_manifest(self._cache, self.cache_manifest_path)

    def _init(self):
        manifest_path = self.cache_manifest_path

        if not os.path.isfile(manifest_path):
            self.clear()
            return

        try:
            cache, total_size = _read_manifest(manifest_path)
        except Exception as e:
            logger.warning(
                "Failed to load cache manifest '%s' with error %s",
                manifest_path,
                e,
            )
            self.clear()
            return

        self._cache = cache
        self._current_size = total_size

    def _update_cache(self, filepath, local_path, checksum):
        size_bytes = os.path.getsize(local_path)

        while self._current_size + size_bytes > self.cache_size:
            try:
                _, (del_path, del_size) = self._cache.popitem(last=False)
            except KeyError:
                break

            self._current_size -= del_size

            try:
                os.remove(del_path)
            except FileNotFoundError:
                pass

        self._current_size += size_bytes
        self._cache[filepath] = (local_path, checksum, size_bytes)

    def _get_local_path(self, filepath):
        fs = _get_file_system(filepath)

        if fs == FileSystem.LOCAL:
            return filepath, True, None

        result = self._cache.pop(filepath, None)
        if result is not None:
            self._cache[filepath] = result
            return result[0], True, None

        client = self._get_client(fs)
        local_path = os.path.join(
            self.cache_dir, fs, client.get_local_path(filepath)
        )

        return local_path, False, client

    def _get_client(self, fs):
        if fs == FileSystem.HTTP:
            if self._http_client is None:
                self._http_client = HTTPStorageClient()

            return self._http_client

        if fs == FileSystem.S3:
            if self._s3_client is None:
                self._s3_client = S3StorageClient()

            return self._s3_client

        if fs == FileSystem.GCS:
            if self._gcs_client is None:
                self._gcs_client = GoogleCloudStorageClient()

            return self._gcs_client

        return None


def _read_manifest(manifest_path):
    cache = OrderedDict()
    total_size = 0

    with open(manifest_path, "r") as f:
        for line in f.read().splitlines():
            filepath, local_path, checksum, size_bytes_str = line.split(",")
            size_bytes = int(size_bytes_str)
            cache[filepath] = (local_path, checksum, size_bytes)
            total_size += size_bytes

    return cache, total_size


def _write_manifest(cache, manifest_path):
    etau.ensure_basedir(manifest_path)
    with open(manifest_path, "w") as f:
        for fp, (lp, cs, sb) in cache.items():
            f.write("%s,%s,%s,%d\n" % (fp, lp, cs, sb))


def _download_media(tasks, num_workers):
    checksums = {}

    logger.info("Downloading media files...")
    if not num_workers or num_workers <= 1:
        with fou.ProgressBar() as pb:
            for task in pb(tasks):
                filepath, checksum = _do_download_media(task)
                checksums[filepath] = checksum
    else:
        with fou.ProgressBar(total=len(tasks)) as pb:
            with ThreadPool(processes=num_workers) as pool:
                results = pool.imap_unordered(_do_download_media, tasks)
                for filepath, checksum in pb(results):
                    checksums[filepath] = checksum

    return checksums


def _get_checksums(tasks, num_workers):
    checksums = {}

    logger.info("Getting checksums...")
    if not num_workers or num_workers <= 1:
        with fou.ProgressBar() as pb:
            for task in pb(tasks):
                filepath, checksum = _do_get_checksum(task)
                checksums[filepath] = checksum
    else:
        with fou.ProgressBar(total=len(tasks)) as pb:
            with ThreadPool(processes=num_workers) as pool:
                results = pool.imap_unordered(_do_get_checksum, tasks)
                for filepath, checksum in pb(results):
                    checksums[filepath] = checksum

    return checksums


def _do_download_media(arg):
    client, remote_path, local_path, skip_failures = arg

    try:
        client.download(remote_path, local_path)
    except Exception as e:
        if not skip_failures:
            raise

        logger.warning(e)

    return _do_get_checksum((client, remote_path))


def _do_get_checksum(arg):
    client, remote_path = arg

    try:
        metadata = client.get_file_metadata(remote_path)
    except:
        metadata = {}

    checksum = metadata.get("checksum", "")

    return remote_path, checksum


def _get_file_system(path):
    if path.startswith("http"):
        return FileSystem.HTTP

    if path.startswith("gs://"):
        return FileSystem.GCS

    if path.startswith("s3://"):
        return FileSystem.S3

    return FileSystem.LOCAL
