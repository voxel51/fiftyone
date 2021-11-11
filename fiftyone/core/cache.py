"""
Remote media caching.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
import io
import logging
import mimetypes
import multiprocessing
import multiprocessing.dummy
import os
import urllib.parse as urlparse

import eta.core.storage as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)

media_cache = None


def is_local(filepath):
    """Determines whether the given filepath is local.

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


def download_media(sample_collection, update=False, skip_failures=True):
    """Downloads the source media files for all samples in the collection.

    Any existing files are not re-downloaded, unless ``update == True`` and
    their checksums no longer match.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        update (False): whether to re-download media whose checksums no longer
            match
        skip_failures (True): whether to gracefully continue without
            raising an error if a remote file cannot be downloaded
    """
    filepaths = sample_collection.values("filepath")
    if update:
        media_cache.update(filepaths=filepaths, skip_failures=skip_failures)
    else:
        media_cache.get_local_paths(filepaths, skip_failures=skip_failures)


def upload_media(
    sample_collection,
    remote_dir,
    rel_dir=None,
    update_filepaths=False,
    overwrite=True,
    num_workers=None,
    skip_failures=True,
):
    """Uploads the source media files for the given collection to the given
    remote directory.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        remote_dir: an S3 or GCS "folder" into which to upload
        rel_dir (None): an optional relative directory to strip from each
            filepath when constructing the corresponding remote path. Providing
            a ``rel_dir`` enables writing nested subfolders within
            ``remote_dir`` matching the structure of the input collection's
            media. By default, the files are written directly to
        update_filepaths (False): whether to update the ``filepath`` of each
            sample in the collection to its remote path
        overwrite (True): whether to overwrite (True) or skip (False) existing
            remote files
        num_workers (None): the number of threads to use. By default,
            ``multiprocessing.cpu_count()`` is used
        skip_failures (True): whether to gracefully continue without raising an
            error if an upload fails

    Returns:
        the list of remote paths
    """
    fs = _get_file_system(remote_dir)

    if fs not in (FileSystem.S3, FileSystem.GCS):
        raise ValueError(
            "Cannot upload media to '%s'; unsupported file system '%s'"
            % (remote_dir, fs)
        )

    client = _make_client(fs, num_workers=num_workers)

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

    if num_workers is None:
        num_workers = multiprocessing.cpu_count()

    if tasks:
        _upload_media(tasks, num_workers)

    if update_filepaths:
        sample_collection.set_values("filepath", remote_paths)

    return remote_paths


class FileSystem(object):
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

    def __contains__(self, filepath):
        return self.is_local_or_cached(filepath)

    def __len__(self):
        return len(self._cache)

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
        """Returns stats about the cache.

        Returns:
            a stats dict
        """
        return {
            "cache_dir": self.cache_dir,
            "cache_size": self.cache_size,
            "cache_size_str": self.cache_size_str,
            "current_size": self.current_size,
            "current_size_str": self.current_size_str,
            "current_count": self.current_count,
            "load_factor": self.load_factor,
        }

    def is_local(self, filepath):
        """Determines whether the given filepath is local.

        Args:
            filepath: a filepath

        Returns:
            True/False
        """
        fs = _get_file_system(filepath)
        return fs == FileSystem.LOCAL

    def is_local_or_cached(self, filepath):
        """Determines whether the given filepath is either local or a remote
        file that has been cached.

        Args:
            filepath: a filepath

        Returns:
            True/False
        """
        fs, _, exists, _ = self._parse_filepath(filepath)
        return fs == FileSystem.LOCAL or exists

    def is_remote_uncached_video(self, filepath):
        """Determines whether the given filepath is a remote video that is not
        in the local cache.

        Args:
            filepath: a filepath

        Returns:
            True/False
        """
        fs, local_path, exists, _ = self._parse_filepath(filepath)
        return (
            fs != FileSystem.LOCAL
            and not exists
            and self._is_video(local_path)
        )

    def generate_signed_url(self, filepath, **kwargs):
        """Generates a signed URL for accessing the given remote filepath.

        Args:
            filepath: a filepath
            **kwargs: optional keyword arguments for
                :meth:`S3StorageClient.generate_signed_url` or
                :meth:`GoogleCloudStorageClient.generate_signed_url`

        Returns:
            the signed URL
        """
        fs = _get_file_system(filepath)
        client = self._get_client(fs)

        return client.generate_signed_url(filepath, **kwargs)

    def get_remote_file_metadata(self, filepath, skip_failures=True):
        """Retrieves the file metadata for the given remote filepath, if
        possible.

        The returned value may be ``None`` if file metadata could not be
        retrieved.

        Args:
            filepath: a filepath
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file's metadata cannot be computed

        Returns:
            a file metdata dict, or ``None``
        """
        fs = _get_file_system(filepath)
        client = self._get_client(fs)

        task = (client, filepath, skip_failures)
        _, metadata = _do_get_file_metadata(task)

        return metadata

    def get_remote_file_metadatas(self, filepaths, skip_failures=True):
        """Returns a dictionary mapping any uncached remote filepaths in the
        provided list to file metadata dicts retrieved from the remote source.

        Values may be ``None`` if file metadata could not be retrieved for a
        given remote file.

        Args:
            filepaths: a list of filepaths
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file's metadata cannot be computed

        Returns:
            a dict mapping remote filepaths to file metadata dicts, or ``None``
        """
        tasks = []
        seen = set()
        for filepath in filepaths:
            fs, _, exists, client = self._parse_filepath(filepath)
            if fs == FileSystem.LOCAL or filepath in seen:
                continue

            seen.add(filepath)

            if not exists:
                tasks.append((client, filepath, skip_failures))

        if not tasks:
            return {}

        return _get_file_metadata(tasks, self.num_workers)

    def get_remote_video_metadata(self, filepath, skip_failures=True):
        """Retrieves the :class:`fiftyone.core.metadata.VideoMetadata` instance
        for the given remote video.

        Args:
            filepath: a filepath
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file's metadata cannot be computed

        Returns:
            a :class:`fiftyone.core.metadata.VideoMetadata` or ``None``
        """
        fs = _get_file_system(filepath)
        client = self._get_client(fs)

        task = (client, filepath, skip_failures)
        _, metadata = _do_get_video_metadata(task)

        return metadata

    def get_remote_video_metadatas(self, filepaths, skip_failures=True):
        """Returns a dictionary mapping any uncached remote video filepaths in
        the provided list to :class:`fiftyone.core.metadata.VideoMetadata`
        instances computed from the remote source.

        Metadata is computed by applying ``ffprobe`` to the cloud object via a
        signed URL.

        Values may be ``None`` if metadata could not be retrieved for a given
        remote video.

        Args:
            filepaths: a list of filepaths
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file's metadata cannot be computed

        Returns:
            a dict mapping remote video filepaths to
            :class:`fiftyone.core.metadata.VideoMetadata` objects, or ``None``
        """
        tasks = []
        seen = set()
        for filepath in filepaths:
            fs, local_path, exists, client = self._parse_filepath(filepath)
            if fs == FileSystem.LOCAL or filepath in seen:
                continue

            seen.add(filepath)

            if not exists and self._is_video(local_path):
                tasks.append((client, filepath, skip_failures))

        if not tasks:
            return {}

        return _get_video_metadata(tasks, self.num_workers)

    def get_remote_content(self, filepath, start=None, end=None):
        """Gets the content for the given remote filepath.

        Args:
            filepath: a filepath
            start (None): an optional start of a byte range to get
            end (None): an optional end of a byte range to get

        Returns:
            a bytes string
        """
        fs = _get_file_system(filepath)
        client = self._get_client(fs)
        return client.download_bytes(filepath, start=start, end=end)

        """
        chunk_size = 64 * 1024
        with io.BytesIO() as f:
            client.download_stream(filepath, f)
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    return

                yield chunk
        """

    def get_local_path(
        self, filepath, download_media=True, skip_failures=True
    ):
        """Retrieves the local path for the given media file.

        Args:
            filepath: a filepath
            download_media (True): whether to download the remote media if it
                is not cached
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file cannot be downloaded

        Returns:
            the local filepath
        """
        _, local_path, exists, client = self._parse_filepath(filepath)

        if exists or not download_media:
            return local_path

        task = (client, filepath, local_path, skip_failures, False)
        _do_download_media(task)

        return local_path

    def get_local_paths(
        self, filepaths, download_media=True, skip_failures=True
    ):
        """Retrieves the local paths for the given media files.

        Args:
            filepaths: a list of filepaths
            download_media (True): whether to download any remote media if it
                is not cached
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file cannot be downloaded

        Returns:
            the list of local filepaths
        """
        local_paths = []
        tasks = []
        seen = set()
        for filepath in filepaths:
            fs, local_path, exists, client = self._parse_filepath(filepath)
            local_paths.append(local_path)

            if fs == FileSystem.LOCAL or filepath in seen:
                continue

            seen.add(filepath)

            if download_media and not exists:
                task = (client, filepath, local_path, skip_failures, False)
                tasks.append(task)

        if tasks:
            _download_media(tasks, self.num_workers)

        return local_paths

    def update(self, filepaths=None, skip_failures=True):
        """Re-downloads any cached files whose checksum no longer matches their
        remote source.

        Any remote files that have been deleted are also deleted from the
        cache.

        Args:
            filepaths (None): an optional list of remote files to check for
                updates. By default, the entire cache is updated
            skip_failures (True): whether to gracefully continue without
                raising an error if a remote file cannot be downloaded
        """
        if filepaths is None:
            filepaths = self._cache.keys()

        tasks = []
        seen = set()
        for filepath in filepaths:
            fs, local_path, _, client = self._parse_filepath(filepath)
            if fs == FileSystem.LOCAL or filepath in seen:
                continue

            seen.add(filepath)
            tasks.append((client, filepath))

        if not tasks:
            return

        checksums = _get_checksums(tasks, self.num_workers)

        tasks = []
        for filepath, checksum in checksums.items():
            result = self._cache.get(filepath, None)
            if result is not None:
                local_path, success, cached_checksum, _ = result
                fs = None
                client = None
            else:
                fs, local_path, _, client = self._parse_filepath(filepath)
                cached_checksum = None
                success = True

            if success and checksum is None:
                # We were previously able to download the file but now failed
                # to retrieve its checksum, assume the file was deleted
                self._pop_cache(filepath)
            elif cached_checksum != checksum or not checksum:
                #
                # Any of the following things may have happened
                #   - The checksum changed
                #   - The remote download failed previously
                #   - The remote client doesn't support checksums
                #
                # In all cases, we need to re-download now
                #
                if fs is None:
                    fs = _get_file_system(filepath)

                if client is None:
                    client = self._get_client(fs)

                task = (client, filepath, local_path, skip_failures, True)
                tasks.append(task)

        if tasks:
            _download_media(tasks, self.num_workers)

    def clear(self):
        """Clears the cache."""
        if os.path.isdir(self.cache_dir):
            etau.delete_dir(self.cache_dir)

        self._cache = OrderedDict()
        self._current_size = 0

    def save(self):
        """Writes a manifest for the current cache to disk."""
        if self._cache:
            _write_manifest(self._cache, self.cache_manifest_path)

    def sync(self, save=True):
        """Syncs the cache with the contents of the cache manifest on disk.

        Args:
            save (True): whether to write the merged cache to disk
        """
        try:
            cache, _ = _read_manifest(self.cache_manifest_path)
        except:
            cache = {}

        if cache:
            self._merge_cache(cache)

        if save:
            self.save()

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

    def _get_client(self, fs):
        if fs == FileSystem.S3:
            if self._s3_client is None:
                self._s3_client = _make_client(
                    fs, num_workers=self.num_workers
                )

            return self._s3_client

        if fs == FileSystem.GCS:
            if self._gcs_client is None:
                self._gcs_client = _make_client(
                    fs, num_workers=self.num_workers
                )

            return self._gcs_client

        if fs == FileSystem.HTTP:
            if self._http_client is None:
                self._http_client = _make_client(
                    fs, num_workers=self.num_workers
                )

            return self._http_client

        return None

    def _parse_filepath(self, filepath):
        fs = _get_file_system(filepath)

        # Always return `exists=True` for local filepaths
        if fs == FileSystem.LOCAL:
            return fs, filepath, True, None

        # Retrieve local path from cache if possible
        # We always pop and re-insert so that oldest files are deleted first
        result = self._cache.pop(filepath, None)
        if result is not None:
            local_path, success, _, _ = result

            if success:
                exists = os.path.isfile(local_path)
            else:
                # If we were unable to download the remote file in the first
                # place, report that the file exists to avoid retried downloads
                exists = True

            if exists:
                client = None
            else:
                client = self._get_client(fs)

            self._cache[filepath] = result
            return fs, local_path, exists, client

        client = self._get_client(fs)
        local_path = os.path.join(
            self.cache_dir, fs, client.get_local_path(filepath)
        )

        return fs, local_path, False, client

    def _is_video(self, filepath):
        mime_type = mimetypes.guess_type(filepath)[0]
        return mime_type.startswith("video")

    def _merge_cache(self, cache):
        for filepath, result in cache.items():
            if filepath not in self._cache:
                self._cache[filepath] = result
                self._current_size += result[-1]

    def _add_cache(self, filepath, local_path, success, checksum):
        if success:
            size_bytes = os.path.getsize(local_path)
        else:
            size_bytes = 0

        while self._current_size + size_bytes > self.cache_size:
            if not self._pop_oldest():
                break

        if checksum is None:
            checksum = ""

        self._current_size += size_bytes
        self._cache[filepath] = (local_path, success, checksum, size_bytes)

    def _pop_cache(self, filepath):
        result = self._cache.pop(filepath, None)
        if result is None:
            return

        local_path, _, _, size_bytes = result

        self._current_size -= size_bytes
        _delete_file(local_path)

    def _pop_oldest(self):
        try:
            _, (del_path, _, _, del_size) = self._cache.popitem(last=False)
        except KeyError:
            return False

        self._current_size -= del_size
        _delete_file(del_path)

        return True


def _read_manifest(manifest_path):
    cache = OrderedDict()
    total_size = 0

    with open(manifest_path, "r") as f:
        for line in f.read().splitlines():
            (
                filepath,
                local_path,
                success_str,
                checksum,
                size_bytes_str,
            ) = line.split(",")
            success = success_str == "True"
            size_bytes = int(size_bytes_str)
            cache[filepath] = (local_path, success, checksum, size_bytes)
            total_size += size_bytes

    return cache, total_size


def _write_manifest(cache, manifest_path):
    etau.ensure_basedir(manifest_path)
    with open(manifest_path, "w") as f:
        for fp, (lp, ss, cs, sb) in cache.items():
            f.write("%s,%s,%s,%s,%d\n" % (fp, lp, ss, cs, sb))


def _delete_file(local_path):
    try:
        os.remove(local_path)
    except FileNotFoundError:
        pass


def _upload_media(tasks, num_workers):
    logger.info("Uploading media files...")
    if not num_workers or num_workers <= 1:
        with fou.ProgressBar() as pb:
            for task in pb(tasks):
                _do_upload_media(task)
    else:
        # urllib3_logger = logging.getLogger("urllib3")
        # with fou.SetAttributes(urllib3_logger, level=logging.ERROR):
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(total=len(tasks)) as pb:
                results = pool.imap_unordered(_do_upload_media, tasks)
                for _ in pb(results):
                    pass


def _do_upload_media(arg):
    client, local_path, remote_path, skip_failures = arg

    try:
        client.upload(local_path, remote_path)
    except Exception as e:
        if not skip_failures:
            raise

        logger.warning(e)


def _download_media(tasks, num_workers):
    logger.info("Downloading media files...")
    if not num_workers or num_workers <= 1:
        with fou.ProgressBar() as pb:
            for task in pb(tasks):
                _do_download_media(task)
    else:
        # urllib3_logger = logging.getLogger("urllib3")
        # with fou.SetAttributes(urllib3_logger, level=logging.ERROR):
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(total=len(tasks)) as pb:
                results = pool.imap_unordered(_do_download_media, tasks)
                for _ in pb(results):
                    pass


def _do_download_media(arg):
    client, remote_path, local_path, skip_failures, force = arg

    success = True
    if force or not os.path.isfile(local_path):
        try:
            client.download(remote_path, local_path)
        except Exception as e:
            if not skip_failures:
                raise

            logger.warning(e)
            success = False

    if success:
        _, checksum = _do_get_checksum((client, remote_path))
    else:
        checksum = None

    media_cache._add_cache(remote_path, local_path, success, checksum)


def _get_checksums(tasks, num_workers):
    checksums = {}

    logger.info("Getting checksums...")
    if not num_workers or num_workers <= 1:
        with fou.ProgressBar() as pb:
            for task in pb(tasks):
                filepath, checksum = _do_get_checksum(task)
                checksums[filepath] = checksum
    else:
        # urllib3_logger = logging.getLogger("urllib3")
        # with fou.SetAttributes(urllib3_logger, level=logging.ERROR):
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(total=len(tasks)) as pb:
                results = pool.imap_unordered(_do_get_checksum, tasks)
                for filepath, checksum in pb(results):
                    checksums[filepath] = checksum

    return checksums


def _do_get_checksum(arg):
    client, remote_path = arg

    if hasattr(client, "get_file_metadata"):
        try:
            metadata = client.get_file_metadata(remote_path)
            checksum = metadata["checksum"]
        except:
            checksum = None
    else:
        checksum = ""

    return remote_path, checksum


def _get_video_metadata(tasks, num_workers):
    metadata = {}

    logger.info("Getting video metadata...")
    if not num_workers or num_workers <= 1:
        with fou.ProgressBar() as pb:
            for task in pb(tasks):
                filepath, _meta = _do_get_video_metadata(task)
                metadata[filepath] = _meta
    else:
        # urllib3_logger = logging.getLogger("urllib3")
        # with fou.SetAttributes(urllib3_logger, level=logging.ERROR):
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(total=len(tasks)) as pb:
                results = pool.imap_unordered(_do_get_video_metadata, tasks)
                for filepath, _meta in pb(results):
                    metadata[filepath] = _meta

    return metadata


def _do_get_video_metadata(arg):
    client, remote_path, skip_failures = arg

    mime_type = mimetypes.guess_type(remote_path)[0]

    if hasattr(client, "generate_signed_url"):
        video_path = client.generate_signed_url(remote_path)
    else:
        video_path = remote_path

    try:
        metadata = fo.VideoMetadata.build_for(video_path)
        metadata.mime_type = mime_type
    except Exception as e:
        if not skip_failures:
            raise

        logger.warning(e)
        metadata = None

    return remote_path, metadata


def _get_file_metadata(tasks, num_workers):
    metadata = {}

    logger.info("Getting metadata...")
    if not num_workers or num_workers <= 1:
        with fou.ProgressBar() as pb:
            for task in pb(tasks):
                filepath, _meta = _do_get_file_metadata(task)
                metadata[filepath] = _meta
    else:
        # urllib3_logger = logging.getLogger("urllib3")
        # with fou.SetAttributes(urllib3_logger, level=logging.ERROR):
        with multiprocessing.dummy.Pool(processes=num_workers) as pool:
            with fou.ProgressBar(total=len(tasks)) as pb:
                results = pool.imap_unordered(_do_get_file_metadata, tasks)
                for filepath, _meta in pb(results):
                    metadata[filepath] = _meta

    return metadata


def _do_get_file_metadata(arg):
    client, remote_path, skip_failures = arg

    try:
        metadata = client.get_file_metadata(remote_path)
    except Exception as e:
        if not skip_failures:
            raise

        logger.warning(e)
        metadata = None

    return remote_path, metadata


def _get_file_system(path):
    if path.startswith("http"):
        return FileSystem.HTTP

    if path.startswith("gs://"):
        return FileSystem.GCS

    if path.startswith("s3://"):
        return FileSystem.S3

    return FileSystem.LOCAL


def _make_client(fs, num_workers=None):
    if fs == FileSystem.S3:
        profile = fo.media_cache_config.aws_profile
        credentials_path = fo.media_cache_config.aws_config_file
        credentials, _ = S3StorageClient.load_credentials(
            credentials_path=credentials_path, profile=profile
        )

        kwargs = {}
        if num_workers is not None and num_workers > 10:
            kwargs["max_pool_connections"] = num_workers

        return S3StorageClient(credentials=credentials, **kwargs)

    if fs == FileSystem.GCS:
        credentials_path = fo.media_cache_config.google_application_credentials
        credentials, _ = GoogleCloudStorageClient.load_credentials(
            credentials_path=credentials_path
        )

        kwargs = {}
        if num_workers is not None and num_workers > 10:
            kwargs["max_pool_connections"] = num_workers

        return GoogleCloudStorageClient(credentials=credentials, **kwargs)

    if fs == FileSystem.HTTP:
        kwargs = {}
        if num_workers is not None and num_workers > 10:
            kwargs["max_pool_connections"] = num_workers

        return HTTPStorageClient(**kwargs)

    raise ValueError("Unsupported file system '%s'" % fs)
